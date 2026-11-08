// Dashboard build command: node cloudflare-build.mjs (repository root).
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));const npm=process.platform==='win32'?'npm.cmd':'npm';
const run=(args)=>execFileSync(npm,args,{cwd:root,stdio:'inherit'});
for(const folder of ['frontend','admin','qa'])run(['ci','--prefix',folder,'--no-audit','--no-fund']);
for(const folder of ['frontend','admin'])run(['run','check','--prefix',folder]);
run(['test','--prefix','frontend']);execFileSync(process.execPath,['build-cloudflare.mjs'],{cwd:root,stdio:'inherit'});
