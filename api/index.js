/* ------------------------------------------------------------------
 * Edge‑runtime (simple proxy for Vercel)
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
 * 1️⃣  Configuration
 * ------------------------------------------------------------------ */
// Tell Vercel to run this file in the Edge runtime
export const config = { runtime: "edge" };

/* ------------------------------------------------------------------
 * 2️⃣  Environment‑based settings
 * ------------------------------------------------------------------ */
// Base URL to which all requests will be forwarded
// (taken from the TARGET_DOMAIN environment variable)
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

/* ------------------------------------------------------------------
 * 3️⃣  Headers to strip
 * ------------------------------------------------------------------ */
// A set of request‑header names that should NOT be forwarded
const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

/* ------------------------------------------------------------------
 * 4️⃣  Main handler
 * ------------------------------------------------------------------ */
export default async function handler(req) {
  /* If we do not have a target domain configured, return a 500 */
  if (!TARGET_BASE) {
    return new Response(
      "Misconfigured: TARGET_DOMAIN is not set",
      { status: 500 }
    );
  }

  try {
    /* --------------------------------------------------------------
     * 4.1  Construct the target URL
     * -------------------------------------------------------------- */
    // Find the first slash after the protocol part (e.g. after "https://")
    const pathStart = req.url.indexOf("/", 8);
    // If the original request has no path, use the base + "/"  
    // otherwise, append the path from the original request
    const targetUrl =
      pathStart === -1
        ? TARGET_BASE + "/"
        : TARGET_BASE + req.url.slice(pathStart);

    /* --------------------------------------------------------------
     * 4.2  Filter and rebuild headers
     * -------------------------------------------------------------- */
    const out = new Headers();        // Headers that will actually be sent
    let clientIp = null;              // To store the client's IP if present

    for (const [k, v] of req.headers) {
      // Skip headers that we explicitly do NOT want to forward
      if (STRIP_HEADERS.has(k)) continue;
      // Vercel inserts a few internal headers – ignore those too
      if (k.startsWith("x-vercel-")) continue;

      // Capture the real client IP if it exists
      if (k === "x-real-ip") {
        clientIp = v;
        continue;
      }

      // If the request already contains an X‑Forwarded‑For header
      // we want to keep the first IP value (unless we already captured it)
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }

      // Anything else is safe to forward
      out.set(k, v);
    }

    // Re‑inject the client IP as X‑Forwarded‑For (if we captured it)
    if (clientIp) out.set("x-forwarded-for", clientIp);

    /* --------------------------------------------------------------
     * 4.3  Method & body handling
     * -------------------------------------------------------------- */
    const method = req.method;                     // HTTP method (GET, POST, …)
    const hasBody = method !== "GET" && method !== "HEAD"; // Only these methods can have a body

    /* --------------------------------------------------------------
     * 4.4  Forward the request
     * -------------------------------------------------------------- */
    // The fetch is performed with manual redirect handling so
    // that 301/302 responses are passed back to the caller
    return await fetch(targetUrl, {
      method,
      headers: out,
      body: hasBody ? req.body : undefined,
      duplex: "half",   // Enable streaming for large payloads
      redirect: "manual",
    });

  } catch (err) {
    /* --------------------------------------------------------------
     * 5️⃣  Error handling
     * -------------------------------------------------------------- */
    console.error("relay error:", err);
    // Return a 502 if the tunnel to the target server fails
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}

/* ------------------------------------------------------------------
 * Dummy / unused code (does NOT affect the proxy logic)
 * ------------------------------------------------------------------ */
// ------------------------------------------------------------
// This variable is declared but never used anywhere.
// It's just here to demonstrate “no‑op” code.
const dummyVar = 42; // <-- unused

// A no‑operation function that does nothing.
// Not called by the handler.
function noop() { /* nothing happens here */ } // <-- dummy

// Another unused array – it serves no purpose.
const unusedArray = [1, 2, 3]; // <-- unused
