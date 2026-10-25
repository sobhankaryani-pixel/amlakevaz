/*
 * Network workaround for paths where full static-file responses stall or close.
 * Fetch same-origin static assets in 16 KiB HTTP Range requests, then return one
 * normal 200 response to the browser. No API/database requests are intercepted.
 */
const CHUNK_SIZE = 16 * 1024;
const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const STATIC_FILE = /\.(?:m?js|css|webp|png|jpe?g|avif|gif|svg|woff2?|ttf|otf)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!STATIC_FILE.test(url.pathname)) return;
  if (url.pathname === '/asset-range-sw.js') return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(fetchStaticAsset(request));
});

async function fetchStaticAsset(request) {
  try {
    const first = await fetchRange(request, 0, CHUNK_SIZE - 1);
    if (first.status !== 206) return first;

    const firstRange = parseContentRange(first.headers.get('Content-Range'));
    if (!firstRange || firstRange.start !== 0 || firstRange.total <= 0 || firstRange.total > MAX_ASSET_BYTES) {
      return fetch(request);
    }

    // Range responses should be identity-encoded. If a server encodes each part,
    // do not concatenate potentially incompatible decoded representations.
    if (first.headers.has('Content-Encoding')) return fetch(request);

    const firstBytes = await first.arrayBuffer();
    if (firstBytes.byteLength !== firstRange.end + 1) return fetch(request);

    const chunks = [firstBytes];
    let offset = firstRange.end + 1;
    while (offset < firstRange.total) {
      const end = Math.min(offset + CHUNK_SIZE - 1, firstRange.total - 1);
      const part = await fetchRange(request, offset, end);
      if (part.status !== 206 || part.headers.has('Content-Encoding')) return fetch(request);

      const range = parseContentRange(part.headers.get('Content-Range'));
      if (!range || range.start !== offset || range.end !== end || range.total !== firstRange.total) {
        return fetch(request);
      }

      const bytes = await part.arrayBuffer();
      if (bytes.byteLength !== end - offset + 1) return fetch(request);
      chunks.push(bytes);
      offset = end + 1;
    }

    const combined = new Uint8Array(firstRange.total);
    let cursor = 0;
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), cursor);
      cursor += chunk.byteLength;
    }

    const headers = new Headers(first.headers);
    headers.delete('Content-Range');
    headers.delete('Content-Length');
    headers.delete('Content-Encoding');
    headers.delete('Accept-Ranges');
    headers.set('Content-Length', String(combined.byteLength));
    return new Response(combined, { status: 200, statusText: 'OK', headers });
  } catch (_) {
    // Preserve normal browser behavior if ranged fetching is not supported.
    return fetch(request);
  }
}

async function fetchRange(originalRequest, start, end) {
  const headers = new Headers(originalRequest.headers);
  headers.set('Range', `bytes=${start}-${end}`);
  headers.delete('If-None-Match');
  headers.delete('If-Modified-Since');
  const rangedRequest = new Request(originalRequest, {
    headers,
    cache: 'no-store',
  });
  return fetch(rangedRequest);
}

function parseContentRange(value) {
  if (!value) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(value.trim());
  if (!match) return null;
  return {
    start: Number(match[1]),
    end: Number(match[2]),
    total: Number(match[3]),
  };
}
