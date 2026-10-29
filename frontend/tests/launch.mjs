import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
 const listeners=new EventTarget();let current=new URL('https://evazmelk.ir/');const stack=[current.href];let at=0;
 globalThis.location=current;
 globalThis.window={get location(){return current},history:{pushState(state,unused,path){current=new URL(path,current);globalThis.location=current;stack.splice(at+1);stack.push(current.href);at++}},scrollTo(){},dispatchEvent:e=>listeners.dispatchEvent(e),addEventListener:(...a)=>listeners.addEventListener(...a),removeEventListener:(...a)=>listeners.removeEventListener(...a)};
 globalThis.history=window.history;
 const nav=await server.ssrLoadModule('/src/shared/navigation.ts');
 assert.equal(nav.readRoute().page,'home');nav.navigate('property','EV/101 فارسی');assert.equal(nav.readRoute().code,'EV/101 فارسی');assert.equal(nav.readRoute().page,'property');
 nav.navigate('map','EV/101 فارسی');assert.equal(nav.readRoute().focusCode,'EV/101 فارسی');current=new URL(stack[--at]);globalThis.location=current;window.dispatchEvent(new Event('popstate'));assert.equal(nav.readRoute().page,'property');
 nav.navigateSearchRegions(['R-1','R-2']);assert.equal(nav.readRoute().page,'listings');assert.deepEqual(current.searchParams.getAll('region'),['R-1','R-2']);
 const ui=await server.ssrLoadModule('/src/shared/propertyUI.tsx');const {PropertyContent,persianDate}=await server.ssrLoadModule('/src/shared/PropertyPage.tsx');
 const property={public_code:'EV-101',property_type:'خانهٔ ویلایی',property_code:'villa_house',region:'اوز',neighborhood:'بردسپی',asking_price_toman:15555000000,area_m2:200,building_area_m2:120,bedrooms:3,land_width_m:10,land_length_m:20,latitude:27.76,longitude:54,public_notes:'توضیحات عمومی ملک',updated_at:'2026-10-29T08:00:00Z',published_at:'2026-10-28T08:00:00Z',media:[{kind:'image',url:'https://api.evazmelk.ir/api/public/media/a.webp'},{kind:'video',url:'https://api.evazmelk.ir/api/public/media/a.mp4'}]};
 const card=renderToStaticMarkup(React.createElement(ui.ListingCard,{item:property,onOpen(){}}));assert.ok(!card.includes('دیدن روی نقشه'));assert.ok(!card.includes('اشتراک‌گذاری'));
 const detail=renderToStaticMarkup(React.createElement(PropertyContent,{item:property}));for(const text of ['۱۵٬۵۵۵٬۰۰۰٬۰۰۰','توضیحات عمومی ملک','اشتراک‌گذاری آگهی','دیدن این ملک روی نقشه','تعداد خواب','عرض زمین','video','tel:09212745755'])assert.ok(detail.includes(text),text);
 assert.match(persianDate('2026-10-29T12:00:00Z'),/۱۴۰۵/);assert.match(persianDate('2026-10-29T12:00:00Z'),/آبان/);
 const Search=(await server.ssrLoadModule('/src/shared/SearchPage.tsx')).default;const search=renderToStaticMarkup(React.createElement(Search,{onOpen(){}}));assert.equal((search.match(/type="range"/g)||[]).length,4);assert.ok(!search.includes('type="text"'));assert.ok(search.includes('باغ شهری'));
 const Graph=(await server.ssrLoadModule('/src/PriceDashboard.tsx')).Graph;const chart=renderToStaticMarkup(React.createElement(Graph,{name:'زمین',points:[{period:'1405/06',value_toman:100,count:null},{period:'1405/08',value_toman:120,count:null,updated_at:'2026-10-29T12:00:00Z'}],color:'blue',unit:'برای هر متر زمین',loading:false}));assert.ok(chart.includes('1405/06')&&chart.includes('1405/08')&&chart.includes('به‌روزرسانی'));
 let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({series:{},regions:[]})}};const {getPriceSeries}=await server.ssrLoadModule('/src/shared/priceSeries.ts');await Promise.all([getPriceSeries('all'),getPriceSeries('all')]);await getPriceSeries('all');assert.equal(calls,1);assert.doesNotMatch(readFileSync('src/PriceDashboard.tsx','utf8'),/visibilitychange|setInterval/);
 console.log('PASS: routes, encoded codes, history, multi-region links, summary cards, exact details, gallery/video, Persian date, filters, chart dates, price cache');
}finally{await server.close()}
