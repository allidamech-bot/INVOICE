import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('price-list dark theme owns readable text/surfaces, and product names do not truncate',async()=>{
 const css=await readFile('src/styles/pricing-batch8.css','utf8');
 const batch=css.split('/* UX rehab A: theme-safe price list, without touching catalog pricing rules. */')[1];
 assert.ok(batch,'batch A must have scoped price-list theme');
 assert.match(batch,/html:is\(\[data-ui-theme="dark"\],\[data-theme="dark"\]\) \.lx-price-lists\{/);
 for(const token of ['--lx-surface:','--lx-text:','--lx-muted:','--lx-border:'])assert.ok(batch.includes(token),token);
 assert.match(batch,/\.lx-price-lists \.lx-price-product strong\{[\s\S]*?white-space:normal/);
 assert.doesNotMatch(batch,/\.invoice-page|\.document-page|\.a4[-_]/i);
});

test('inventory planning dark theme and mobile density stay presentation-only',async()=>{
 const css=await readFile('src/styles/inventory-planning-batch7.css','utf8');
 const batch=css.split('/* UX rehab A: inventory planning dark surfaces, text and form contrast.')[1];
 assert.ok(batch,'batch A inventory planning styles must exist');
 assert.match(batch,/html:is\(\[data-ui-theme="dark"\],\[data-theme="dark"\]\) \.lx-inventory-planning\{/);
 for(const token of ['--lx-surface:','--lx-text:','--lx-muted:','--lx-border:'])assert.ok(batch.includes(token),token);
 assert.match(batch,/@media\(max-width:640px\)/);
 assert.doesNotMatch(batch,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
