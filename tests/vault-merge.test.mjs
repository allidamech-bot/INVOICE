import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function customer(id,name){const now=new Date().toISOString();return{id,companyNameEn:name,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:'',createdAt:now,updatedAt:now};}

test('document autosave and settings save from the same base preserve both changes',()=>{
  const base=emptyVault();
  const doc=createBlankDocument('invoice','INV-2026-0001',base.company);base.documents=[doc];
  const docChanged={...doc,notes:'autosaved note'};
  const documentIntent={...base,documents:[docChanged]};
  const afterDocument=mergeVaultIntent(base,documentIntent,base);

  const settingsIntent={...base,appSettings:{...base.appSettings,numbering:{...base.appSettings.numbering,invoicePrefix:'SALE'}}};
  const merged=mergeVaultIntent(base,settingsIntent,afterDocument);
  assert.equal(merged.documents[0].notes,'autosaved note');
  assert.equal(merged.appSettings.numbering.invoicePrefix,'SALE');
});

test('customer changes do not erase a concurrently saved document',()=>{
  const base=emptyVault();
  const doc=createBlankDocument('proforma','PI-2026-0001',base.company);base.documents=[doc];
  const latest=mergeVaultIntent(base,{...base,documents:[{...doc,notes:'latest'}]},base);
  const customerIntent={...base,customers:[customer('c1','Buyer')]};
  const merged=mergeVaultIntent(base,customerIntent,latest);
  assert.equal(merged.documents[0].notes,'latest');
  assert.equal(merged.customers[0].companyNameEn,'Buyer');
});

test('independent app setting subtrees merge instead of clobbering each other',()=>{
  const base=emptyVault();
  const smartIntent={...base,appSettings:{...base.appSettings,smartDefaults:{...base.appSettings.smartDefaults,currency:'EUR'}}};
  const afterSmart=mergeVaultIntent(base,smartIntent,base);
  const numberingIntent={...base,appSettings:{...base.appSettings,numbering:{...base.appSettings.numbering,proformaPrefix:'QUOTE'}}};
  const merged=mergeVaultIntent(base,numberingIntent,afterSmart);
  assert.equal(merged.appSettings.smartDefaults.currency,'EUR');
  assert.equal(merged.appSettings.numbering.proformaPrefix,'QUOTE');
});

test('deleting one record preserves unrelated concurrent additions',()=>{
  const base=emptyVault();base.customers=[customer('c1','One')];
  const latest=mergeVaultIntent(base,{...base,customers:[...base.customers,customer('c2','Two')]},base);
  const deleteIntent={...base,customers:[]};
  const merged=mergeVaultIntent(base,deleteIntent,latest);
  assert.equal(merged.customers.some(item=>item.id==='c1'),false);
  assert.equal(merged.customers.some(item=>item.id==='c2'),true);
});
