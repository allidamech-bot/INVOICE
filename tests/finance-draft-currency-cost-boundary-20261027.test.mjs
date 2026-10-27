import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument,emptyItem} from '../dist/src/lib/documents.js';
import {calculateProfitability} from '../dist/src/lib/profitability.js';
import {
  changeDraftCurrencyCosts,preserveLatestUnitCostsForMatchingIdentity
} from '../dist/src/lib/saved-items.js';

function draft(){
 const doc=createBlankDocument('invoice','INV-CURRENCY-QA',defaultCompany());
 doc.currency='USD';
 doc.items=[
  {...emptyItem(),id:'line-1',quantity:'2',unitPrice:'20.00',unitCost:'5.00',descriptionEn:'Cartons'},
  {...emptyItem(),id:'line-2',quantity:'1',unitPrice:'15.00',unitCost:'3.00',descriptionEn:'Service'}
 ];
 doc.internalCosts={shippingCost:'4.00',otherCost:'2.00'};
 return doc;
}
async function editorWrapper(){
 const source=await readFile(new URL('../src/components/EditorPage.tsx',import.meta.url),'utf8');
 const method=source.match(/private withLatestInternalCosts=\(doc:LourexDocument\):LourexDocument=>\{[\s\S]*?\n  \};/)?.[0];
 assert.ok(method,'the real editor autosave reconciliation method is required');
 const js=ts.transpileModule(
  'class Harness {\n'+method+'\n}\nexports.Harness=Harness;',
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}
 ).outputText;
 const context={exports:{},preserveLatestUnitCostsForMatchingIdentity};
 vm.runInNewContext(js,context);
 return context.exports.Harness;
}

test('22-C: currency change invalidates all line and overhead costs without inventing conversion',()=>{
 const original=draft(),before=structuredClone(original);
 const changed=changeDraftCurrencyCosts(original,'EUR');
 assert.equal(changed.currency,'EUR');
 assert.deepEqual(changed.items.map(item=>item.unitCost),['','']);
 assert.deepEqual(changed.items.map(item=>item.unitPrice),['20.00','15.00']);
 assert.equal(changed.internalCosts.shippingCost,'');
 assert.equal(changed.internalCosts.otherCost,'');
 const summary=calculateProfitability(changed);
 assert.equal(summary.complete,false);
 assert.equal(summary.missingCostItems,2);
 assert.equal(summary.marginPercent,'');
 assert.deepEqual(original,before,'editing must not mutate original invoice or its cost history');
});

test('22-C: unchanged currency preserves manual costs and case-only normalization',()=>{
 const doc=draft();
 assert.deepEqual(changeDraftCurrencyCosts(doc,'USD').items,doc.items);
 const changed=changeDraftCurrencyCosts(doc,'usd');
 assert.equal(changed.currency,'usd');
 assert.deepEqual(changed.items.map(x=>x.unitCost),['5.00','3.00']);
 assert.equal(changed.internalCosts.shippingCost,'4.00');
 assert.equal(changed.internalCosts.otherCost,'2.00');
});

test('22-C: finalized documents cannot be changed by the draft cost helper',()=>{
 const doc={...draft(),status:'final'};
 assert.equal(changeDraftCurrencyCosts(doc,'EUR'),doc);
 assert.equal(doc.currency,'USD');
});

test('22-C: real editor currency handler invokes the guarded transition',async()=>{
 const source=await readFile(new URL('../src/components/EditorPageCore.tsx',import.meta.url),'utf8');
 assert.match(source,/private field=\(key:keyof LourexDocument,value:any\)=>this\.mutate\(d=>key==='currency'\?changeDraftCurrencyCosts\(d,String\(value\)\)/);
 assert.match(source,/this\.state\.doc\.status==='final'\|\|this\.issuancePending/);
});

test('22-C: real autosave wrapper cannot reintroduce stale USD costs into a EUR draft',async()=>{
 const Harness=await editorWrapper();
 const old=draft(),newDraft=changeDraftCurrencyCosts(old,'EUR');
 const harness=new Harness();
 harness.props={document:old};
 assert.equal(preserveLatestUnitCostsForMatchingIdentity(newDraft.items,old.items)[0].unitCost,'5.00',
  'legacy same-identity reconciliation would otherwise resurrect an old cost');
 const protectedDraft=harness.withLatestInternalCosts(newDraft);
 assert.equal(protectedDraft.currency,'EUR');
 assert.deepEqual(Array.from(protectedDraft.items,item=>item.unitCost),['','']);
 assert.equal(protectedDraft.internalCosts.shippingCost,'');
 assert.equal(protectedDraft.internalCosts.otherCost,'');
 assert.equal(old.items[0].unitCost,'5.00');
});

test('22-C: autosave wrapper preserves the existing same-currency cost reconciliation',async()=>{
 const Harness=await editorWrapper();
 const old=draft();
 const candidate=structuredClone(old);
 candidate.items[0].unitCost='1.00';
 candidate.internalCosts.shippingCost='0.00';
 const harness=new Harness();
 harness.props={document:old};
 const merged=harness.withLatestInternalCosts(candidate);
 assert.equal(merged.items[0].unitCost,'5.00');
 assert.equal(merged.internalCosts.shippingCost,'4.00');
});
