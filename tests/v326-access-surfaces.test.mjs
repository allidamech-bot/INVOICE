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
  assert.match(css,/\.ta-setup-logo-upload>b\{min-height:44px/);
});

test('global search destinations and modal actions are touch safe at every viewport',async()=>{
  const css=await read('src/styles/tailadmin-overlays-v320.css');
  assert.match(css,/\.segmented button\{min-height:44px!important/);
  assert.match(css,/\.global-search-back-button\{min-width:44px!important;min-height:44px!important/);
  assert.match(css,/\.global-search-destinations button\{min-height:44px!important/);
  assert.match(css,/\.modal-footer-actions \.btn\{min-height:44px!important/);
  assert.match(css,/\.modal-header :where\(button,\.icon-btn\)\{min-width:44px!important;min-height:44px!important/);
});

test('settings navigation and segmented controls retain the global touch floor',async()=>{
  const css=await read('src/styles/tailadmin-settings-v320.css');
  assert.match(css,/\.ta-settings-nav button\{width:100%;min-height:58px/);
  assert.match(css,/\.ta-settings-segmented button\{flex:1;min-height:44px/);
  assert.match(css,/\.ta-settings-link-action\{width:max-content;min-height:44px/);
  assert.match(css,/\.ta-settings-asset-trigger\{grid-column:2;min-height:44px/);
  assert.match(css,/@media\(max-width:720px\)[\s\S]*\.ta-settings-nav button\{min-width:140px;min-height:52px/);
});
