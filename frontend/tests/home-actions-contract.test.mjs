import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const root=dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read=path=>readFile(join(root,path),'utf8');

test('home actions keep seller and map paired with matching golden primary actions',async()=>{
 const [seller,map,styles]=await Promise.all([
  read('frontend/src/shared/HomeActionCards.tsx'),
  read('frontend/src/shared/HomeMapSection.tsx'),
  read('frontend/src/shared/home-boxes.css')
 ]);
 assert.match(seller,/ملک خود را جهت فروش ثبت کنید/);
 assert.doesNotMatch(seller,/درخواست فروش ملک را ثبت کنید/);
 assert.match(seller,/className="home-action-primary"/);
 assert.match(map,/className="home-action-primary home-map-open"/);
 assert.match(map,/className="home-map-page-link"/);
 assert.doesNotMatch(map,/className="link-button" type="button" onClick=\{onFullMap\}/);
 assert.match(styles,/linear-gradient\(120deg,#ffd567,#efab28\)/);
 assert.match(styles,/home-map-page-link/);
 assert.match(styles,/@media\(max-width:900px\)/);
 assert.match(styles,/home-actions-row\{margin:8px auto 6px/);
});
