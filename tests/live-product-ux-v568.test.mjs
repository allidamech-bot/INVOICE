import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('live product UX exposes deterministic gross margin without changing pricing data',async()=>{
  const source=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/function grossMarginLabel\(item:SavedItem\)/);
  assert.match(source,/decimalToScaled\(sale,6\)/);
  assert.match(source,/saleCurrency!==costCurrency/);
  assert.match(source,/t\('Margin','الهامش'\)/);
  assert.match(source,/t\('Gross margin','الهامش الإجمالي'\)/);
});

test('live product UX makes opening stock and planning setup discoverable without auto-posting inventory',async()=>{
  const [products,planning]=await Promise.all([
    read('src/components/ProductLibraryWorkspace.tsx'),
    read('src/components/InventoryPlanningLive.tsx')
  ]);
  assert.match(products,/Stock & adjustments/);
  assert.match(products,/Save this product first, then use Stock & adjustments to record opening stock/);
  assert.match(planning,/Set Reorder Policy/);
  assert.match(planning,/Opening stock is recorded through Inventory Movements/);
  assert.match(planning,/Planning never invents or posts stock automatically/);
});
