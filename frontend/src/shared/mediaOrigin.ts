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

export function thumbnailUrl(value:string){const original=mediaUrl(value);try{const url=new URL(original);if(url.origin==='https://backend.evazmelk.ir'&&/^\/api\/public\/media\/[0-9a-f-]+\.(jpg|png|webp)$/.test(url.pathname)&&!url.search)return original+'/thumbnail'}catch{}return original}
