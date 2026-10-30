import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('code sequence preserves 01, gives unique codes, never rewinds on reinstall or truncates 100',async()=>{
 const db=new PGlite();await db.exec("CREATE SCHEMA app;CREATE TABLE app.properties(id uuid DEFAULT gen_random_uuid(),public_code text UNIQUE);INSERT INTO app.properties(public_code) VALUES ('01'),('EV-OLD');");
 const migration=readFileSync(new URL('../../database/migrations/0017_automatic_property_codes.sql',import.meta.url),'utf8');await db.exec(migration);
 const next=async()=>(await db.query('SELECT app.allocate_property_code() AS code')).rows[0].code;
 assert.equal(await next(),'02');assert.equal(await next(),'03');await db.exec(migration);assert.equal(await next(),'04');
 assert.equal((await db.query("SELECT count(*)::int AS n FROM app.properties WHERE public_code='01'")).rows[0].n,1);
 await db.exec("SELECT setval('app.property_public_code_seq',99,true)");assert.equal(await next(),'100');
 const codes=await Promise.all(Array.from({length:12},()=>next()));assert.equal(new Set(codes).size,12);
 await db.close();
});
