import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v147 keeps all six phone workspaces in one navigation row',async()=>{
  const [app,reportsCss]=await Promise.all([read('src/app/App.tsx'),read('src/styles/reports-v135.css')]);
  for(const screen of ['documents','customers','receivables','reports','items','operations'])assert.ok(app.includes(`screen==='${screen}'`),screen);
  assert.ok(reportsCss.includes('grid-template-columns:repeat(6,minmax(0,1fr))'));
  assert.ok(reportsCss.includes('.app-ui .main-nav button'));
});

test('v147 compacts customer and operations phone workspaces without changing printable documents',async()=>{
  const css=await read('src/styles/mobile-ui-rebalance-v146.css');
  for(const selector of ['.app-ui .customers-page .page-heading','.app-ui .customer-card','.app-ui .operations-hero','.app-ui .operations-summary > div','.app-ui .operations-tabs button','.app-ui .operation-row'])assert.ok(css.includes(selector),selector);
  assert.ok(css.includes('v147 phase 2'));
  assert.ok(css.includes('@media print'));
  assert.ok(!css.includes('.document-page{'));
  assert.ok(!css.includes('.document-header{'));
});
