export const SITE='https://evazmelk.ir';
export const DEFAULT_IMAGE=SITE+'/brand/favicon-emblem-v3-256.png';
export const PAGES={
 '/':['املاک خودمونی اوز | شاخص قیمت و آگهی ملک','خرید و فروش زمین، خانه، مسکن مهر و سایر املاک اوز؛ مشاهده شاخص قیمت و دریافت مشاوره از املاک خودمونی.'],
 '/search':['جستجوی ملک در اوز | املاک خودمونی','ملک مناسب خود را بر اساس نوع، بودجه، متراژ و منطقه انتخاب کنید.'],
 '/map':['املاک روی نقشهٔ اوز | املاک خودمونی','موقعیت آگهی‌های فعال املاک اوز را روی نقشه ببینید.'],
 '/index':['شاخص قیمت املاک اوز | املاک خودمونی','روند قیمت ماهانهٔ اعلامی خودمونی برای زمین، زیربنا و مسکن مهر.'],
 '/areas':['مناطق اوز | املاک خودمونی','آگهی‌های املاک در مناطق اوز و محدوده‌های موردنظر خود را ببینید.'],
 '/about':['دربارهٔ املاک خودمونی اوز','املاک خودمونی به مدیریت سبحان کاریانی؛ خرید، فروش، رهن، اجاره و اخذ سند در اوز.'],
 '/contact':['تماس با املاک خودمونی اوز','اوز، خیابان طاهری، پایین‌تر از مسجد جامع قدیم؛ تماس 09212745755.'],
 '/register':['ثبت ملک برای فروش در اوز | املاک خودمونی','درخواست ثبت ملک برای بررسی توسط مدیریت املاک خودمونی.'],
 '/account':['حساب کاربری | املاک خودمونی اوز','ورود به حساب املاک خودمونی و پیگیری درخواست‌های ثبت ملک.'],
};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const propertyPath=code=>'/properties/'+encodeURIComponent(code);
export function canonicalPath(path){
 const clean=String(path).split(/[?#]/,1)[0].replace(/\/+$/,'')||'/';
 if(clean.startsWith('/properties/')){try{return propertyPath(decodeURIComponent(clean.slice(12)))}catch{return clean}}
 return clean.startsWith('/')&&!clean.startsWith('//')?clean:'/';
}
export function pageMetadata(path){
 const clean=canonicalPath(path),page=PAGES[clean];
 const [title,description]=page||['آگهی ملک | املاک خودمونی اوز','مشخصات و راه‌های تماس برای این آگهی ملک در اوز.'];
 return {title,description,url:SITE+clean,image:DEFAULT_IMAGE,robots:['/account','/register'].includes(clean)?'noindex,follow':'index,follow',structured:null};
}
function imageUrl(value){if(typeof value!=='string'||!value.trim())return null;try{const url=new URL(value,SITE);return url.protocol==='https:'?url.href:null}catch{return null}}
export function isoDate(value){if(!value)return undefined;const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():undefined}
export function propertyMetadata(item){
 const result=pageMetadata(propertyPath(item.public_code));
 const place=item.neighborhood||item.region||'اوز';
 result.title=`${item.property_type} در ${place} | کد ${item.public_code} | املاک خودمونی`;
 const price=Number(item.asking_price_toman);
 result.description=`${item.property_type} در ${place}؛ قیمت ${price.toLocaleString('fa-IR')} تومان. کد ملک ${item.public_code}. تماس با املاک خودمونی: 09212745755`;
 const candidates=[item.cover_photo_url,...(item.media||[]).filter(x=>x.kind==='image').map(x=>x.url)];
 result.image=candidates.map(imageUrl).find(Boolean)||DEFAULT_IMAGE;
 result.structured={'@context':'https://schema.org','@type':'RealEstateListing',name:result.title,url:result.url,dateModified:isoDate(item.updated_at),datePosted:isoDate(item.published_at),description:result.description,image:result.image,...(Number.isFinite(price)&&price>0?{offers:{'@type':'Offer',price:price*10,priceCurrency:'IRR'}}:{})};
 return result;
}
export function propertyFailureMetadata(path,status=503){
 const result=pageMetadata(path);result.robots='noindex,follow';
 if(status===404){result.title='آگهی موجود نیست | املاک خودمونی اوز';result.description='این آگهی موجود نیست یا دیگر فعال نیست.'}
 else{result.title='دریافت آگهی موقتاً ممکن نیست | املاک خودمونی اوز';result.description='دریافت آگهی موقتاً امکان‌پذیر نیست؛ دوباره تلاش کنید.'}
 return result;
}
export function metadataTags(metadata){return [
 ['name','description',metadata.description],['name','robots',metadata.robots],
 ['property','og:type','website'],['property','og:locale','fa_IR'],['property','og:site_name','املاک خودمونی اوز'],
 ['property','og:title',metadata.title],['property','og:description',metadata.description],['property','og:url',metadata.url],['property','og:image',metadata.image],['property','og:image:alt',metadata.title],
 ['name','twitter:card','summary_large_image'],['name','twitter:title',metadata.title],['name','twitter:description',metadata.description],['name','twitter:image',metadata.image],['name','twitter:image:alt',metadata.title],
]}
export const structuredText=data=>JSON.stringify(data).replace(/</g,'\\u003c');
export function metadataHtml(metadata){return '<title>'+escapeHtml(metadata.title)+'</title>'+metadataTags(metadata).map(([attr,key,value])=>'<meta '+attr+'="'+key+'" content="'+escapeHtml(value)+'">').join('')+'<link rel="canonical" href="'+escapeHtml(metadata.url)+'">'+(metadata.structured?'<script id="evaz-property-jsonld" type="application/ld+json">'+structuredText(metadata.structured)+'</script>':'')}
export function injectMetadata(html,metadata){
 const keys=new Set(metadataTags(metadata).map(([,key])=>key));
 return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'')
 .replace(/<meta\b[^>]*>/gi,tag=>{const key=tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1].toLowerCase();return keys.has(key)?'':tag})
 .replace(/<link\b[^>]*>/gi,tag=>/\brel\s*=\s*["']canonical["']/i.test(tag)?'':tag)
 .replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>{if(!/application\/ld\+json/i.test(attrs))return tag;try{return /evaz-property-jsonld/i.test(attrs)||JSON.parse(body)['@type']==='RealEstateListing'?'':tag}catch{return tag}})
 .replace(/<\/head>/i,metadataHtml(metadata)+'</head>');
}
