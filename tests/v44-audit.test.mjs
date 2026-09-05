import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultCompany, emptyVault, customerSnapshotFrom, APP_SCHEMA_VERSION } from '../dist/src/lib/defaults.js';
import { addDaysIso, isIsoDate, normalizeValidityDays } from '../dist/src/lib/id.js';
import { compareMoneyStrings, decimalToScaled, isDecimalInput, lineTotal, normalizeDecimalInput } from '../dist/src/lib/money.js';
import { createBlankDocument, paginateItems, validateDocument } from '../dist/src/lib/documents.js';
import { getDocumentReadiness } from '../dist/src/lib/readiness.js';
import { migrateVault } from '../dist/src/storage/vault.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>readFile(path.join(root,relative),'utf8');

async function jsFiles(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const out=[];
  for(const entry of entries){
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...await jsFiles(full));
    else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full);
  }
  return out;
}

function customer(){
  return {id:'c1',companyNameEn:'Buyer',companyNameAr:'',contactPerson:'',addressEn:'Riyadh',addressAr:'',city:'Riyadh',country:'Saudi Arabia',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
}
function validDoc(){
  const doc=createBlankDocument('proforma','PI-2026-0001',defaultCompany());
  doc.issueDate='2026-08-27';doc.dueDate='2026-09-03';
  doc.customerSnapshot=customerSnapshotFrom(customer());
  doc.items[0].descriptionEn='Product';doc.items[0].quantity='1';doc.items[0].unitPrice='100';
  return doc;
}

test('current service worker precaches every compiled application module',async()=>{
  const [sw,bundle]=await Promise.all([read('dist/sw.js'),read('dist/styles/app.bundle.css')]);
  assert.match(sw,/lourex-invoice-v\d+/);
  const files=await jsFiles(path.join(root,'dist/src'));
  assert.ok(files.length>10);
  for(const file of files){
    const relative=path.relative(path.join(root,'dist'),file).split(path.sep).join('/');
    assert.ok(sw.includes(`./${relative}`),`offline cache missing ${relative}`);
  }
  assert.match(sw,/src\/storage\/vault-merge\.js/);
  assert.match(sw,/styles\/app\.bundle\.css/);
  assert.match(bundle,/\/\* --- v44-audit\.css --- \*\//);
  assert.match(sw,/EXTERNAL_CORE_SET/);
  assert.match(sw,/preserveExternalRuntime/);
  assert.match(sw,/caches\.match\(asset\)/);
  assert.match(sw,/cache\.put\(asset,existing\.clone\(\)\)/);
  assert.match(sw,/cache\.put\(event\.request, response\.clone\(\)\)/);
});

test('cloud freshness watcher applies account updates only when the UI is safe',async()=>{
  const source=await read('src/cloud/freshness.ts');
  assert.match(source,/reconcileCloudVault/);
  assert.match(source,/subscribeCloudVaultChanges/);
  assert.match(source,/cloudRemoteChangedSinceAnchor/);
  assert.match(source,/window\.location\.reload\(\)/);
  assert.match(source,/editor-screen,.modal-backdrop/);
  assert.match(source,/document\.activeElement/);
  assert.match(source,/5_000/);
  assert.doesNotMatch(source,/lourex-cloud-remote-newer/);
});

test('cloud metadata validation matches the real flat SecurityMetadata schema and commits atomically',async()=>{
  const source=await read('src/cloud/firebase.ts');
  for(const token of ['value.iterations','value.salt','value.verifierIv','value.verifierCipher'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/value\.kdf|value\.verifier\?\./);
  assert.match(source,/runTransaction/);
  assert.match(source,/current\.revision!==previous\.revision/);
  assert.match(source,/cleanupRevision\(uid,revision,chunks\.length\)/);
  assert.match(source,/commitMetaIfUnchanged/);
  assert.match(source,/Account data changed on another device/);
});

test('decimal comma and mixed locale separators are parsed without 1000x mistakes',()=>{
  assert.equal(normalizeDecimalInput('12,5'),'12.5');
  assert.equal(decimalToScaled('12,5',2),1250n);
  assert.equal(lineTotal('2','12,5'),'25.00');
  assert.equal(decimalToScaled('0,125',4),1250n);
  assert.equal(decimalToScaled('1,234',4),12340n);
  assert.equal(decimalToScaled('1.234,56',2),123456n);
  assert.equal(decimalToScaled('1,234.56',2),123456n);
  assert.equal(decimalToScaled('1,234,567',2),123456700n);
  assert.equal(isDecimalInput('1e2'),false);
  assert.equal(isDecimalInput('9'.repeat(200)),false);
});

test('line totals use a single final cent rounding step',()=>{
  assert.equal(lineTotal('0.0038','1.3039'),'0.00');
  assert.equal(lineTotal('1','1.2350'),'1.24');
});

test('money sorting stays exact above Number safe/finite ranges',()=>{
  const huge='999999999999999999999999999999999999999999.99';
  const less='999999999999999999999999999999999999999998.99';
  assert.equal(compareMoneyStrings(huge,less),1);
  assert.equal(compareMoneyStrings(less,huge),-1);
});

test('date validation rejects impossible and backwards commercial dates',()=>{
  assert.equal(isIsoDate('2026-02-29'),false);
  assert.equal(isIsoDate('2028-02-29'),true);
  assert.equal(addDaysIso('2028-02-28',1),'2028-02-29');
  assert.equal(normalizeValidityDays(Infinity),0);
  assert.equal(normalizeValidityDays(999999),3650);
  const doc=validDoc();
  doc.issueDate='2026-02-29';
  assert.ok(validateDocument(doc).issueDate);
  doc.issueDate='2026-08-27';doc.dueDate='2026-08-26';
  assert.ok(validateDocument(doc).dueDate);
});

test('discount and tax validation match calculation semantics and readiness',()=>{
  const doc=validDoc();
  doc.adjustments.discountEnabled=true;doc.adjustments.discountMode='percent';doc.adjustments.discountValue='101';
  assert.match(validateDocument(doc).discount,/100/);
  assert.equal(getDocumentReadiness(doc).ready,false);
  doc.adjustments.discountMode='fixed';doc.adjustments.discountValue='100.01';
  assert.match(validateDocument(doc).discount,/subtotal/i);
  doc.adjustments.discountValue='50';
  assert.equal(validateDocument(doc).discount,undefined);
  doc.adjustments.taxEnabled=true;doc.adjustments.taxPercent='150';
  assert.equal(validateDocument(doc).tax,undefined);
  doc.adjustments.taxPercent='-1';
  assert.match(validateDocument(doc).tax,/0 or greater/);
});

test('readiness uses fixed precision grammar instead of JavaScript Number coercion',()=>{
  const doc=validDoc();
  doc.items[0].quantity='1e2';
  const readiness=getDocumentReadiness(doc);
  assert.equal(readiness.ready,false);
  assert.equal(readiness.groups.find(group=>group.key==='items')?.complete,false);
});

test('legacy schema normalizes hostile defaults without changing document snapshots',()=>{
  assert.ok(APP_SCHEMA_VERSION>=6);
  const vault=emptyVault();
  vault.schemaVersion=4;
  vault.company.defaultValidityDays=Infinity;
  vault.company.defaultCurrency=' sar ';
  vault.appSettings.numbering.proformaPrefix=' P I! ';
  vault.documents=[validDoc()];
  vault.documents[0].companySnapshot.nameEn='Historical Seller';
  const migrated=migrateVault(vault);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.equal(migrated.company.defaultValidityDays,7);
  assert.equal(migrated.company.defaultCurrency,'SAR');
  assert.equal(migrated.appSettings.numbering.proformaPrefix,'PI');
  assert.equal(migrated.documents[0].companySnapshot.nameEn,'Historical Seller');
});

test('pagination can reserve additional first-page space for long party details',async()=>{
  const base=validDoc().items[0];
  const items=Array.from({length:9},(_,index)=>({...base,id:`i${index}`,descriptionEn:`Product ${index+1}`}));
  assert.equal(paginateItems(items,false)[0].length,7);
  assert.equal(paginateItems(items,false,3)[0].length,3);
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  assert.match(renderer,/firstPageItemCapacity/);
  assert.match(renderer,/paginateItems\(doc\.items, !separateDetails, firstPageItemCapacity\(doc\),doc\.language\)/);
});

test('editor exposes percent discount and background-safe autosave',async()=>{
  const editor=await read('src/components/EditorPageCore.tsx');
  assert.match(editor,/value=\{d\.adjustments\.discountMode\}/);
  assert.match(editor,/<option value="percent">%<\/option>/);
  assert.match(editor,/visibilitychange/);
  assert.match(editor,/document\.visibilityState==='hidden'/);
  assert.match(editor,/void this\.save\(true\)/);
});

test('immediate settings saves revert visibly on storage failure',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  assert.match(settings,/changeInterfaceLanguage/);
  assert.match(settings,/const previous=this\.state\.appSettings/);
  assert.match(settings,/appSettings:previous/);
  assert.match(settings,/Unable to change interface language/);
  assert.match(settings,/max="3650"/);
});

test('saved-item deletion is protected by a confirmation dialog',async()=>{
  const saved=await read('src/components/SavedItemsModal.tsx');
  assert.match(saved,/deleting:SavedItem\|null/);
  assert.match(saved,/Delete saved item\?/);
  assert.match(saved,/ConfirmDialog/);
});

test('print workflow does not mutate already-final documents just to reprint',async()=>{
  const app=await read('src/app/App.tsx');
  assert.match(app,/doc\.status==='final'&&existing\?\.status==='final'/);
  assert.match(app,/waitForPrintAssets/);
  assert.match(app,/document\.fonts/);
  assert.match(app,/image\.decode/);
});

test('document output includes all saved business identifiers',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  for(const token of ['vatNumber','taxNumber','commercialRegistration','website','party-identifiers'])assert.ok(renderer.includes(token),token);
  const css=await read('src/styles/v44-audit.css');
  assert.match(css,/overflow-wrap:anywhere/);
  assert.match(css,/white-space:pre-wrap/);
});