import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('245 properties remain reachable through every page; new seller kinds and legacy rows survive migration',async()=>{
 const db=new PGlite();
 const source=readFileSync(new URL('../app/main.py',import.meta.url),'utf8').split('def list_direct_properties(')[1].split('class HomepagePromotionUpdate')[0];
 const sql=source.match(/rows=conn.execute\("""([\s\S]*?)"""/)[1].replaceAll('%s','$PARAM');let at=0;const query=sql.replaceAll('$PARAM',()=>'$'+(++at));
 const columns=[...new Set([...sql.matchAll(/p\.([a-z_0-9]+)/g)].map(x=>x[1]))];
 await db.exec(`CREATE SCHEMA app;CREATE TABLE app.properties(${columns.map(name=>name+' '+(name==='created_at'?'timestamptz':'text')).join(',')});
 CREATE TABLE app.property_types(id text DEFAULT gen_random_uuid()::text,code text UNIQUE,name text,category text);
 CREATE TABLE app.regions(id text,name text);CREATE TABLE app.listings(market_record_id text,asking_price_toman numeric,published_at timestamptz);
 CREATE TABLE app.market_records(id text,property_id text);CREATE TABLE app.property_sales(property_id text,sale_date text,sale_price_toman numeric);
 CREATE TABLE app.property_submissions(kind text CHECK(kind IN ('land','villa','apartment','mehr','national')));
 INSERT INTO app.property_types(id,code,name,category) VALUES ('type','raw_land','زمین','زمین');INSERT INTO app.property_submissions VALUES ('land');`);
 await db.exec("INSERT INTO app.properties(id,public_code,property_type_id,created_at) SELECT lpad(i::text,3,'0'),lpad(i::text,3,'0'),'type',now() FROM generate_series(1,245) i");
 const migration=readFileSync(new URL('../../database/migrations/0018_seller_types_admin_pages.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 const codes=[];for(let offset=0;offset<245;offset+=50){const rows=(await db.query(query,['',50,offset])).rows;assert.equal(rows.length,Math.min(50,245-offset));codes.push(...rows.map(x=>x.public_code))}
 assert.equal(new Set(codes).size,245);assert.equal(codes[0],'245');assert.equal(codes.at(-1),'001');
 assert.equal((await db.query(query,['145',50,0])).rows[0].public_code,'145');assert.equal((await db.query(query,['%',50,0])).rows.length,0);
 await db.exec("INSERT INTO app.property_submissions VALUES ('garden'),('shop')");
 assert.equal((await db.query('SELECT count(*)::int AS n FROM app.property_submissions')).rows[0].n,3);
 await assert.rejects(db.query("INSERT INTO app.property_submissions VALUES ('unknown')"));
 assert.equal((await db.query("SELECT count(*)::int AS n FROM app.property_types WHERE code IN ('shop','urban_garden')")).rows[0].n,2);await db.close();
});
