import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mobileCss = readFileSync(new URL('../src/mobile/mobile.css', import.meta.url), 'utf8');
const mapCss = readFileSync(new URL('../src/shared/mapInteraction.css', import.meta.url), 'utf8');
const gestureLock = readFileSync(new URL('../src/shared/mobileGestureLock.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('mobile viewport is fixed to device width and page pinch zoom is disabled', () => {
  assert.match(html, /name="viewport" content="[^"]*width=device-width[^"]*maximum-scale=1\.0[^"]*user-scalable=no/);
});

test('mobile document prevents horizontal viewport drift', () => {
  assert.match(mobileCss, /html, body, #root\s*\{[^}]*overflow-x:\s*clip/s);
  assert.match(mobileCss, /\.site\.mobile-site\s*\{[^}]*max-width:\s*100vw/s);
});

test('map receives gesture handling only after explicit activation', () => {
  assert.match(mobileCss, /\.map-interaction-active[\s\S]*?touch-action:\s*none\s*!important/);
  assert.match(mapCss, /\.map-interaction-locked[\s\S]*?touch-action:pan-y!important/);
});

test('iOS Safari page gestures are blocked except inside the activated map', () => {
  assert.match(gestureLock, /gesturestart/);
  assert.match(gestureLock, /event\.touches\.length > 1/);
  assert.match(gestureLock, /MAP_SELECTOR/);
  assert.match(main, /installMobileGestureLock\(\)/);
});
