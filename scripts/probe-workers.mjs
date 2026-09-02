import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

/**
 * Does a worker actually start, in the browser in front of you?
 *
 * The browser lane cannot answer this everywhere. Playwright's Firefox is a
 * patched build that quietly ignores `type: "module"` and makes a classic
 * worker instead, so a module worker fails there for a reason that does not
 * exist in the Firefox anybody uses - and a test that fails for a reason that
 * is not real is a test people learn to ignore.
 *
 * So this is the other half: it serves the built output, and prints what the
 * page reports back. Open the address in whatever you want to check - the
 * browser on your desk, an old Safari, a phone on the same network - and the
 * answer arrives here.
 *
 *  npm run build && npm run probe:workers
 */
const PORT = Number(process.env.PROBE_PORT ?? 4199);

const TYPES = {
  ".js": "text/javascript",
  ".html": "text/html",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
};

/**
 * A page with no application on it. What is being asked is whether the worker
 * starts and answers, so the fewer other things on the page the clearer the
 * answer: one document of each kind, straight through the worker's own
 * protocol.
 */
async function probePage() {
  const { buildPdf, textPage } = await import("../src/test/corpus/pdf.ts");
  const pdf = Buffer.from(buildPdf([textPage(["A page of a PDF."])])).toString("base64");

  return `<!doctype html><meta charset="utf-8"><title>worker probe</title>
<body style="font:20px/1.6 system-ui;padding:24px;max-width:60ch">
<h1 style="font-size:24px">Worker probe</h1>
<div id="out">running…</div>
<script type="module">
const out = document.getElementById("out");
const say = (text) => {
  out.textContent = text;
  void fetch("/result", { method: "POST", body: navigator.userAgent + "\\n  " + text });
};
const bytesOf = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const steps = [];
try {
  const worker = new Worker("/workers/parse.worker.js", { type: "module" });
  await new Promise((resolve, reject) => {
    worker.addEventListener("message", (event) => {
      if (event.data.type === "ready") resolve();
    });
    worker.addEventListener("error", (event) => reject(new Error("worker error: " + event.message)));
    setTimeout(() => reject(new Error("the worker never said it was ready")), 20000);
  });
  steps.push("starts");

  const ask = (payload) => new Promise((resolve, reject) => {
    const id = String(Math.random());
    const listen = (event) => {
      if (event.data.id !== id) return;
      if (event.data.type === "done") { worker.removeEventListener("message", listen); resolve(event.data.payload); }
      if (event.data.type === "failed") { worker.removeEventListener("message", listen); reject(new Error(event.data.payload.code)); }
    };
    worker.addEventListener("message", listen);
    setTimeout(() => reject(new Error("no answer in 40s")), 40000);
    worker.postMessage({ id, type: "parse", payload });
  });

  const text = await ask({ bytes: new TextEncoder().encode("plain text"), format: "txt" });
  steps.push("reads text (" + text.extracted.text + ")");
  const pdf = await ask({ bytes: bytesOf("${pdf}"), format: "pdf" });
  steps.push("reads PDF (" + pdf.pageCount + " page, " + pdf.extracted.text.trim().slice(0, 24) + ")");
  say("OK — " + steps.join(", "));
} catch (cause) {
  say("FAILED after [" + steps.join(", ") + "]: " + cause.message);
}
</script>`;
}

await writeFile(join("out", "worker-probe.html"), await probePage(), "utf8");

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://probe");

  if (url.pathname === "/result") {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      response.writeHead(204).end();
      console.log(`\n${Buffer.concat(chunks).toString("utf8")}\n`);
    });
    return;
  }

  const asked = normalize(decodeURIComponent(url.pathname));
  void readFile(join("out", asked)).then(
    (bytes) =>
      response
        .writeHead(200, {
          "Content-Type": TYPES[extname(asked)] ?? "application/octet-stream",
        })
        .end(bytes),
    () => response.writeHead(404).end(),
  );
});

server.listen(PORT, () => {
  console.log(
    `Open http://localhost:${PORT}/worker-probe.html in the browser you want to check.`,
  );
  console.log("What it reports appears here. Ctrl+C when you are done.");
});
