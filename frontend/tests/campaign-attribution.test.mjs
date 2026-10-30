import test from 'node:test';
import assert from 'node:assert/strict';
import {attributionFor,campaignChanged,cleanAttribution} from '../src/shared/campaignAttribution.js';
test('UTM tags survive internal navigation and form/login pages',()=>{
 const first=attributionFor('?utm_source=instagram&utm_medium=social&utm_campaign=aban_1405','instagram.com',null);
 assert.equal(first.campaign,'aban_1405');
 assert.deepEqual(attributionFor('','',first),first);
 assert.equal(campaignChanged(first,attributionFor('','',first)),false);
});
test('new campaign overrides prior direct or campaign context and rotates visit',()=>{
 const next=attributionFor('?utm_source=sms&utm_medium=sms&utm_campaign=second','',{source:'instagram',campaign:'first'});
 assert.equal(next.source,'sms');assert.equal(campaignChanged({source:'instagram',campaign:'first'},next),true);
 assert.equal(campaignChanged({},next),true);assert.equal(campaignChanged(null,next),false);
});
test('untrusted labels do not copy URL queries or form contents',()=>{
 assert.deepEqual(cleanAttribution({source:'instagram',phone:'private',description:'private',referrer:'https://example.com?secret=1',campaign:'a&password=x'}),{source:'instagram'});
 assert.deepEqual(cleanAttribution(null),{});
 assert.equal(cleanAttribution({campaign:'آبان ۱۴۰۵'}).campaign,'آبان ۱۴۰۵');
 assert.equal(cleanAttribution({campaign:'x'.repeat(500)}).campaign.length,120);
});
