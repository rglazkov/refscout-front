/**
 * The single source of truth for the headers (§18, M0.7). It produces the file
 * the host serves, the snapshot used by the smoke test, and the reference the
 * smoke test compares the deployed environment against - otherwise the strict
 * policy exists only on paper.
 */

/**
 * The post-build step runs as plain Node, which - unlike `next build` - reads
 * no `.env` of its own. Without this the API origin is simply absent here, and
 * the policy ships with `connect-src 'self'`: every call to the API blocked,
 * and nothing to show for it until the first request is actually made.
 * Anything already in the environment wins, so CI can override per stand.
 */
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // No such file, which is normal for .env.local.
  }
}

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/**
 * Where a browser posts a policy violation (M0.7.3, §19).
 *
 * The address is absolute and points at the API rather than at the static
 * origin: there is no Node in the delivery (§2), so nothing here could receive
 * a report, and a relative `/csp-report` would mean violations disappear into
 * a 404 while we believe we are watching. The receiver is stood up in M6; the
 * declaration goes in from the start, because violations that happen before it
 * are visible nowhere and cannot be recovered afterwards.
 *
 * Both names are declared: `report-uri` is deprecated and `report-to` is not
 * supported everywhere, and together they cover every live browser.
 */
const REPORT_ENDPOINT = API_ORIGIN === "" ? "" : `${API_ORIGIN}/csp-report`;
const REPORT_GROUP = "csp";

/** Headers that are identical on every page. */
export const commonHeaders = {
  ...(REPORT_ENDPOINT === ""
    ? {}
    : { "Reporting-Endpoints": `${REPORT_GROUP}="${REPORT_ENDPOINT}"` }),
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
    "interest-cohort=()",
  ].join(", "),
};

/**
 * The policy for the manuscript screen and every ordinary page.
 *
 * `script-src` is 'self' plus the listed hashes only: the inline theme script
 * (M0.2.3) and the housekeeping scripts of the static export. The post-build
 * step computes the hashes, so the policy never lags behind the build.
 *
 * `style-src` is the one relaxed directive, and that is a price paid
 * knowingly. Popovers, dropdowns and scroll locking set coordinates through
 * the style attribute and inject <style> elements at runtime; there is nowhere
 * to get a nonce from in a static export, because there is no server to issue
 * one. The relaxation is confined to styles: script-src stays strict and
 * hash-based, and executing someone else's script is exactly what the policy
 * is here to stop.
 */
export function contentSecurityPolicy(hashes, { payments = false } = {}) {
  const scriptSrc = ["'self'", ...hashes.map((hash) => `'${hash}'`)];
  const connectSrc = ["'self'", ...(API_ORIGIN === "" ? [] : [API_ORIGIN])];

  const directives = {
    "default-src": ["'self'"],
    "script-src": payments ? [...scriptSrc, "https://js.stripe.com"] : scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": payments ? ["https://js.stripe.com"] : ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "manifest-src": ["'self'"],
  };

  const policy = Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");

  const reporting =
    REPORT_ENDPOINT === ""
      ? ""
      : `; report-uri ${REPORT_ENDPOINT}; report-to ${REPORT_GROUP}`;

  return `${policy}; upgrade-insecure-requests${reporting}`;
}

/**
 * The wider set exists only for /pricing, to accommodate the payment widget.
 * The manuscript screen stays under the strict policy and carries no analytics.
 */
export const PAYMENT_ROUTES = ["/pricing/"];
