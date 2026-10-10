import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current shared UI styles cover all workspaces without retired v144 presentation overrides',async()=>{
 const [html,css]=await Promise.all([read('index.html'),read('src/styles/tailadmin-shell-v320.css')]);
 for(const layer of ['tailadmin-shell-v320.css','tailadmin-dashboard-v320.css','tailadmin-documents-v320.css','tailadmin-customers-v320.css','tailadmin-products-v320.css','tailadmin-finance-workspaces-v320.css','tailadmin-operations-v320.css','tailadmin-settings-v320.css'])assert.ok(html.includes(layer),layer);
 assert.ok(css.includes('.ta-shell')&&css.includes('.ta-mobile-nav'));
 assert.ok(!html.includes('system-ui-ux-v144.css'));
});

test('shared app shell and overlays are touch-safe, keyboard safe and print-isolated',async()=>{
 const [shell,overlays]=await Promise.all([read('src/styles/tailadmin-shell-v320.css'),read('src/styles/tailadmin-overlays-v320.css')]);
 assert.ok(shell.includes('@media')&&shell.includes('safe-area-inset-bottom'));
 assert.ok(shell.includes('.ta-mobile-nav'));
 assert.ok(overlays.includes('.modal-backdrop')&&overlays.includes('min-height:44px'));
 assert.ok(!shell.includes('.invoice-page')&&!overlays.includes('.invoice-page'));
});

test('financial workspaces maintain clear metrics and compact responsive ledger rows',async()=>{
 const [finance,ops,reports]=await Promise.all([read('src/styles/tailadmin-finance-v320.css'),read('src/styles/tailadmin-operations-v320.css'),read('src/styles/tailadmin-finance-workspaces-v320.css')]);
 for(const css of [finance,ops,reports])assert.ok(css.includes('var(--ft-'),'financial tokens must be theme-aware');
 assert.ok(finance.includes('receivable')&&reports.includes('ta-reports-page'));
 assert.ok(ops.includes('.ta-ops-row')&&ops.includes('min-height:44px'));
 for(const css of [finance,ops,reports])assert.ok(!css.includes('.invoice-page'));
});

