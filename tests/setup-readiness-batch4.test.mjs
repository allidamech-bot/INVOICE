import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Setup readiness is derived-only and does not invent live cloud or auth health',async()=>{
  const source=await read('src/lib/setup-readiness.ts');
  assert.match(source,/deterministic-derived-read-only/);
  assert.doesNotMatch(source,/mutateVaultSafely|saveVault|putRecord|localStorage|sessionStorage|schemaVersion\s*=/);
  assert.match(source,/Backup recency and live cloud connectivity are not inferred/);
  assert.match(source,/Authentication-provider reachability is a live runtime concern/);
});

test('Legal and bank readiness remain review-if-applicable rather than universal blockers',async()=>{
  const source=await read('src/lib/setup-readiness.ts');
  assert.match(source,/legalReady\?'complete':'review'/);
  assert.match(source,/(legacyBankReady\|\|accountBankReady)\?'complete':'review'/);
  assert.match(source,/This may be valid for some businesses/);
});

test('Setup readiness reports deterministic attention for missing core defaults and product costs',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildSetupReadiness}=await import('../dist/src/lib/setup-readiness.js');
  const vault=emptyVault();
  vault.company.nameEn='';vault.company.nameAr='';vault.company.country='';vault.company.defaultCurrency='';
  vault.appSettings.numbering.proformaPrefix='';vault.appSettings.numbering.invoicePrefix='';vault.appSettings.numbering.creditNotePrefix='';
  vault.savedItems=[{id:'p1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:'P1',descriptionEn:'Product',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'10',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:''}];
  const result=buildSetupReadiness(vault);
  const byId=new Map(result.checks.map(row=>[row.id,row]));
  assert.equal(byId.get('company-identity')?.status,'attention');
  assert.equal(byId.get('document-numbering')?.status,'attention');
  assert.equal(byId.get('product-cost-readiness')?.status,'attention');
  assert.ok(result.attention>=3);
});

test('Setup readiness can recognize a prepared core setup while keeping runtime checks in review',async()=>{
  const {emptyVault}=await import('../dist/src/lib/defaults.js');
  const {buildSetupReadiness}=await import('../dist/src/lib/setup-readiness.js');
  const vault=emptyVault();
  vault.company.nameEn='LOUREX';vault.company.country='Türkiye';vault.company.defaultCurrency='USD';vault.company.vatNumber='VAT';vault.company.defaultPaymentTerms='30 days';vault.company.defaultIncoterm='EXW';
  vault.company.bank.bankName='Bank';vault.company.bank.accountName='LOUREX';vault.company.bank.iban='TR00';
  vault.appSettings.autoLockMinutes=15;
  const result=buildSetupReadiness(vault);
  const byId=new Map(result.checks.map(row=>[row.id,row.status]));
  assert.equal(byId.get('company-identity'),'complete');
  assert.equal(byId.get('legal-tax-identity'),'complete');
  assert.equal(byId.get('bank-identity'),'complete');
  assert.equal(byId.get('automatic-lock'),'complete');
  assert.equal(byId.get('backup-cloud-runtime'),'review');
  assert.equal(byId.get('auth-recovery-runtime'),'review');
});
