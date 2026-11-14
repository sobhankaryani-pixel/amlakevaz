import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const adminRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repoRoot=resolve(adminRoot,'..');
const files=(await readdir(dirname(fileURLToPath(import.meta.url))))
  .filter(name=>name.endsWith('.test.mjs'))
  .sort()
  .map(name=>resolve(dirname(fileURLToPath(import.meta.url)),name));
if(!files.length){console.error('No admin test files found.');process.exit(1)}
const jsdom=resolve(repoRoot,'qa/node_modules/jsdom/lib/api.js');
const result=spawnSync(process.execPath,['--test',...files],{
  cwd:adminRoot,
  stdio:'inherit',
  env:{...process.env,JSDOM_MODULE:pathToFileURL(jsdom).href}
});
process.exit(result.status??1);
