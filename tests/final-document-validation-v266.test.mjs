import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { assertDocumentLifecycleInvariant } from '../dist/src/lib/document-lifecycle.js';

test('incomplete drafts remain saveable for autosave',()=>{
  const doc=createBlankDocument('invoice','INV-2026-0001',emptyVault().company);
  assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(doc,[doc],[]));
});

test('an active final document must pass full document validation',()=>{
  const doc=createBlankDocument('invoice','INV-2026-0001',emptyVault().company);
  doc.status='final';
  assert.throws(()=>assertDocumentLifecycleInvariant(doc,[doc],[]),/Final document is invalid/i);
});

test('a valid active final invoice passes the lifecycle guard',()=>{
  const doc=createBlankDocument('invoice','INV-2026-0001',emptyVault().company);
  doc.customerSnapshot={sourceCustomerId:'customer-1',companyNameEn:'Customer',companyNameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
  doc.items=[{id:'line-1',descriptionEn:'Item',descriptionAr:'',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:'10.00',unitCost:''}];
  doc.status='final';
  assert.doesNotThrow(()=>assertDocumentLifecycleInvariant(doc,[doc],[]));
});
