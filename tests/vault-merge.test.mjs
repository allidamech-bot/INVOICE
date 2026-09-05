import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyVault } from '../dist/src/lib/defaults.js';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';

function customer(id,name){const now=new Date().toISOString();return{id,companyNameEn:name,companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:'',createdAt:now,updatedAt:now};}
function savedItem(id,name,sku){const now=new Date().toISOString();return{id,createdAt:now,updatedAt:now,sku,descriptionEn:name,descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:'USD',usageCount:0,lastUsedAt:now};}
function finalInvoice(base,id='inv-settlement',amount='100.00'){
  const doc=createBlankDocument('invoice','INV-2026-0200',base.company);
  doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='standard';doc.currency='USD';doc.items=[{...doc.items[0],descriptionEn:'Service',quantity:'1',unitPrice:amount}];
  doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};
  return doc;
}
function payment(invoice,id,amount){const now='2026-09-05T12:00:00.000Z';return{id,invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:invoice.customerSnapshot?.sourceCustomerId||'',customerNameEn:invoice.customerSnapshot?.companyNameEn||'',customerNameAr:invoice.customerSnapshot?.companyNameAr||'',currency:invoice.currency,amount,date:'2026-09-05',method:'bank-transfer',reference:id,notes:'',createdAt:now,updatedAt:now};}
function credit(base,invoice,id,amount){const doc=createBlankDocument('invoice',`CN-${id}`,base.company);doc.id=id;doc.status='final';doc.lifecycleStatus='active';doc.role='credit-note';doc.currency=invoice.currency;doc.creditForId=invoice.id;doc.creditForNumber=invoice.number;doc.customerSnapshot=invoice.customerSnapshot?structuredClone(invoice.customerSnapshot):null;doc.items=[{...doc.items[0],descriptionEn:`Credit against ${invoice.number}`,quantity:'1',unitPrice:amount}];doc.adjustments={discountEnabled:false,discountMode:'fixed',discountValue:'0.00',shippingEnabled:false,shipping:'0.00',otherChargesEnabled:false,otherCharges:'0.00',taxEnabled:false,taxPercent:'0'};return doc;}

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

test('customer quick-add cannot bypass duplicate identity protection',()=>{
  const base=emptyVault();
  base.customers=[customer('c1','Buyer')];
  const duplicate=customer('c2','  BUYER  ');
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[...base.customers,duplicate]},base),/customer already exists/i);
});

test('concurrent customer creation cannot commit the same normalized identity twice',()=>{
  const base=emptyVault();
  const latest=mergeVaultIntent(base,{...base,customers:[customer('c1','Buyer')]},base);
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[customer('c2','buyer')]},latest),/customer already exists/i);
});

test('customer quick-add cannot persist invalid email or credit controls',()=>{
  const base=emptyVault();
  const invalidEmail={...customer('c1','Buyer'),email:'buyer@invalid'};
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[invalidEmail]},base),/valid email/i);
  const missingCreditCurrency={...customer('c2','Credit Buyer'),creditLimit:'1000'};
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[missingCreditCurrency]},base),/currency for the credit limit/i);
  const invalidDue={...customer('c3','Terms Buyer'),paymentDueDays:'30.5'};
  assert.throws(()=>mergeVaultIntent(base,{...base,customers:[invalidDue]},base),/whole number/i);
});

test('SKU-only edits cannot bypass duplicate product protection',()=>{
  const base=emptyVault();
  const first=savedItem('p1','First','SKU-A');
  const second=savedItem('p2','Second','SKU-B');
  base.savedItems=[first,second];
  const conflicting={...second,sku:' sku-a '};
  assert.throws(()=>mergeVaultIntent(base,{...base,savedItems:[first,conflicting]},base),/duplicate SKU/i);
});

test('non-UI saved-product paths cannot persist blank units or invalid reusable prices',()=>{
  const base=emptyVault();
  const blankUnit={...savedItem('p1','Product','SKU-1'),unit:''};
  assert.throws(()=>mergeVaultIntent(base,{...base,savedItems:[blankUnit]},base),/Unit is required/i);
  const invalidPrice={...savedItem('p2','Priced Product','SKU-2'),lastUnitPrice:'-1'};
  assert.throws(()=>mergeVaultIntent(base,{...base,savedItems:[invalidPrice]},base),/non-negative price/i);
});

test('legacy duplicate or incomplete master data does not block unrelated saves',()=>{
  const base=emptyVault();
  base.customers=[customer('c1','Legacy Buyer'),customer('c2','Legacy Buyer')];
  base.savedItems=[{...savedItem('p1','Legacy Product','LEGACY'),unit:''}];
  const intendedItem={...base.savedItems[0],favorite:true};
  const intent={...base,savedItems:[intendedItem],appSettings:{...base.appSettings,numbering:{...base.appSettings.numbering,invoicePrefix:'SALE'}}};
  const merged=mergeVaultIntent(base,intent,base);
  assert.equal(merged.customers.length,2);
  assert.equal(merged.savedItems[0].favorite,true);
  assert.equal(merged.appSettings.numbering.invoicePrefix,'SALE');
});

test('concurrent payments cannot merge into an over-collected invoice',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);base.documents=[invoice];
  const first=payment(invoice,'pay-a','60.00');const second=payment(invoice,'pay-b','60.00');
  const latest=mergeVaultIntent(base,{...base,payments:[first]},base);
  assert.equal(latest.payments.length,1);
  assert.throws(()=>mergeVaultIntent(base,{...base,payments:[second]},latest),/balance after credit notes cannot fall below|payments plus issued credit notes/i);
});

test('concurrent credit notes cannot merge above the source invoice balance',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);base.documents=[invoice];
  const first=credit(base,invoice,'credit-a','60.00');const second=credit(base,invoice,'credit-b','60.00');
  const latest=mergeVaultIntent(base,{...base,documents:[invoice,first]},base);
  assert.equal(latest.documents.filter(doc=>doc.role==='credit-note').length,1);
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[invoice,second]},latest),/cannot (?:be reduced|fall) below payments plus issued credit notes|cannot exceed the remaining invoice balance/i);
});

test('a concurrent issued credit note prevents the source invoice from becoming a revision draft',()=>{
  const base=emptyVault();const invoice=finalInvoice(base);base.documents=[invoice];
  const issuedCredit=credit(base,invoice,'credit-race','20.00');
  const latest=mergeVaultIntent(base,{...base,documents:[invoice,issuedCredit]},base);
  const revisionDraft={...invoice,status:'draft',revision:2,updatedAt:'2026-09-05T15:02:00.000Z'};
  assert.throws(()=>mergeVaultIntent(base,{...base,documents:[revisionDraft]},latest),/must remain an active final invoice/i);
});

test('a stale autosave cannot downgrade a concurrently issued document back to draft',()=>{
  const base=emptyVault();
  const doc=createBlankDocument('invoice','INV-2026-0100',base.company);base.documents=[doc];
  const finalDoc={...doc,status:'final',updatedAt:'2026-09-05T15:00:01.000Z'};
  const latest=mergeVaultIntent(base,{...base,documents:[finalDoc]},base);
  const staleDraft={...doc,notes:'late autosave',updatedAt:'2026-09-05T15:00:02.000Z'};
  const merged=mergeVaultIntent(base,{...base,documents:[staleDraft]},latest);
  assert.equal(merged.documents[0].status,'final');
  assert.notEqual(merged.documents[0].notes,'late autosave');
});

test('a stale draft cannot resurrect a discarded revision after the previous final was restored',()=>{
  const base=emptyVault();
  const original=createBlankDocument('invoice','INV-2026-0101',base.company);
  const revisionDraft={...original,revision:2,status:'draft',notes:'revision edits',updatedAt:'2026-09-05T15:01:00.000Z'};
  base.documents=[revisionDraft];
  const restoredFinal={...original,status:'final',revision:1,updatedAt:'2026-09-05T15:01:01.000Z'};
  const latest={...base,documents:[restoredFinal]};
  const staleDraft={...revisionDraft,notes:'late revision autosave',updatedAt:'2026-09-05T15:01:02.000Z'};
  const merged=mergeVaultIntent(base,{...base,documents:[staleDraft]},latest);
  assert.equal(merged.documents[0].status,'final');
  assert.equal(merged.documents[0].revision,1);
});

test('starting a new revision intentionally can still move a current final document to a higher draft revision',()=>{
  const base=emptyVault();
  const finalDoc={...createBlankDocument('invoice','INV-2026-0102',base.company),status:'final',revision:1};
  base.documents=[finalDoc];
  const revisionDraft={...finalDoc,status:'draft',revision:2,updatedAt:'2026-09-05T15:02:00.000Z'};
  const merged=mergeVaultIntent(base,{...base,documents:[revisionDraft]},base);
  assert.equal(merged.documents[0].status,'draft');
  assert.equal(merged.documents[0].revision,2);
});

test('a stale delete cannot remove a document that became final concurrently',()=>{
  const base=emptyVault();
  const doc=createBlankDocument('proforma','PI-2026-0103',base.company);base.documents=[doc];
  const finalDoc={...doc,status:'final',updatedAt:'2026-09-05T15:03:00.000Z'};
  const latest=mergeVaultIntent(base,{...base,documents:[finalDoc]},base);
  const merged=mergeVaultIntent(base,{...base,documents:[]},latest);
  assert.equal(merged.documents.length,1);
  assert.equal(merged.documents[0].status,'final');
});

test('a stale active copy cannot overwrite a concurrently voided archive',()=>{
  const base=emptyVault();
  const finalDoc={...createBlankDocument('invoice','INV-2026-0104',base.company),status:'final',updatedAt:'2026-09-05T15:04:00.000Z'};
  base.documents=[finalDoc];
  const voided={...finalDoc,lifecycleStatus:'voided',voidedAt:'2026-09-05T15:04:01.000Z',voidReason:'Cancelled',updatedAt:'2026-09-05T15:04:01.000Z'};
  const latest=mergeVaultIntent(base,{...base,documents:[voided]},base);
  const staleActive={...finalDoc,notes:'late write',updatedAt:'2026-09-05T15:04:02.000Z'};
  const merged=mergeVaultIntent(base,{...base,documents:[staleActive]},latest);
  assert.equal(merged.documents[0].lifecycleStatus,'voided');
  assert.equal(merged.documents[0].voidReason,'Cancelled');
});