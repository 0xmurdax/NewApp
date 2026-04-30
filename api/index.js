/* Edge‑runtime*/
export const config = { runtime: "edge" };

/* ---- 1️⃣  Base target URL ------------------------------------- */
const TARGET_BASE = (process.env.TARGET_DOMAIN ?? "").replace(/\/$/, "");

/* ---- 2️⃣  Headers that must NOT be forwarded ------------------- */
const FORBIDDEN_HEADERS = new Set([
  "host", "connection", "keep-alive",
  "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
  "forwarded",
  "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port",
]);

/* ---- 3️⃣  Main handler ----------------------------------------- */
export default async function handler(req) {
  /* No target configured → 500 */
  if (!TARGET_BASE) {
    return new Response(
      "Misconfigured: TARGET_DOMAIN is not set",
      { status: 500 }
    );
  }

  try {
    /* Construct the forwarded URL (keep path, query & hash) */
    const u = new URL(req.url);
    const targetUrl = `${TARGET_BASE}${u.pathname}${u.search}${u.hash}`;

    /* Build headers for the outgoing request */
    const outHeaders = new Headers();
    let clientIp = null;

    for (const [name, value] of req.headers) {
      const lc = name.toLowerCase();

      /* Skip forbidden & internal Vercel headers */
      if (FORBIDDEN_HEADERS.has(lc) || lc.startsWith("x-vercel-")) continue;

      /* Capture client IP */
      if (lc === "x-real-ip") { clientIp = value; continue; }
      if (lc === "x-forwarded-for" && !clientIp) { clientIp = value; continue; }

      /* Forward everything else */
      outHeaders.set(name, value);
    }

    /* Attach X‑Forwarded‑For if we have a client IP */
    if (clientIp) outHeaders.set("x-forwarded-for", clientIp);

    /* Decide whether to include a body (no body for GET/HEAD) */
    const method = req.method;
    const hasBody = !["GET", "HEAD"].includes(method);

    /* Forward the request */
    return await fetch(targetUrl, {
      method,
      headers: outHeaders,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (e) {
    console.error("relay error:", e);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}

/* ---- 4️⃣  Dummy unused code ----------------------------------- */
const unusedValue = 42;
function noop() {}
const unusedArray = [1, 2, 3];

