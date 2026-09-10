import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const activeCacheVersion=sw=>{
  const matches=[...sw.matchAll(/^const CACHE = 'lourex-invoice-v(\d+)';$/gm)];
  return matches.length?Number(matches.at(-1)[1]):0;
};

test('v197 product library guards same-tick save delete and favorite mutations synchronously',async()=>{
  const source=await read('src/components/ProductLibraryWorkspace.tsx');
  assert.match(source,/private mutationInFlight=false/);
  assert.match(source,/private mutating=\(\):boolean=>this\.mutationInFlight\|\|this\.state\.busy/);
  for(const marker of [
    'if(!item||this.mutating())return;',
    'this.mutationInFlight=true;',
    'await this.props.onSave(candidate)',
    'await this.props.onDelete(item)',
    'await this.props.onSave({...item,favorite:!Boolean(item.favorite)',
    'finally{this.mutationInFlight=false;}'
  ])assert.ok(source.includes(marker),marker);
  assert.match(source,/private duplicate=\(source:SavedItem\)=>\{\s*if\(this\.mutating\(\)\)return;/);
});

test('v197 product import rejects duplicate submit intent and stale asynchronous file reads',async()=>{
  const source=await read('src/components/ProductImportModal.tsx');
  assert.match(source,/private fileReadGeneration=0/);
  assert.match(source,/private applyInFlight=false/);
  assert.match(source,/const generation=\+\+this\.fileReadGeneration/);
  assert.match(source,/if\(generation!==this\.fileReadGeneration\|\|!this\.props\.open\)return;/);
  const apply=source.slice(source.indexOf('private apply=async()=>'),source.indexOf('render():any'));
  assert.ok(apply.indexOf('if(this.applyInFlight')<apply.indexOf('this.applyInFlight=true'));
  assert.ok(apply.indexOf('this.applyInFlight=true')<apply.indexOf('await this.props.onSaveMany(products)'));
  assert.match(apply,/finally\{\s*this\.applyInFlight=false;/);
});

test('v197 Operations uses one synchronous mutation lane for suppliers purchases expenses and inventory',async()=>{
  const source=await read('src/components/OperationsPage.tsx');
  assert.match(source,/private mutationInFlight=false/);
  const lane=source.slice(source.indexOf('private runMutation='),source.indexOf('private saveSupplier='));
  assert.match(lane,/if\(this\.mutationInFlight\)return false/);
  assert.ok(lane.indexOf('this.mutationInFlight=true')<lane.indexOf('await work()'));
  assert.match(lane,/finally\{this\.mutationInFlight=false;this\.setState\(\{busy:false\}\);\}/);
  for(const callback of ['onSaveSupplier','onDeleteSupplier','onSavePurchase','onDeletePurchase','onPostPurchase','onReversePurchase','onSaveExpense','onDeleteExpense','onSaveInventoryMovement','onDeleteInventoryMovement']){
    assert.match(source,new RegExp(`runMutation\\(async\\(\\)=>\\{[^}]*this\\.props\\.${callback}`,'s'),callback);
  }
  assert.match(source,/aria-busy=\{this\.state\.busy\}/);
  assert.match(source,/fieldset disabled=\{edit\.status!=='draft'\|\|this\.state\.busy\}/);
});

test('v197 functional browser gate is wired into CI',async()=>{
  const [ci,runner]=await Promise.all([read('.github/workflows/ci.yml'),read('tests/visual/run-functional-products-operations-v197.cjs')]);
  assert.match(ci,/node tests\/visual\/run-functional-products-operations-v197\.cjs/);
  assert.match(runner,/button\.click\(\);button\.click\(\)/);
  for(const marker of ['product save must be single-flight','product delete must be single-flight','product import must be single-flight','purchase post must be single-flight','inventory movement must be single-flight','Arabic operations retry must release the mutation lock'])assert.ok(runner.includes(marker),marker);
});

test('v197 product and Operations hardening remains preserved after later immutable PWA generations advance',async()=>{
  const sw=await read('public/sw.js');
  assert.ok(activeCacheVersion(sw)>=197,`active PWA cache must not regress below v197; got v${activeCacheVersion(sw)}`);
  assert.match(sw,/v197 product\/operations functional hardening/);
  assert.match(sw,/lourex-invoice-v197: preserved as a legacy marker/);
  assert.match(sw,/lourex-invoice-v196: preserved as a legacy marker/);
  for(const asset of ['./src/components/ProductLibraryWorkspace.js','./src/components/ProductImportModal.js','./src/components/OperationsPage.js'])assert.ok(sw.includes(asset),asset);
});
