import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
test('Liara routing keeps management and previews while unknown public paths return 404',()=>{
 const source=readFileSync(new URL('../../build-liara.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('error_page 404 /404.html;'));assert.ok(source.includes('try_files $uri $uri/ =404;'));
 assert.ok(source.includes('location /management/'));assert.ok(source.includes('location = /mobile-preview'));
 assert.ok(source.includes('X-Content-Type-Options'));assert.ok(source.includes('X-Frame-Options'));assert.ok(source.includes('Referrer-Policy'));assert.ok(source.includes('nginxConfig.replace(/(location [^{]+\\{)/g'));
 assert.ok(!source.includes('try_files $uri $uri/ /index.html'));
});
