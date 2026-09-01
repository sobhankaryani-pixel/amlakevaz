const cors = {
  "Access-Control-Allow-Origin": "https://evazmelk.ir",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const incoming = new URL(request.url);
    const target = new URL(env.BACKEND_URL);
    target.pathname = incoming.pathname || "/health";
    target.search = incoming.search;
    const headers = new Headers(request.headers);
    headers.delete("Host");
    const response = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body });
    const out = new Response(response.body, response);
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
