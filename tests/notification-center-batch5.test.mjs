import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

function line(id,price='100',cost='50'){return{id,descriptionEn:'Product',descriptionAr:'منتج',hsCode:'',origin:'',packing:'',quantity:'1',unit:'PCS',unitPrice:price,unitCost:cost};}

async function fixture(){
  const { emptyVault, customerSnapshotFrom }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { createCommercialTrackingEvent }=await import('../dist/src/lib/commercial-flow.js');
  const vault=emptyVault();
  vault.company.nameEn='LOUREX';vault.company.country='Türkiye';vault.company.defaultCurrency='USD';
  const customer={id:'c-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',companyNameEn:'Buyer Co',companyNameAr:'شركة المشتري',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'Saudi Arabia',phone:'',email:'buyer@example.com',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'USD',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:''};
  vault.customers=[customer];
  const invoice=createBlankDocument('invoice','INV-2026-0001',vault.company);invoice.status='final';invoice.issueDate='2026-09-01';invoice.dueDate='2026-09-20';invoice.customerSnapshot=customerSnapshotFrom(customer);invoice.items=[line('i-1')];
  const quote=createBlankDocument('proforma','QUO-2026-0001',vault.company);quote.status='final';quote.issueDate='2026-09-20';quote.dueDate='2026-10-03';quote.customerSnapshot=customerSnapshotFrom(customer);quote.items=[line('q-1')];
  vault.documents=[invoice,quote];
  vault.payments=[{id:'pay-1',invoiceId:invoice.id,invoiceNumber:invoice.number,customerId:customer.id,customerNameEn:customer.companyNameEn,customerNameAr:customer.companyNameAr,currency:'USD',amount:'20.00',date:'2026-09-10',method:'bank-transfer',reference:'',notes:'',createdAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-10T00:00:00.000Z'}];
  const sent=createCommercialTrackingEvent(quote,'sent');sent.at='2026-09-21T00:00:00.000Z';
  const follow=createCommercialTrackingEvent(quote,'followup-scheduled','2026-10-01');follow.at='2026-09-22T00:00:00.000Z';
  vault.documentEvents=[sent,follow];
  vault.purchases=[{id:'purchase-1',number:'PUR-001',date:'2026-09-29',supplierSnapshot:null,currency:'USD',items:[],freight:'0',duty:'0',otherCosts:'0',notes:'',status:'draft',postedAt:'',reversedAt:'',reverseReason:'',createdAt:'2026-09-29T00:00:00.000Z',updatedAt:'2026-09-29T00:00:00.000Z'}];
  vault.savedItems=[{id:'item-1',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z',sku:'SKU-1',descriptionEn:'Product',descriptionAr:'منتج',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'100',lastCurrency:'USD',lastUnitCost:'',lastCostCurrency:'',usageCount:0,lastUsedAt:'2026-09-30T00:00:00.000Z'}];
  vault.inventoryMovements=[{id:'mov-1',itemId:'item-1',itemNameEn:'Product',itemNameAr:'منتج',sku:'SKU-1',date:'2026-09-30',type:'issue',quantity:'-2',unitCost:'',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:'2026-09-30T00:00:00.000Z'}];
  return{vault,invoice,quote};
}

test('Batch 5 derives actionable notifications only from recorded business facts',async()=>{
  const { buildNotificationCenter }=await import('../dist/src/lib/notification-center.js');
  const {vault}=await fixture();
  const center=buildNotificationCenter(vault,'2026-10-01');
  const kinds=new Set(center.active.map(item=>item.kind));
  for(const expected of ['overdue-invoice','quote-expiring','commercial-followup','purchase-review','missing-cost','negative-stock'])assert.ok(kinds.has(expected),expected);
  const overdue=center.active.find(item=>item.kind==='overdue-invoice');
  assert.equal(overdue.amount,'80.00');
  assert.equal(overdue.currency,'USD');
  assert.equal(overdue.target,'receivables');
  const negative=center.active.find(item=>item.kind==='negative-stock');
  assert.match(negative.detailEn,/Low-stock alerts will wait for explicit reorder rules/);
});

test('Done and Snooze persist only as reserved encrypted event markers and do not mutate business records',async()=>{
  const { buildNotificationCenter, createNotificationStateEvent, notificationMarker }=await import('../dist/src/lib/notification-center.js');
  const {vault}=await fixture();
  const initial=buildNotificationCenter(vault,'2026-10-01');
  const overdue=initial.active.find(item=>item.kind==='overdue-invoice');
  assert.ok(overdue);
  const beforeDocs=JSON.stringify(vault.documents),beforePayments=JSON.stringify(vault.payments),beforeItems=JSON.stringify(vault.savedItems);
  const done=createNotificationStateEvent(overdue.key,'done');
  assert.equal(done.type,'created');
  assert.match(done.note,new RegExp(`^${notificationMarker().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  vault.documentEvents.push(done);
  const afterDone=buildNotificationCenter(vault,'2026-10-01');
  assert.ok(!afterDone.active.some(item=>item.key===overdue.key));
  assert.ok(afterDone.done.some(item=>item.key===overdue.key));
  assert.equal(JSON.stringify(vault.documents),beforeDocs);assert.equal(JSON.stringify(vault.payments),beforePayments);assert.equal(JSON.stringify(vault.savedItems),beforeItems);

  const quote=initial.active.find(item=>item.kind==='quote-expiring');
  assert.ok(quote);
  vault.documentEvents.push(createNotificationStateEvent(quote.key,'snooze','2026-10-03'));
  assert.ok(buildNotificationCenter(vault,'2026-10-01').snoozed.some(item=>item.key===quote.key));
  assert.ok(buildNotificationCenter(vault,'2026-10-03').active.some(item=>item.key===quote.key));
});

test('Validated notification state rejects stale notifications and past snooze dates',async()=>{
  const { buildNotificationCenter, validatedNotificationStateEvent }=await import('../dist/src/lib/notification-center.js');
  const {vault}=await fixture();
  const current=buildNotificationCenter(vault,'2026-10-01').active[0];
  assert.throws(()=>validatedNotificationStateEvent(vault,current.key,'snooze','2026-10-01','2026-10-01'),/after today/);
  assert.throws(()=>validatedNotificationStateEvent(vault,'missing:key','done','','2026-10-01'),/no longer active/);
  assert.equal(validatedNotificationStateEvent(vault,current.key,'done','','2026-10-01').type,'created');
});

test('Batch 5 storage contract reuses the encrypted event ledger without schema or financial mutation authority',async()=>{
  const source=await read('src/lib/notification-center.ts');
  assert.match(source,/NOTIFICATION_MARKER='@lourex:notification:v1:'/);
  assert.match(source,/documentId:NOTIFICATION_STATE_DOCUMENT_ID/);
  assert.match(source,/validatedNotificationStateEvent/);
  assert.doesNotMatch(source,/saveVault|localStorage|sessionStorage|schemaVersion/);
  assert.doesNotMatch(source,/payments\s*=|documents\s*=|savedItems\s*=/);
});
