import {spawnSync} from 'node:child_process';import {readdirSync,existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));const jsdom=join(root,'qa/node_modules/jsdom/lib/api.js');
if(!existsSync(jsdom)){console.error('First run: npm ci --prefix qa');process.exit(1)}
const tests=readdirSync(join(root,'frontend/tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>join(root,'frontend/tests',name));
const result=spawnSync(process.execPath,['--test',...tests],{cwd:root,stdio:'inherit',env:{...process.env,JSDOM_MODULE:jsdom}});process.exit(result.status??1);
