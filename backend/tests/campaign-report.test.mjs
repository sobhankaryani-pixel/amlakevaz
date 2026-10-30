// Optional SQL integration check: npm install @electric-sql/pglite in a QA directory.
// PGLITE_MODULE may point at that directory's package entry; no production DB is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const source=readFileSync(new URL('../app/attribution.py',import.meta.url),'utf8');
const sql=source.split('CAMPAIGN_REPORT_SQL = """')[1].split('"""')[0].replace('%s','$1');
test('campaign SQL counts forms once per visit, preserves origin across reporting boundary, separates unknowns',async()=>{
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA app;CREATE TABLE app.site_events(id bigint GENERATED ALWAYS AS IDENTITY,event text,session_id uuid,path text DEFAULT '/',details jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());`);
 const sessionA='00000000-0000-4000-8000-000000000001',sessionB='00000000-0000-4000-8000-000000000002';
 const insert=async(event,session,details,age=0)=>db.query("INSERT INTO app.site_events(event,session_id,details,created_at) VALUES ($1,$2,$3,now()-($4*interval '1 day'))",[event,session,JSON.stringify(details),age]);
 const origin={source:'instagram',medium:'social',campaign:'aban'};
 await insert('page_view',sessionA,origin,10);
 await insert('page_view',sessionA,{});await insert('page_view',sessionB,origin);
 await insert('phone_click',sessionA,{});await insert('phone_click',sessionA,{});
 await insert('whatsapp_click',sessionA,{});
 await insert('contact_submit',sessionA,{});await insert('contact_submit',sessionA,{});
 await insert('property_submit',sessionA,{});
 await insert('contact_submit',null,{});
 const rows=(await db.query(sql,[7])).rows;
 assert.equal(rows.length,2);
 const ad=rows.find(x=>x.has_session),unknown=rows.find(x=>!x.has_session);
 assert.equal(ad.campaign,'aban');assert.equal(Number(ad.sessions),2);assert.equal(Number(ad.views),2);
 assert.equal(Number(ad.phone_clicks),2);assert.equal(Number(ad.whatsapp_clicks),1);
 assert.equal(Number(ad.contact_submissions),2);assert.equal(Number(ad.property_submissions),1);
 assert.equal(Number(ad.form_sessions),1);assert.equal(Number(ad.form_rate),50);
 assert.equal(Number(unknown.contact_submissions),1);assert.equal(Number(unknown.sessions),0);assert.equal(unknown.form_rate,null);
 await db.exec('TRUNCATE app.site_events');assert.deepEqual((await db.query(sql,[7])).rows,[]);
 await db.close();
});
