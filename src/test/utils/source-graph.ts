import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve, sep } from "node:path";

const SRC = resolve(process.cwd(), "src");

export type SourceFile = {
  /** The path from the project root in posix form: `src/lib/api/client.ts`. */
  readonly path: string;
  readonly text: string;
  /** Static imports and re-exports. */
  readonly imports: readonly string[];
  /**
   * The subset of those that survive compilation. `import type` and a brace
   * list whose every name is prefixed with `type` are erased, so they say
   * nothing about what a person downloads - and a graph that counts them
   * reports a chunk that is not there.
   */
  readonly valueImports: readonly string[];
  /** Dynamic import(...) calls. */
  readonly dynamicImports: readonly string[];
};

const CODE = /\.(ts|tsx)$/;

function walk(dir: string, found: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (CODE.test(entry)) found.push(full);
  }
  return found;
}

function toPosix(absolute: string): string {
  return absolute
    .slice(resolve(process.cwd()).length + 1)
    .split(sep)
    .join(posix.sep);
}

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)([\s\S]*?)from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function matchAll(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

/** Whether what stands between `import` and `from` names types and nothing else. */
function typeOnly(clause: string): boolean {
  if (/^\s*type\s/.test(clause)) return true;
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces === null) return false;
  // A default or namespace binding beside the braces is a value in itself.
  if (clause.slice(0, braces.index).replace(/[\s,]/g, "") !== "") return false;
  const names = (braces[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return names.length > 0 && names.every((name) => /^type\s/.test(name));
}

export function readSources(): readonly SourceFile[] {
  return walk(SRC, []).map((absolute) => {
    const text = readFileSync(absolute, "utf8");
    const statics = [...text.matchAll(STATIC_IMPORT)].map((match) => ({
      specifier: match[2] ?? "",
      erased: typeOnly(match[1] ?? ""),
    }));
    const bare = matchAll(text, BARE_IMPORT);

    return {
      path: toPosix(absolute),
      text,
      imports: [...statics.map((entry) => entry.specifier), ...bare],
      valueImports: [
        ...statics.filter((entry) => !entry.erased).map((entry) => entry.specifier),
        ...bare,
      ],
      dynamicImports: matchAll(text, DYNAMIC_IMPORT),
    };
  });
}

/** Turns an import specifier into a path from the project root, if it is our module. */
export function resolveSpecifier(from: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return `src/${specifier.slice(2)}`;
  if (!specifier.startsWith(".")) return null;
  const base = from.split(posix.sep).slice(0, -1).join(posix.sep);
  const joined = posix.normalize(`${base}/${specifier}`);
  return joined.startsWith("..") ? null : joined;
}

/** The graph "file -> the internal modules it refers to". */
export function buildGraph(files: readonly SourceFile[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const edges: string[] = [];
    for (const specifier of [...file.imports, ...file.dynamicImports]) {
      const target = resolveSpecifier(file.path, specifier);
      if (target !== null) edges.push(target);
    }
    graph.set(file.path, edges);
  }
  return graph;
}

/** Every module reachable from the files of a directory, re-exports included. */
export function reachableFrom(graph: Map<string, string[]>, prefix: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...graph.keys()].filter((path) => path.startsWith(prefix));

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) continue;
    for (const edge of graph.get(current) ?? []) {
      // The path without an extension: we compare by module prefix, not by file.
      const key = edge.replace(CODE, "");
      if (seen.has(key)) continue;
      seen.add(key);
      for (const candidate of graph.keys()) {
        if (
          candidate.replace(CODE, "") === key ||
          candidate.replace(/\/index\.(ts|tsx)$/, "") === key
        ) {
          queue.push(candidate);
        }
      }
    }
  }
  return seen;
}

/**
 * The packages a set of entry files pays for up front: everything reached by
 * following static imports only, with `import()` treated as a wall.
 *
 * That wall is the point. A dynamically imported module is a chunk of its own
 * and arrives when somebody does the thing that needs it, so the question "what
 * does opening this page cost" is exactly the question "what is reachable
 * without crossing an import()".
 *
 * The answer maps each external package to the chain that pulled it in, because
 * the useful half of such a failure is not which package arrived but which
 * import brought it.
 */
export function packagesUpFront(
  files: readonly SourceFile[],
  entries: readonly string[],
): Map<string, string> {
  const byPath = new Map(files.map((file) => [file.path.replace(CODE, ""), file]));
  const found = new Map<string, string>();
  const seen = new Set<string>();
  const queue = entries.map((entry) => ({ path: entry, chain: entry }));

  while (queue.length > 0) {
    const current = queue.pop();
    if (current === undefined) continue;
    const key = current.path.replace(CODE, "");
    if (seen.has(key)) continue;
    seen.add(key);

    const file = byPath.get(key) ?? byPath.get(`${key}/index`);
    if (file === undefined) continue;

    for (const specifier of file.valueImports) {
      const internal = resolveSpecifier(file.path, specifier);
      const chain = `${current.chain} -> ${specifier}`;
      if (internal === null) {
        if (!found.has(specifier)) found.set(specifier, chain);
      } else {
        queue.push({ path: internal, chain });
      }
    }
  }
  return found;
}
