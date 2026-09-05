import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument, refreshCompanySnapshot } from '../dist/src/lib/documents.js';

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