import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');

test('editor workflow navigation keeps readable copy and 44px steps',async()=>{
  const css=await read('src/styles/tailadmin-editor-frame-v320.css');
  assert.match(css,/\.ta-editor-step-list>button[^}]*min-height:44px!important/);
  assert.match(css,/\.ta-editor-step-nav-heading small[^}]*font-size:10px!important/);
  assert.match(css,/\.ta-editor-step-label[^}]*font-size:11px!important/);
  assert.match(css,/\.ta-editor-step-number[^}]*font-size:10px!important/);
});

test('auth gateway primary navigation controls respect the touch floor',async()=>{
  const css=await read('src/styles/tailadmin-auth-v320.css');
  assert.match(css,/\.ta-auth-language\{min-height:44px/);
  assert.match(css,/\.ta-auth-tabs button\{min-height:44px/);
  assert.match(css,/\.ta-auth-link\{[^}]*min-height:44px/);
  assert.match(css,/\.ta-auth-primary\{width:100%!important;min-height:44px!important/);
});

test('global search mobile destinations and modal actions are touch safe',async()=>{
  const css=await read('src/styles/tailadmin-overlays-v320.css');
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.segmented button\{min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.global-search-back-button,\.global-search-destinations button\{min-height:44px!important/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.modal-footer-actions \.btn\{width:100%!important;min-height:44px!important/);
});

test('settings mobile navigation and segmented controls remain touch safe',async()=>{
  const css=await read('src/styles/tailadmin-settings-v320.css');
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.ta-settings-nav button\{min-width:140px;min-height:52px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.ta-settings-segmented button,\.ta-settings-link-action,\.ta-settings-asset-trigger\{min-height:44px/);
});
