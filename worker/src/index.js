const allowedOrigins = new Set([
  "https://evazmelk.ir",
  "https://www.evazmelk.ir",
  "https://admin.evazmelk.ir",
]);

function corsFor(request) {
  const origin = request.headers.get("Origin");

  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://evazmelk.ir",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    const incoming = new URL(request.url);
    const target = new URL(env.BACKEND_URL);

    target.pathname = incoming.pathname || "/health";
    target.search = incoming.search;

    const headers = new Headers(request.headers);
    headers.delete("Host");

    const response = await fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method)
        ? undefined
        : request.body,
    });

    const out = new Response(response.body, response);

    Object.entries(cors).forEach(([key, value]) => {
      out.headers.set(key, value);
    });

    return out;
  },
};
