import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';

test('large UI artwork uses optimized WebP while install/notification PNG icons remain available',()=>{
 const root=new URL('../public/brand/',import.meta.url);
 for(const file of ['logo-emblem-v2.webp','admin-login-villa.webp'])assert.ok(existsSync(new URL(file,root)),`${file} exists`);
 for(const file of ['logo-emblem-v2.png','admin-login-villa.png'])assert.ok(existsSync(new URL(file,root)),`${file} fallback remains`);
 const sourceFiles=[
  new URL('../src/SellerAccount.tsx',import.meta.url),
  new URL('../src/mobile/MobileView.tsx',import.meta.url),
  new URL('../src/desktop/DesktopView.tsx',import.meta.url),
  new URL('../src/shared/PanelLogin.tsx',import.meta.url),
  new URL('../../admin/src/App.tsx',import.meta.url),
  new URL('../../admin/src/AdminLogin.tsx',import.meta.url),
  new URL('../src/shared/panel-login.css',import.meta.url),
  new URL('../../admin/src/admin-login.css',import.meta.url),
 ];
 for(const file of sourceFiles){
  const source=readFileSync(file,'utf8');
  assert.ok(!source.includes('/brand/logo-emblem-v2.png'),`${file.pathname} uses WebP logo`);
  assert.ok(!source.includes('/brand/admin-login-villa.png'),`${file.pathname} uses WebP login artwork`);
 }
});
