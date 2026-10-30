import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDigits,normalizeSellerPhone,remainingSeconds,draftKey,readDraft,writeDraft,DRAFT_TTL,saveChallenge,loadChallenge,clearChallenge} from '../src/shared/sellerFlow.ts';
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}}
const defaults={kind:'land',seller_name:'',seller_phone:'',area_m2:'',building_area_m2:'',extra_details:'',website:''};
const photo={url:'https://api.evazmelk.ir/api/public/media/11111111-1111-1111-1111-111111111111.webp',kind:'image'};
test('Persian, Arabic and mixed OTP digits preserve leading zero',()=>{
 assert.equal(normalizeDigits('۰١۲٣۴٥'),'012345');assert.equal(normalizeDigits('123456'),'123456');
 assert.equal(normalizeSellerPhone('+۹۸ ۹۲۱۲۷۴۵۷۵۵'),'09212745755');
 assert.equal(normalizeSellerPhone('۰۰۹۸۹۲۱۲۷۴۵۷۵۵'),'09212745755');
});
test('draft survives remount with media, excludes honeypot and isolates accounts',()=>{
 const store=storage();writeDraft(store,draftKey('a'),{...defaults,area_m2:'364',extra_details:'دوبر',website:'ignore'},[photo],1000);
 const loaded=readDraft(store,draftKey('a'),defaults,2000);assert.equal(loaded.restored,true);assert.equal(loaded.form.area_m2,'364');assert.equal(loaded.form.website,'');assert.deepEqual(loaded.media,[photo]);
 assert.equal(readDraft(store,draftKey('b'),defaults,2000).restored,false);
});
test('corrupted and expired drafts recover safely, external media rejected',()=>{
 const store=storage();store.setItem('bad','{');assert.equal(readDraft(store,'bad',defaults).restored,false);
 writeDraft(store,'expired',{...defaults,area_m2:'100'},[photo],1000);assert.equal(readDraft(store,'expired',defaults,1001+DRAFT_TTL).restored,false);
 writeDraft(store,'media',{...defaults,area_m2:'100'},[{url:'javascript:alert(1)',kind:'image'}],1000);assert.equal(readDraft(store,'media',defaults,2000).media.length,0);
});
test('cleared/submitted empty draft is removed instead of being restored',()=>{
 const store=storage();writeDraft(store,'draft',{...defaults,extra_details:'متن'},[],1000);writeDraft(store,'draft',{...defaults,seller_name:'فروشنده',seller_phone:'09212745755'},[],2000);assert.equal(store.getItem('draft'),null);
});
test('resend deadline survives reload without storing OTP or login tokens',()=>{
 globalThis.sessionStorage=storage();const deadline=Date.now()+60000;saveChallenge('09212745755',deadline);
 assert.equal(loadChallenge().deadline,deadline);assert.equal(remainingSeconds(deadline,deadline-59999),60);assert.equal(remainingSeconds(deadline,deadline+1),0);
 assert.deepEqual(Object.keys(loadChallenge()).sort(),['deadline','expires','phone']);clearChallenge();assert.equal(loadChallenge(),null);
});
