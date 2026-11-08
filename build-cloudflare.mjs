import {PAGES,pageMetadata,injectMetadata} from './frontend/src/shared/seoMetadata.js';
import {execFileSync} from 'node:child_process';import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {join} from 'node:path';
const root=fileURLToPath(new URL('.',import.meta.url));
for(const directory of ['frontend','admin'])execFileSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{cwd:join(root,directory),stdio:'inherit'});
const out=join(root,'cloudflare-dist');rmSync(out,{recursive:true,force:true});cpSync(join(root,'frontend/dist'),out,{recursive:true});cpSync(join(root,'admin/dist'),join(out,'management'),{recursive:true});
for(const name of ['asset-range-sw.js','_headers','_redirects','_routes.json','liara.json','liara_nginx.conf','_worker.js'])rmSync(join(out,name),{force:true});
const shell=readFileSync(join(out,'index.html'),'utf8');writeFileSync(join(out,'seo-shell.html'),shell);writeFileSync(join(out,'404.html'),injectMetadata(shell,pageMetadata('/404')));
for(const path of Object.keys(PAGES)){const directory=join(out,path.slice(1));mkdirSync(directory,{recursive:true});writeFileSync(join(directory,'index.html'),injectMetadata(shell,pageMetadata(path)))}
writeFileSync(join(out,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /register\nDisallow: /agency\nDisallow: /management/\nDisallow: /mobile-preview\nDisallow: /seo-shell\nSitemap: https://evazmelk.ir/sitemap.xml\n');
const metadata=readFileSync(join(root,'frontend/src/shared/seoMetadata.js'),'utf8').replace(/\bexport (?=(?:const|function)\b)/g,'');
const api=readFileSync(join(root,'frontend/src/api.ts'),'utf8').replace(/\bexport (?=const\b)/g,'');
const worker=readFileSync(join(root,'cloudflare/worker.js'),'utf8').replace(/^import .*seoMetadata\.js';\r?\n/m,'').replace(/^import .*api\.ts';\r?\n/m,'');
if(/^\s*import /m.test(worker))throw Error('Worker must be self-contained');
writeFileSync(join(out,'_worker.js'),metadata+'\n'+api+'\n'+worker);
writeFileSync(join(out,'_routes.json'),JSON.stringify({version:1,include:['/properties/*','/sitemap.xml','/management','/management/*','/mobile-preview','/mobile-preview/'],exclude:['/management/assets/*']},null,2)+'\n');
writeFileSync(join(out,'_headers'),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: no-cache
/management/*
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/seo-shell
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
/404.html
  X-Robots-Tag: noindex, follow
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/management/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
for(const html of ['index.html','management/index.html','mobile-preview.html','seo-shell.html','404.html']){
 const text=readFileSync(join(out,html),'utf8');for(const match of text.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){if(!existsSync(join(out,match[1].slice(1))))throw Error('Missing asset in '+html+': '+match[1])}
}
console.log('Cloudflare Pages output ready: cloudflare-dist. Website, management and SEO renderer included.');
