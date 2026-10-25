import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument, emptyItem } from '../dist/src/lib/documents.js';
import { defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';
import { calculateProfitability } from '../dist/src/lib/profitability.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { applySavedItemSuggestionToLine, bindCatalogItemToLine, editDocumentItemField, mergeSavedItemSelections, preserveLatestUnitCostsForMatchingIdentity, savedUnitCostForCurrency } from '../dist/src/lib/saved-items.js';

const saved=(id,unitCost='8.00',costCurrency='USD')=>({
  id,sku:id,createdAt:'2026-10-25T00:00:00.000Z',updatedAt:'2026-10-25T00:00:00.000Z',
  descriptionEn:id,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',
  lastUnitPrice:'14.00',lastCurrency:'USD',lastUnitCost:unitCost,lastCostCurrency:costCurrency,
  usageCount:1,lastUsedAt:'2026-10-25T00:00:00.000Z',inventoryTracking:'tracked'
});
const line=()=>({...emptyItem(),id:'line-1',savedItemId:'A',skuSnapshot:'A',descriptionEn:'A',unit:'PCS',quantity:'2',unitPrice:'10.00',unitCost:'5.00',stockTreatment:'tracked'});
const profit=(item)=>{const doc=createBlankDocument('invoice','INV-QA-22A',defaultCompany());doc.currency='USD';doc.items=[item];return calculateProfitability(doc);};

test('22-A: A → B replaces the old cost and calculates B-only profitability',()=>{
  const a=line(),b=applySavedItemSuggestionToLine(a,saved('B','8.00'),'USD');
  assert.equal(a.unitCost,'5.00');assert.equal(b.savedItemId,'B');assert.equal(b.unitCost,'8.00');
  assert.equal(b.unitPrice,'14.00');assert.equal(profit(b).itemCost,'16.00');assert.equal(profit(b).complete,true);
});

test('22-A: changing identity to B without verified B cost never produces a complete profit',()=>{
  for(const entry of [saved('B','8.00','EUR'),saved('B','', 'USD'),saved('B','-3.00','USD'),saved('B','8.00','')]){
    const b=applySavedItemSuggestionToLine(line(),entry,'USD');
    assert.equal(b.unitCost,'');const result=profit(b);
    assert.equal(result.complete,false);assert.equal(result.missingCostItems,1);assert.equal(result.marginPercent,'');
  }
});

test('22-A: identity edits clear old cost, but price/quantity and unchanged identity preserve manual cost',()=>{
  const source=line();
  for(const k of ['descriptionEn','descriptionAr','unit','packing']){
    const next=editDocumentItemField(source,k, k==='unit'?'KG':'new');
    assert.equal(next.unitCost,'');assert.equal(next.savedItemId,'');assert.equal(profit(next).complete,false);
  }
  for(const [key,value] of [['unitPrice','18'],['quantity','3'],['descriptionEn','A']]){
    const next=editDocumentItemField(source,key,value);assert.equal(next.unitCost,'5.00');assert.equal(next.savedItemId,'A');
  }
});

test('22-A: selecting the same catalog ID preserves manually edited cost',()=>{
  const next=applySavedItemSuggestionToLine(line(),saved('A','2.00'),'USD');
  assert.equal(next.unitCost,'5.00');
});

test('22-A: manual stock binding never inherits an unrelated cost or changes sales pricing',()=>{
  const source=line();
  const next=bindCatalogItemToLine(source,saved('B','9.00','EUR'),'USD');
  assert.equal(next.savedItemId,'B');assert.equal(next.unitCost,'');assert.equal(next.unitPrice,'10.00');
  assert.equal(bindCatalogItemToLine(source,saved('B','7.25'),'USD').unitCost,'7.25');
  assert.equal(bindCatalogItemToLine(source,undefined,'USD').unitCost,'');
});

test('22-A: newly inserted saved items require currency-tagged cost evidence',()=>{
  for(const [cost,currency,expected] of [['8.00','USD','8.00'],['8.00','EUR',''],['8.00','',''],['bad','USD',''],['0.00','USD','0.00']]){
    const entry=saved('B',cost,currency);
    const added=mergeSavedItemSelections([], [entry], 'USD');
    assert.equal(added[0].unitCost,expected);
    assert.equal(savedUnitCostForCurrency(entry,'USD'),expected);
  }
});

test('22-A: stale editor-wrapper props cannot resurrect A cost during reconciliation',()=>{
  const latestA=line(),nextB=applySavedItemSuggestionToLine(latestA,saved('B','8.00'),'USD');
  assert.equal(preserveLatestUnitCostsForMatchingIdentity([nextB],[latestA])[0].unitCost,'8.00');
  const nextUnknown=applySavedItemSuggestionToLine(latestA,saved('B','8.00','EUR'),'USD');
  assert.equal(preserveLatestUnitCostsForMatchingIdentity([nextUnknown],[latestA])[0].unitCost,'');
  const newerB={...nextB,unitCost:'9.00'};
  assert.equal(preserveLatestUnitCostsForMatchingIdentity([nextB],[newerB])[0].unitCost,'9.00');
  assert.equal(preserveLatestUnitCostsForMatchingIdentity([editDocumentItemField(latestA,'descriptionEn','Renamed')],[latestA])[0].unitCost,'');
});

test('22-A: editor uses the checked transitions and retains the final-document guard',async()=>{
  const editor=await readFile(new URL('../src/components/EditorPageCore.tsx',import.meta.url),'utf8');
  assert.match(editor,/editDocumentItemField\(i,key,value\)/);
  assert.match(editor,/applySavedItemSuggestionToLine\(item,saved,doc.currency\)/);
  assert.match(editor,/bindCatalogItemToLine\(line,saved,doc.currency\)/);
  assert.match(editor,/this\.state\.doc\.status==='final'\|\|this\.issuancePending/);
  const wrapper=await readFile(new URL('../src/components/EditorPage.tsx',import.meta.url),'utf8');
  assert.match(wrapper,/preserveLatestUnitCostsForMatchingIdentity\(doc.items,latest.items\)/);
});


test('22-A: saved draft and JSON reload retain B cost, never resurrect A on missing-currency B',()=>{
  const originalVault=emptyVault();
  const invoice=createBlankDocument('invoice','INV-QA-22A-RELOAD',originalVault.company);
  invoice.currency='USD';
  invoice.items=[line()];
  originalVault.documents=[invoice];
  const snapshots=[
    {catalog:saved('B','8.00','USD'),expected:'8.00',complete:true},
    {catalog:saved('B','8.00','EUR'),expected:'',complete:false}
  ];
  for(const {catalog,expected,complete} of snapshots){
    const edited=applySavedItemSuggestionToLine(invoice.items[0],catalog,'USD');
    // The outer editor may still hold A's older cost while the new selection saves.
    const protectedLine=preserveLatestUnitCostsForMatchingIdentity([edited],invoice.items)[0];
    const intent={...originalVault,documents:[{...invoice,items:[protectedLine],updatedAt:'2026-10-25T12:00:00.000Z'}]};
    const committed=mergeVaultIntent(originalVault,intent,originalVault);
    const reopened=JSON.parse(JSON.stringify(committed));
    const persisted=reopened.documents.find(doc=>doc.id===invoice.id);
    assert.ok(persisted,'draft must survive vault merge and reload');
    assert.equal(persisted.items[0].savedItemId,'B');
    assert.equal(persisted.items[0].unitCost,expected);
    const summary=calculateProfitability(persisted);
    assert.equal(summary.complete,complete);
    assert.equal(summary.marginPercent==='',!complete);
    assert.equal(originalVault.documents[0].items[0].unitCost,'5.00','historical original fixture must not be mutated');
  }
});
