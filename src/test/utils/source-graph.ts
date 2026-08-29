import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, resolve, sep } from "node:path";

const SRC = resolve(process.cwd(), "src");

export type SourceFile = {
  /** The path from the project root in posix form: `src/lib/api/client.ts`. */
  readonly path: string;
  readonly text: string;
  /** Static imports and re-exports. */
  readonly imports: readonly string[];
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

const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function matchAll(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((match) => match[1] ?? "");
}

export function readSources(): readonly SourceFile[] {
  return walk(SRC, []).map((absolute) => {
    const text = readFileSync(absolute, "utf8");
    return {
      path: toPosix(absolute),
      text,
      imports: [...matchAll(text, STATIC_IMPORT), ...matchAll(text, BARE_IMPORT)],
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
