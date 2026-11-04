import {execSync} from 'node:child_process';
import {cpSync,existsSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
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
rmSync(join(output,'asset-range-sw.js'),{force:true});
writeFileSync(join(output,'liara.json'),JSON.stringify({app:'evazmelk-web',platform:'static'})+'\n');
writeFileSync(join(output,'liara_nginx.conf'),`location / { index index.html; try_files $uri $uri/ /index.html =404; }
location /assets/ { try_files $uri =404; }
location /management/ { add_header X-Robots-Tag "noindex, nofollow" always; try_files $uri $uri/ /management/index.html =404; }
location /management/assets/ { try_files $uri =404; }
location ~ /\\.well-known { allow all; }
`);
// Fail before deployment if either application or one of its HTML assets is missing.
for(const html of ['index.html','management/index.html']){
  const content=readFileSync(join(output,html),'utf8');
  for(const match of content.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
    if(!existsSync(join(output,match[1].slice(1))))throw Error(`Missing asset in ${html}: ${match[1]}`);
  }
}
console.log('Website and admin ready in liara-web-dist (evazmelk-web).');
