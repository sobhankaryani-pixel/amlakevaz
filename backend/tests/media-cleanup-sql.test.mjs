import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const code=readFileSync(new URL('../app/media_cleanup.py',import.meta.url),'utf8');
const refs=code.match(/REFERENCES="""([\s\S]*?)"""/)[1],eligible=code.match(/ELIGIBLE="""([\s\S]*?)"""/)[1];
test('migration protects legacy files, all references and draft leases; triggers reject racing or deleted attachments',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA app;
 CREATE TABLE app.uploaded_media(id uuid PRIMARY KEY,filename text UNIQUE,kind text,size_bytes bigint,created_at timestamptz DEFAULT now());
 CREATE TABLE app.properties(id integer PRIMARY KEY,media jsonb DEFAULT '[]',cover_photo_url text,status text,notes text);
 CREATE TABLE app.property_submissions(id integer PRIMARY KEY,details jsonb,status text);
 CREATE TABLE app.homepage_promotions(id integer PRIMARY KEY,image_url text,is_active boolean);`);
 const name=i=>`00000000-0000-4000-8000-${String(i).padStart(12,'0')}.webp`;
 const url=i=>'https://api.evazmelk.ir/api/public/media/'+name(i);
 for(let i=1;i<=6;i++)await db.query("INSERT INTO app.uploaded_media(id,filename,kind,size_bytes,created_at) VALUES ($1,$2,'image',100,now()-interval '80 days')",[name(i).slice(0,-5),name(i)]);
 const migration=readFileSync(new URL('../../database/migrations/0016_media_cleanup.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);
 const candidates=async()=>(await db.query(`SELECT u.filename FROM app.uploaded_media u WHERE ${eligible} AND ${refs} ORDER BY filename`)).rows.map(x=>x.filename);
 assert.deepEqual(await candidates(),[]); // Existing files get a fresh 30-day grace.
 await db.exec("UPDATE app.uploaded_media SET retain_until=now()-interval '1 day'");
 await db.query("INSERT INTO app.properties VALUES (1,'[]',$1,'sold','')",[url(1)]);
 await db.query("INSERT INTO app.properties VALUES (2,$1,NULL,'hidden','')",[JSON.stringify([{url:url(2),kind:'image'}])]);
 await db.query("INSERT INTO app.property_submissions VALUES (1,$1,'pending')",[JSON.stringify({media:[{url:url(3)}]})]);
 await db.query('INSERT INTO app.homepage_promotions VALUES (1,$1,false)',[url(4)]);
 await db.query("UPDATE app.uploaded_media SET retain_until=now()+interval '30 days' WHERE filename=$1",[name(5)]);
 assert.deepEqual(await candidates(),[name(6)]);
 await db.query("UPDATE app.uploaded_media SET created_at=now()-interval '2 days' WHERE filename=$1",[name(6)]);
 assert.deepEqual(await candidates(),[]);
 await db.query("UPDATE app.uploaded_media SET created_at=now()-interval '80 days' WHERE filename=$1",[name(6)]);
 await db.exec("UPDATE app.property_submissions SET status='rejected'");assert.deepEqual(await candidates(),[name(6)]);
 // A reference saved after preview must be seen by the final candidate check.
 await db.query("INSERT INTO app.properties VALUES (3,'[]',NULL,'hidden',$1)",[url(6)]);assert.deepEqual(await candidates(),[]);
 await db.exec('DELETE FROM app.properties WHERE id=3');
 await db.query("UPDATE app.uploaded_media SET cleanup_state='deleting' WHERE filename=$1",[name(6)]);
 for(const state of ['deleting','deleted']){
  await db.query('UPDATE app.uploaded_media SET cleanup_state=$1 WHERE filename=$2',[state,name(6)]);
  await assert.rejects(db.query("INSERT INTO app.properties VALUES (3,'[]',$1,'sale','')",[url(6)]),e=>e.code==='23514'&&e.constraint==='media_cleanup_reference_guard');
  await assert.rejects(db.query('UPDATE app.homepage_promotions SET image_url=$1 WHERE id=1',[url(6)]),e=>e.code==='23514');
  await assert.rejects(db.query("INSERT INTO app.property_submissions VALUES (2,$1,'pending')",[JSON.stringify({media:[{url:url(6)}]})]),e=>e.code==='23514');
 }
 assert.deepEqual(await candidates(),[]);await db.close();
});
