# Cloudflare API Proxy

This Worker proxies only `/api/*` requests to the FastAPI service. Set `BACKEND_URL` in Worker Variables; do not commit a real URL if it is private.

Suggested route: `api.evazmelk.ir/*`.
