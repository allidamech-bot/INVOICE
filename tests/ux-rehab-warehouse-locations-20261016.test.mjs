import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('warehouses expose true active/archive labels and surface errors near page header',async()=>{
 const src=await read('src/components/WarehouseLocationsPage.tsx');
 assert.match(src,/className="lx-warehouse-feedback lifecycle-error" role="alert" aria-live="assertive"/);
 assert.match(src,/className=\{\`lx-location-status \$\{w.active\?'is-active':'is-inactive'\}\`\}/);
 assert.match(src,/w.active\?t\('Active','نشط'\):t\('Archived','مؤرشف'\)/);
 assert.match(src,/className="lx-warehouse-card-meta"/);
 assert.equal((src.match(/role="alert"/g)||[]).length,1,'errors must not be duplicated under transfer form');
 assert.match(src,/\bcanArchiveWarehouse\(/,'archive stock safety remains wired');
 assert.match(src,/\bwarehouseItemQuantity\(/,'source location balance check remains');
 assert.match(src,/required>available/,'oversized transfers remain blocked');
});

test('warehouse inventory table remains semantic, labelled and keyboard scrollable',async()=>{
 const src=await read('src/components/WarehouseLocationsPage.tsx');
 assert.match(src,/className="ta-table-wrap lx-warehouse-balances-scroll" role="region"/);
 assert.match(src,/tabIndex=\{0\}/);
 assert.match(src,/aria-label=\{t\('Filter stock balances by location'/);
 assert.match(src,/<caption className="lx-visually-hidden">/);
 assert.match(src,/<table className="ta-table"><caption/);
});

test('warehouse card contrast and density follow approved v485 palette without styling paper',async()=>{
 const css=await read('src/styles/roadmap-hardening-final.css');
 const block=css.split('/* UX rehab A / 2026-10-16 — Stock Locations.')[1];
 assert.ok(block,'warehouse UI scope must exist');
 for(const key of ['--lx485-surface','--lx485-text','--lx485-muted','--lx485-line'])assert.ok(block.includes(key),key);
 assert.match(block,/\.app-ui \.lx-warehouse-page \.lx-location-card\.is-archived\{[\s\S]*?opacity:1/);
 assert.match(block,/\.app-ui \.lx-warehouse-page \.lx-warehouse-balances-scroll\{[\s\S]*?overflow-x:auto/);
 assert.match(block,/\.app-ui \.lx-warehouse-page \.lx-warehouse-balances-scroll:focus-visible/);
 assert.match(block,/\.app-ui \.lx-warehouse-page \.lx-warehouse-balances-scroll>\.ta-table\{[\s\S]*?min-width:550px/);
 assert.match(block,/\.app-ui \.lx-warehouse-page \.lx-form-grid :is\(input,select,textarea\)\{[\s\S]*?font-size:16px/);
 assert.match(block,/@media screen and \(max-width:720px\)\{[\s\S]*?\.app-ui \.lx-warehouse-page :is\(input,select,textarea\)\{[\s\S]*?font-size:16px!important/);
 assert.doesNotMatch(block,/\.invoice-page|\.document-page|\.a4[-_]/i);
});
