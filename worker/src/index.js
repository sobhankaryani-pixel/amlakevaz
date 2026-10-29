const allowedOrigins = new Set(["https://evazmelk.ir", "https://www.evazmelk.ir", "https://admin.evazmelk.ir"]);
function corsFor(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://evazmelk.ir",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Range",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Access-Control-Expose-Headers": "Content-Range,Accept-Ranges,X-Export-Count",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const incoming = new URL(request.url);
    const target = new URL(env.BACKEND_URL);
    target.pathname = incoming.pathname || "/health";
    target.search = incoming.search;
    const headers = new Headers(request.headers);
    headers.delete("Host");
    headers.delete("X-Evaz-Client-IP");
    headers.delete("X-Evaz-Proxy-Secret");
    if (env.PROXY_SHARED_SECRET) {
      headers.set("X-Evaz-Client-IP", request.headers.get("CF-Connecting-IP") || "unknown");
      headers.set("X-Evaz-Proxy-Secret", env.PROXY_SHARED_SECRET);
    }
    const response = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body });
    const out = new Response(response.body, response);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
