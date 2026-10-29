const SITE='https://evazmelk.ir';
const API='https://api.evazmelk.ir';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const propertyPath=code=>'/properties/'+encodeURIComponent(code);
const pages={'/':['املاک خودمونی اوز | خرید و فروش ملک','خرید و فروش زمین، خانه، مسکن مهر و سایر املاک اوز؛ مشاوره با املاک خودمونی.'],'/search':['جستجوی ملک در اوز | املاک خودمونی','ملک مناسب خود را بر اساس نوع، بودجه، متراژ و منطقه انتخاب کنید.'],'/map':['املاک روی نقشهٔ اوز','موقعیت آگهی‌های فعال املاک اوز را روی نقشه ببینید.'],'/index':['شاخص قیمت املاک اوز','روند قیمت ماهانهٔ اعلامی خودمونی برای زمین، زیربنا و مسکن مهر.'],'/areas':['مناطق اوز | املاک خودمونی','آگهی‌های املاک در مناطق اوز.'],'/about':['دربارهٔ املاک خودمونی اوز','املاک خودمونی به مدیریت سبحان کاریانی؛ خرید، فروش، رهن، اجاره و اخذ سند در اوز.'],'/contact':['تماس با املاک خودمونی اوز','اوز، خیابان طاهری، پایین‌تر از مسجد جامع قدیم؛ تماس 09212745755.'],'/register':['ثبت ملک برای فروش در اوز','درخواست ثبت ملک برای بررسی توسط مدیریت املاک خودمونی.'],'/account':['حساب کاربری | املاک خودمونی اوز','ورود به حساب املاک خودمونی.']};
export async function onRequest(context){
 const {request}=context,url=new URL(request.url),path=url.pathname.replace(/\/$/,'')||'/';
 const api=context.env.PUBLIC_API_BASE_URL||API;
 if(path==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /account\nSitemap: '+SITE+'/sitemap.xml\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});
 if(path==='/sitemap.xml'){
  try{const r=await fetch(api+'/api/public/sitemap-data');if(!r.ok)throw Error();const data=await r.json();const entries=[...Object.keys(pages).filter(p=>!['/account','/register'].includes(p)).map(p=>({path:p})),...data.items.map(p=>({path:propertyPath(p.public_code),updated:p.updated_at}))];return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(p=>'<url><loc>'+escape(SITE+p.path)+'</loc>'+(p.updated?'<lastmod>'+escape(new Date(p.updated).toISOString())+'</lastmod>':'')+'</url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'public,max-age=300'}})}catch{return new Response('Sitemap temporarily unavailable',{status:503,headers:{'Retry-After':'60'}})}
 }
 if(!pages[path]&&!path.startsWith('/properties/'))return context.next();
 let [title,description]=pages[path]||['آگهی ملک | املاک خودمونی اوز','مشخصات ملک در اوز'];let image=SITE+'/brand/favicon-emblem-v3-256.png',status=200,item=null;
 if(path.startsWith('/properties/')){
  try{const code=decodeURIComponent(path.slice(12));const r=await fetch(api+'/api/public/property-detail?code='+encodeURIComponent(code));if(r.status===404){status=404;title='آگهی موجود نیست | املاک خودمونی اوز';description='این آگهی موجود نیست یا دیگر فعال نیست.'}else if(!r.ok)throw Error();else{item=(await r.json()).item;title=`${item.property_type} در ${item.neighborhood||item.region||'اوز'} | کد ${item.public_code} | املاک خودمونی`;description=`${item.property_type} در ${item.neighborhood||item.region||'اوز'}؛ قیمت ${Number(item.asking_price_toman).toLocaleString('fa-IR')} تومان. کد ملک ${item.public_code}. تماس با املاک خودمونی: 09212745755`;image=item.media?.find(x=>x.kind==='image')?.url||item.cover_photo_url||image;}}
  catch{status=503;description='دریافت آگهی موقتاً امکان‌پذیر نیست؛ دوباره تلاش کنید.'}
 }
 // Fetch the SPA shell through the deployed assets binding, preserving its original styling.
 const shell=await context.next();let html=await shell.text();
 html=html.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+escape(title)+'</title>').replace(/<meta name="description"[^>]*>/i,'');
 const metadata='<meta name="description" content="'+escape(description)+'"><link rel="canonical" href="'+escape(SITE+path)+'"><meta property="og:type" content="website"><meta property="og:locale" content="fa_IR"><meta property="og:site_name" content="املاک خودمونی اوز"><meta property="og:title" content="'+escape(title)+'"><meta property="og:description" content="'+escape(description)+'"><meta property="og:url" content="'+escape(SITE+path)+'"><meta property="og:image" content="'+escape(image)+'"><meta name="twitter:card" content="summary_large_image">'+(status!==200||path==='/account'?'<meta name="robots" content="noindex,follow">':'');
 const structured=item?{'@context':'https://schema.org','@type':'RealEstateListing',name:title,url:SITE+path,dateModified:item.updated_at||undefined,datePosted:item.published_at||undefined,description,image,offers:{'@type':'Offer',price:item.asking_price_toman*10,priceCurrency:'IRR'}}:null;
 html=html.replace('</head>',metadata+(structured?'<script type="application/ld+json">'+JSON.stringify(structured).replace(/</g,'\\u003c')+'</script>':'')+'</head>');
 if(item)html=html.replace('<div id="root"></div>','<div id="root"><article dir="rtl"><h1>'+escape(title)+'</h1><p>'+escape(description)+'</p><p>'+escape(item.public_notes||'')+'</p></article></div>');
 return new Response(html,{status,headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-store',...(status===503?{'Retry-After':'60'}:{})}});
}
