import test from 'node:test';import assert from 'node:assert/strict';
import {readRoute} from '../src/shared/navigation.ts';
import {pageMetadata} from '../src/shared/seoMetadata.js';
test('unknown and malformed routes do not silently display the home page',()=>{
 const old=globalThis.window;
 try{for(const [path,page] of [['/','home'],['/search','listings'],['/not-a-page','notfound'],['/properties/%ZZ','notfound'],['/properties/01','property']]){globalThis.window={location:{href:'https://evazmelk.ir'+path}};assert.equal(readRoute().page,page)}assert.equal(pageMetadata('/not-a-page').robots,'noindex,follow')}finally{if(old===undefined)delete globalThis.window;else globalThis.window=old}
});
