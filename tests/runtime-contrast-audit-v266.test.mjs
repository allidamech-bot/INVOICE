import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('mobile report date fields inherit theme input foreground and accessible controls',async()=>{
 const [html,css,reports]=await Promise.all([read('index.html'),read('src/styles/tailadmin-finance-workspaces-v320.css'),read('src/components/ReportsPage.tsx')]);
 assert.ok(html.includes('tailadmin-finance-workspaces-v320.css'));
 assert.ok(css.includes('var(--ft-input)')&&css.includes('var(--ft-surface)'),'date controls use semantic surfaces');
 assert.ok(css.includes('.ta-reports-page'),'report style owner remains loaded');
 assert.ok(reports.includes('type="date"'),'report dates remain native and usable on Safari');
 assert.ok(!css.includes('.invoice-page'),'report date rules cannot alter print templates');
});

