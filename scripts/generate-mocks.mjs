import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

import { parse, parseDocument } from "yaml";

/**
 * Mocks are generated from the contract rather than written from memory. Every
 * response is an example that lives in the OpenAPI document, which makes a mock
 * drifting away from the contract structurally impossible: the mock is the
 * contract.
 *
 * The cases that have to exist live as `examples` on the responses in the
 * contract - a clean finish, a partial failure, a whole job failed, a skipped
 * module, a finding pointing across documents, a Cite result with both groups,
 * and anchors of a kind this schema version does not define. Adding a case is
 * adding an example to the contract.
 *
 * The file is regenerated together with the types and schemas: `npm run contract`.
 */
const CONTRACT = "contract/refscout-api.yaml";
const TARGET = "src/test/msw";

const source = readFileSync(CONTRACT, "utf8");
const document = parse(source);

/**
 * The statuses of one operation, in the order the contract declares them.
 *
 * Reading them off the parsed object would not do: `200`, `202` and `429` are
 * integer-like keys, and a JavaScript object puts those in ascending numeric
 * order whatever the source said. The first successful response becomes the
 * mock's happy path, so on `POST /jobs` that silently swapped the `202` a
 * creation answers with for the `200` a repeated idempotency key answers with.
 */
const tree = parseDocument(source);

function declaredStatuses(path, method) {
  const node = tree.getIn(["paths", path, method, "responses"], true);
  return node?.items?.map((item) => String(item.key.value)) ?? [];
}

/**
 * Follows a local `$ref` and returns what it points at. Everything the contract
 * refers to lives in this same document, so an external reference is a mistake
 * worth stopping on rather than resolving.
 */
function deref(node) {
  if (node === null || typeof node !== "object" || typeof node.$ref !== "string") {
    return node;
  }
  const ref = node.$ref;
  if (!ref.startsWith("#/")) throw new Error(`Only local refs are supported: ${ref}`);

  let target = document;
  for (const segment of ref.slice(2).split("/")) {
    target = target?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  if (target === undefined) throw new Error(`Dangling reference: ${ref}`);
  return deref(target);
}

/**
 * A `default` response has no status of its own - it stands for every status
 * the client was not built to expect. The mock has to answer with something,
 * and 500 is the case that branch exists for.
 */
const DEFAULT_STATUS = 500;

/** Every response body the contract spells out, for one operation. */
function scenariosOf(operation, statuses) {
  const found = [];

  for (const status of statuses) {
    const response = deref(operation.responses[status]);
    const code = status === "default" ? DEFAULT_STATUS : Number(status);
    if (!Number.isInteger(code)) throw new Error(`Unreadable status: ${status}`);

    const json = response.content?.["application/json"];

    // No body at all: 204 and the OAuth redirects. Worth a scenario, because a
    // test still needs to be able to ask for one.
    if (json === undefined) {
      if (response.content === undefined) {
        found.push({ name: `status${code}`, status: code, body: null });
      }
      continue;
    }

    // A response with a schema but no example serves nothing: there is no body
    // to invent that would still be the contract. The gap shows up as a missing
    // handler rather than as a fabricated one.
    for (const [name, example] of Object.entries(json.examples ?? {})) {
      found.push({ name, status: code, body: deref(example).value });
    }
    if (json.examples === undefined && json.example !== undefined) {
      found.push({ name: `status${code}`, status: code, body: json.example });
    }
  }

  const names = new Set();
  for (const scenario of found) {
    if (names.has(scenario.name)) {
      throw new Error(
        `${operation.operationId}: two responses share the example name ` +
          `"${scenario.name}". Example names are the keys tests reach for, so ` +
          `they have to be unique within an operation.`,
      );
    }
    names.add(scenario.name);
  }

  return found;
}

/** OpenAPI path to msw pattern: /jobs/{jobId} becomes a wildcard-prefixed /jobs/:jobId. */
function toPattern(path) {
  return `*${path.replaceAll(/\{(\w+)\}/g, ":$1")}`;
}

/** JSON at the indentation of the property it is being assigned to. */
function indented(value, columns) {
  const pad = " ".repeat(columns);
  return JSON.stringify(value, null, 2).split("\n").join(`\n${pad}`);
}

const operations = [];

for (const [path, methods] of Object.entries(document.paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    const responses = scenariosOf(operation, declaredStatuses(path, method));
    if (responses.length === 0) continue;
    operations.push({
      id: operation.operationId,
      method,
      pattern: toPattern(path),
      responses,
    });
  }
}

const lines = [
  "// Generated from contract/refscout-api.yaml by scripts/generate-mocks.mjs.",
  "// Hand edits are lost on the next generation: change the contract instead.",
  "",
  'import { http, HttpResponse } from "msw";',
  "",
  "/** Every response the contract spells out, ugly cases included, keyed by example name. */",
  "export const scenarios = {",
];

for (const operation of operations) {
  lines.push(`  ${operation.id}: {`);
  for (const response of operation.responses) {
    lines.push(
      `    ${response.name}: {`,
      `      status: ${response.status},`,
      `      body: ${indented(response.body, 6)},`,
      `    },`,
    );
  }
  lines.push("  },");
}

lines.push("} as const;", "");
lines.push("/** The happy path: the first successful response of each operation. */");
lines.push("export const handlers = [");

for (const operation of operations) {
  const happy =
    operation.responses.find(
      (response) => response.status < 300 && response.body !== null,
    ) ?? operation.responses.find((response) => response.status < 400);
  if (happy === undefined) continue;

  lines.push(
    `  http.${operation.method}("${operation.pattern}", () =>`,
    happy.body === null
      ? `    new HttpResponse(null, { status: ${happy.status} }),`
      : `    HttpResponse.json(scenarios.${operation.id}.${happy.name}.body, { status: ${happy.status} }),`,
    "  ),",
  );
}

lines.push("];", "");

mkdirSync(TARGET, { recursive: true });
writeFileSync(`${TARGET}/handlers.gen.ts`, lines.join("\n"), "utf8");

const bodies = operations.reduce((n, operation) => n + operation.responses.length, 0);
console.log(
  `Mocks generated from the contract: ${operations.length} operations, ${bodies} responses`,
);
