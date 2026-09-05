import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, refreshCompanySnapshot } from '../dist/src/lib/documents.js';
import { estimatedDocumentPageCount } from '../dist/src/lib/document-quality.js';

test('draft company refresh keeps bankAccountId aligned with the bank snapshot after an account is removed',()=>{
  const vault=emptyVault();
  vault.company.bank={bankName:'Primary Bank',accountName:'LOUREX',iban:'TR00PRIMARY',swift:'PRIMARY',currency:'USD'};
  vault.company.bankAccounts=[{id:'secondary',label:'EUR Bank',bankName:'Second Bank',accountName:'LOUREX EUR',iban:'TR00SECOND',swift:'SECOND',currency:'EUR'}];
  vault.company.defaultBankAccountId='primary';
  const doc=createBlankDocument('invoice','INV-2026-0200',vault.company);
  doc.bankAccountId='secondary';
  doc.companySnapshot.bank={bankName:'Second Bank',accountName:'LOUREX EUR',iban:'TR00SECOND',swift:'SECOND',currency:'EUR'};

  const companyWithoutSecondary={...vault.company,bankAccounts:[]};
  const refreshed=refreshCompanySnapshot(doc,companyWithoutSecondary);
  assert.equal(refreshed.bankAccountId,'primary');
  assert.equal(refreshed.companySnapshot.bank.bankName,'Primary Bank');
  assert.equal(refreshed.companySnapshot.bank.iban,'TR00PRIMARY');
});

test('legacy draft with no bankAccountId re-links an unchanged saved bank snapshot when possible',()=>{
  const vault=emptyVault();
  vault.company.bankAccounts=[{id:'secondary',label:'EUR Bank',bankName:'Second Bank',accountName:'LOUREX EUR',iban:'TR00SECOND',swift:'SECOND',currency:'EUR'}];
  const doc=createBlankDocument('proforma','PI-2026-0201',vault.company);
  doc.bankAccountId='';
  doc.companySnapshot.bank={bankName:'Second Bank',accountName:'LOUREX EUR',iban:'TR00SECOND',swift:'SECOND',currency:'EUR'};

  const refreshed=refreshCompanySnapshot(doc,vault.company);
  assert.equal(refreshed.bankAccountId,'secondary');
  assert.equal(refreshed.companySnapshot.bank.currency,'EUR');
});

test('one oversized item is counted as multi-page and split only in document output',async()=>{
  const vault=emptyVault();
  const doc=createBlankDocument('invoice','INV-2026-0202',vault.company);
  doc.language='en';
  doc.items[0]={...doc.items[0],descriptionEn:'Very long commercial specification '.repeat(140),quantity:'3',unit:'Carton',unitPrice:'25.00'};
  assert.ok(estimatedDocumentPageCount(doc)>1);

  const renderer=await readFile('src/templates/TemplateRenderer.tsx','utf8');
  assert.match(renderer,/const OUTPUT_FRAGMENT_WEIGHT=2/);
  assert.match(renderer,/function outputItemFragments/);
  assert.match(renderer,/if\(itemWeight\(doc,item\)<=OUTPUT_FRAGMENT_WEIGHT\)return\[item\]/);
  assert.match(renderer,/quantity:index===0\?item\.quantity:''/);
  assert.match(renderer,/unitPrice:index===0\?item\.unitPrice:''/);
  assert.match(renderer,/const outputItems=doc\.items\.flatMap\(item=>outputItemFragments\(doc,item\)\)/);
  assert.match(renderer,/continuation\?'':lineTotal\(item\.quantity,item\.unitPrice\)/);
  assert.match(renderer,/calculateTotals\(doc\.items, doc\.adjustments\)/);
});
