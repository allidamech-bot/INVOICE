import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultAppSettings } from '../dist/src/lib/defaults.js';

test('smart defaults keep independent quote/invoice template slots and favorites',()=>{
  const smart=defaultAppSettings().smartDefaults;
  assert.equal(smart.quoteTemplateId,'executive');
  assert.equal(smart.invoiceTemplateId,'executive');
  assert.deepEqual(smart.favoriteTemplateIds,[]);
  const changed={...smart,quoteTemplateId:'noir',invoiceTemplateId:'minimal',favoriteTemplateIds:['noir','minimal']};
  assert.equal(changed.quoteTemplateId,'noir');
  assert.equal(changed.invoiceTemplateId,'minimal');
  assert.deepEqual(changed.favoriteTemplateIds,['noir','minimal']);
});

test('editor and template selector wire explicit favorites and per-kind defaults',async()=>{
  const [editor,selector,css,html,sw]=await Promise.all([
    readFile('src/components/EditorPage.tsx','utf8'),
    readFile('src/templates/TemplateThumbnails.tsx','utf8'),
    readFile('src/styles/template-preferences.css','utf8'),
    readFile('index.html','utf8'),
    readFile('public/sw.js','utf8')
  ]);
  assert.match(editor,/quoteTemplateId/);
  assert.match(editor,/invoiceTemplateId/);
  assert.match(editor,/favoriteTemplateIds/);
  assert.match(editor,/Set as quote default/);
  assert.match(editor,/Set as invoice default/);
  assert.match(selector,/template-favorite-button/);
  assert.match(selector,/template-default-badge/);
  assert.match(css,/template-preference-bar/);
  assert.match(html,/template-preferences\.css/);
  assert.match(sw,/lourex-invoice-v40/);
  assert.match(sw,/template-preferences\.css/);
});
