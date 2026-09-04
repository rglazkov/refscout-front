/**
 * The HTTP clients a bibliography reader brings with it, replaced by nothing.
 *
 * citation-js can take a bibliography from an address as well as from a string,
 * so it depends on Node's `node-fetch` and `sync-fetch`. We only ever hand it a
 * string that is already in the browser, and the code that would reach for
 * those is unreachable from the way we call it - inside a worker the library
 * picks the browser's own `fetch` and never looks at them at all.
 *
 * They are cut out anyway, and for two reasons. Bundling them fails outright:
 * they import `node:http` and `node:fs`, which have no meaning in a browser.
 * And leaving them in would put an HTTP client inside the one part of this
 * product that must not have one - the box that strangers' documents are parsed
 * in. A refusal that throws is what an unreachable path should look like if it
 * ever stops being unreachable.
 */
function refuse() {
  throw new Error("A document is parsed in a worker, and a worker has no network.");
}

class Headers {}

refuse.Headers = Headers;

export default refuse;
export { Headers };
