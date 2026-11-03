export function mediaUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.origin === 'https://api.evazmelk.ir' && url.pathname.startsWith('/api/public/media/')) {
      url.hostname = 'backend.evazmelk.ir';
      return url.href;
    }
  } catch (_) {}
  return value;
}
