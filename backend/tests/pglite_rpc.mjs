// Isolated SQL engine for API integration tests; stdout is JSON-lines only.
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import readline from 'node:readline';
const require=createRequire(import.meta.url);
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();await db.waitReady;await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;');
const dir=new URL('../../database/migrations/',import.meta.url);
for(const name of readdirSync(dir).sort())await db.exec(readFileSync(new URL(name,dir),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
await db.exec(readFileSync(new URL('0021_agencies_and_inquiries.sql',dir),'utf8'));
console.log(JSON.stringify({ready:true}));
for await(const line of readline.createInterface({input:process.stdin})){
 try{const {sql,params}=JSON.parse(line);const r=await db.query(sql,params||[]);console.log(JSON.stringify({rows:r.rows}));}
 catch(e){console.log(JSON.stringify({error:e.message,code:e.code}));}
}
