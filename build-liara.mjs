import {PAGES, pageMetadata, injectMetadata} from './frontend/src/shared/seoMetadata.js';
import {execSync} from 'node:child_process';
import {cpSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

// Resolve relative to this file, independently of the caller's current directory.
const root=fileURLToPath(new URL('.',import.meta.url));
for(const directory of ['frontend','admin']){
  execSync('npm run build',{cwd:join(root,directory),stdio:'inherit'});
}
const output=join(root,'liara-web-dist');
rmSync(output,{recursive:true,force:true});
cpSync(join(root,'frontend/dist'),output,{recursive:true});
cpSync(join(root,'admin/dist'),join(output,'management'),{recursive:true});
for(const legacy of ['asset-range-sw.js','_headers','_redirects']) rmSync(join(output,legacy),{force:true});
writeFileSync(join(output,'liara.json'),JSON.stringify({app:'evazmelk-web',platform:'static'})+'\n');
// Keep a static shell for the backend renderer, independently of SPA routing.
const shell=readFileSync(join(output,'index.html'),'utf8');
writeFileSync(join(output,'seo-shell.html'),shell);
writeFileSync(join(output,'404.html'),injectMetadata(shell,pageMetadata('/404')));
for(const path of Object.keys(PAGES)){
  const directory=join(output,path.slice(1));
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'index.html'),injectMetadata(shell,pageMetadata(path)));
}
writeFileSync(join(output,'robots.txt'),'User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /register\nDisallow: /agency\nDisallow: /management/\nDisallow: /seo-shell.html\nDisallow: /mobile-preview\nSitemap: https://evazmelk.ir/sitemap.xml\n');
const pageLocations=Object.keys(PAGES).filter(path=>path!=='/').map(path=>`location = ${path} { try_files ${path}/index.html =404; }`).join('\n');
writeFileSync(join(output,'liara_nginx.conf'),`${pageLocations}\nlocation = /mobile-preview { add_header X-Robots-Tag "noindex, nofollow" always; add_header Cache-Control "no-store" always; try_files /mobile-preview.html =404; }
location = /mobile-preview/ { add_header X-Robots-Tag "noindex, nofollow" always; add_header Cache-Control "no-store" always; try_files /mobile-preview.html =404; }
error_page 404 /404.html;
location = /404.html { internal; add_header X-Robots-Tag "noindex, follow" always; }
location / { add_header Cache-Control "no-cache, no-store, must-revalidate" always; index index.html; try_files $uri $uri/ =404; }
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
location = /seo-shell.html { add_header X-Robots-Tag "noindex, nofollow" always; add_header Cache-Control "no-store" always; try_files $uri =404; }
location = /sitemap.xml {
  proxy_ssl_server_name on;
  proxy_ssl_name backend.evazmelk.ir;
  proxy_set_header Host backend.evazmelk.ir;
  proxy_set_header Cookie "";
  proxy_set_header Authorization "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 20s;
  proxy_pass https://backend.evazmelk.ir/api/public/seo/sitemap.xml;
}
location /properties/ {
  proxy_ssl_server_name on;
  proxy_ssl_name backend.evazmelk.ir;
  proxy_set_header Host backend.evazmelk.ir;
  proxy_set_header Cookie "";
  proxy_set_header Authorization "";
  proxy_connect_timeout 5s;
  proxy_read_timeout 20s;
  proxy_pass https://backend.evazmelk.ir/api/public/seo/properties/;
}
location /management/ { add_header X-Robots-Tag "noindex, nofollow" always; try_files $uri $uri/ /management/index.html =404; }
location /management/assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; add_header X-Robots-Tag "noindex, nofollow" always; try_files $uri =404; }
location ~ /\\.well-known { allow all; }
`);
// Fail before deployment if either application or one of its HTML assets is missing.
for(const html of ['index.html','management/index.html','mobile-preview.html']){
  const content=readFileSync(join(output,html),'utf8');
  for(const match of content.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
    if(!existsSync(join(output,match[1].slice(1))))throw Error(`Missing asset in ${html}: ${match[1]}`);
  }
}
console.log('Website and admin ready in liara-web-dist (evazmelk-web).');
