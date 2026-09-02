/**
 * Regenerates the wire types, the schemas and the mocks, and fails if what
 * comes out differs from what was already on disk.
 *
 * The question being asked is "has anything been edited by hand where the
 * contract is the source", and the answer has to be the same on a developer's
 * machine and in CI. Asking git instead - regenerate, then `git diff` - asks a
 * different question: "does this differ from the last commit". Those coincide
 * only in a clean checkout, so locally the check failed on every legitimate
 * regeneration that had not been committed yet, and on any hand edit to
 * `handlers.ts`, which is written by hand and only happens to live beside a
 * generated file.
 *
 * The regenerated output is left in place either way, because that is what
 * there is to commit.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Everything `npm run contract` writes, and nothing that is written by hand.
 * The folder is listed rather than spelled out, so a file the generator starts
 * emitting is compared from the day it appears - and it is listed again after
 * the run, because before it that file does not exist yet.
 */
function generated() {
  let wire = [];
  try {
    wire = readdirSync(path.join(root, "src/lib/api/wire"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `src/lib/api/wire/${name}`);
  } catch {
    // Nothing generated yet: the run below is what puts it there.
  }
  return [...wire, "src/test/msw/handlers.gen.ts"];
}

function read(file) {
  try {
    return readFileSync(path.join(root, file), "utf8");
  } catch {
    return null;
  }
}

const before = new Map(generated().map((file) => [file, read(file)]));

/*
 * The two steps of `npm run contract`, started as Node rather than through a
 * package manager or a shell. A `.cmd` shim cannot be spawned without a shell
 * on Windows, and a shell concatenates the arguments instead of passing them -
 * so the entry points are named directly and neither problem exists.
 */
const steps = [
  path.join(root, "node_modules/@hey-api/openapi-ts/bin/run.js"),
  path.join(root, "scripts/generate-mocks.mjs"),
];

for (const step of steps) {
  const run = spawnSync(process.execPath, [step], { cwd: root, stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

const after = generated();
const drifted = after.filter((file) => read(file) !== (before.get(file) ?? null));

if (drifted.length > 0) {
  console.error("");
  console.error("Generated files did not match the contract:");
  for (const file of drifted) console.error(`  ${file}`);
  console.error("");
  console.error("They have been regenerated. Commit them, and edit the API");
  console.error("specification rather than these files.");
  process.exit(1);
}

console.log(`contract: ${after.length} generated files match the contract`);
