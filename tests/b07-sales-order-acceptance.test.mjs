import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault, customerSnapshotFrom } from '../dist/src/lib/defaults.js';
import { createBlankDocument, validateDocument, convertToInvoice } from '../dist/src/lib/documents.js';
import { validatedCommercialTrackingEvent } from '../dist/src/lib/commercial-flow.js';
import { acceptSalesOrder, acceptedSalesOrders, salesOrderForQuotation, assertSalesOrderIntegrity } from '../dist/src/lib/sales-order-flow.js';
import { createLinkedDeliveryDraft, linkedDeliveries, deliverySource } from '../dist/src/lib/delivery-flow.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function fixture(kind='proforma'){
  const vault=emptyVault();
  const customer={id:'customer-01',companyNameEn:'Riyadh Distribution',companyNameAr:'توزيع الرياض',
    contactPerson:'Ahmed',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  vault.customers=[customer];
  const quote=createBlankDocument(kind,'QUO-2026-0056',vault.company);
  quote.status='final';quote.currency='USD';quote.customerSnapshot=customerSnapshotFrom(customer);
  quote.items=[
    {...quote.items[0],id:'quote-line-1',descriptionEn:'FMCG cookies',descriptionAr:'بسكويت',quantity:'12.5',unit:'Carton',unitPrice:'10.50'},
    {...quote.items[0],id:'quote-line-2',descriptionEn:'FMCG candy',descriptionAr:'حلوى',quantity:'6',unit:'Carton',unitPrice:'25'}
  ];
  assert.deepEqual(validateDocument(quote),{});
  vault.documents=[quote];
  const event=validatedCommercialTrackingEvent(vault,quote.id,'accepted');
  vault.documentEvents.push(event);
  return{vault,quote,customer};
}
function input(quote,reference='CUSTOMER-PO-88'){
  return{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
    customerReference:reference,orderDate:todayIso(),requestedDeliveryDate:todayIso(),notes:'Customer confirmed quotation'};
}

test('Batch7 sales: issued accepted quotation creates immutable, customer-linked Sales Order without posting',()=>{
  const {vault,quote}=fixture();
  const before=structuredClone(vault);
  const created=acceptSalesOrder(vault,input(quote));
  assert.equal(created.order.salesOrderNumber,'SO-QUO-2026-0056');
  assert.equal(created.order.customerReference,'CUSTOMER-PO-88');
  assert.equal(created.order.customerId,quote.customerSnapshot.sourceCustomerId);
  assert.equal(created.order.currency,'USD');
  assert.equal(created.order.acceptedByMemberId,'owner');
  assert.deepEqual(created.order.lines.map(line=>line.quantity),['12.5','6']);
  assert.deepEqual(created.order.lines.map(line=>line.unitPrice),['10.50','25']);
  assert.equal(created.order.grandTotal,'281.25');
  assert.deepEqual(created.order.adjustments,quote.adjustments);
  assert.equal(created.vault.documentEvents.length,vault.documentEvents.length+1);
  assert.equal(acceptedSalesOrders(quote.id,created.vault.documentEvents).length,1);
  assert.equal(salesOrderForQuotation(quote.id,created.vault.documentEvents).salesOrderNumber,created.order.salesOrderNumber);
  for(const key of ['documents','purchases','supplierPayments','payments','inventoryMovements','savedItems','treasuryEntries']){
    assert.deepEqual(created.vault[key],vault[key],`Sales Order cannot post ${key}`);
  }
  assert.deepEqual(vault,before);
  assert.doesNotThrow(()=>assertSalesOrderIntegrity(created.vault.documents,created.vault.documentEvents));
});

test('Batch7 sales: Sales Order links to delivery draft without creating stock or an invoice',()=>{
  const {vault,quote}=fixture();
  const accepted=acceptSalesOrder(vault,input(quote));
  const result=createLinkedDeliveryDraft(accepted.vault,quote.id);
  assert.equal(result.created,true);
  assert.equal(result.document.kind,'delivery-note');
  assert.match(result.document.terms.remarks,/SO-QUO-2026-0056/);
  const event=result.vault.documentEvents.find(x=>x.documentId===result.document.id&&x.type==='created');
  assert.match(event.note,/^@lourex:sales-order:delivery-draft:v2:/);
  const mapping=JSON.parse(event.note.slice('@lourex:sales-order:delivery-draft:v2:'.length));
  assert.equal(mapping.quotationId,quote.id);
  assert.equal(mapping.salesOrderNumber,'SO-QUO-2026-0056');
  assert.deepEqual(mapping.lines.map(row=>row.salesOrderLineId),quote.items.map(item=>item.id));
  assert.deepEqual(mapping.lines.map(row=>row.deliveryLineId),result.document.items.map(item=>item.id));
  assert.equal(event.relatedDocumentId,quote.id);
  assert.equal(deliverySource(result.document,result.vault.documents,result.vault.documentEvents).id,quote.id);
  assert.equal(linkedDeliveries(quote,result.vault.documents,result.vault.documentEvents).length,1);
  const second=createLinkedDeliveryDraft(result.vault,quote.id);
  assert.equal(second.created,false);
  assert.equal(second.document.id,result.document.id);
  assert.equal(result.vault.inventoryMovements.length,0);
  assert.equal(result.vault.payments.length,0);
});

test('Batch7 sales: reject unaccepted, draft, void, stale, already invoiced or missing customer quotations',()=>{
  const {vault,quote}=fixture();
  const unaccepted={...vault,documentEvents:[]};
  assert.throws(()=>acceptSalesOrder(unaccepted,input(quote)),/Record customer acceptance/);
  assert.throws(()=>acceptSalesOrder(vault,{...input(quote),expectedQuotationUpdatedAt:'stale'}),/has changed/);
  const draft={...vault,documents:vault.documents.map(x=>x.id===quote.id?{...x,status:'draft'}:x)};
  assert.throws(()=>acceptSalesOrder(draft,input(quote)),/active issued/);
  const voided={...vault,documents:vault.documents.map(x=>x.id===quote.id?{...x,lifecycleStatus:'voided'}:x)};
  assert.throws(()=>acceptSalesOrder(voided,input(quote)),/active issued/);
  const missing={...vault,customers:[]};
  assert.throws(()=>acceptSalesOrder(missing,input(quote)),/registered customer/);
  const invoice=convertToInvoice(quote,'INV-2026-0024');
  assert.throws(()=>acceptSalesOrder({...vault,documents:[...vault.documents,invoice]},input(quote)),/already been converted/);
  assert.throws(()=>acceptSalesOrder(vault,{...input(quote),orderDate:'2000-01-01'}),/Sales Order date/);
  assert.throws(()=>acceptSalesOrder(vault,{...input(quote),requestedDeliveryDate:'2000-01-01'}),/Requested delivery date/);
});

test('Batch7 sales: one accepted order per quote and concurrent device acceptance conflicts',()=>{
  const {vault,quote}=fixture();
  const a=acceptSalesOrder(vault,input(quote)).vault;
  const b=acceptSalesOrder(vault,input(quote,'DIFFERENT-CUST-PO')).vault;
  assert.throws(()=>acceptSalesOrder(a,input(quote)),/already has an accepted Sales Order/);
  assert.throws(()=>mergeVaultIntent(vault,a,b),/Concurrent Sales Orders conflict/);
  const valid=mergeVaultIntent(vault,a,vault);
  assert.doesNotThrow(()=>assertSalesOrderIntegrity(valid.documents,valid.documentEvents));
});

test('Batch7 sales: accepted quote line price, quantity, adjustments and customer identity cannot silently drift',()=>{
  const {vault,quote}=fixture();
  const accepted=acceptSalesOrder(vault,input(quote)).vault;
  const variants=[
    {items:quote.items.map((item,i)=>i===0?{...item,unitPrice:'11'}:item)},
    {items:quote.items.map((item,i)=>i===0?{...item,quantity:'12.6'}:item)},
    {adjustments:{...quote.adjustments,shippingEnabled:true,shipping:'100'}},
    {customerSnapshot:{...quote.customerSnapshot,sourceCustomerId:'other'}},
    {updatedAt:'changed-version'},
    {lifecycleStatus:'voided'}
  ];
  for(const patch of variants){
    const changed=accepted.documents.map(doc=>doc.id===quote.id?{...doc,...patch}:doc);
    assert.throws(()=>assertSalesOrderIntegrity(changed,accepted.documentEvents),/Sales Order source quotation changed|Sales Order price, quantity or commercial adjustments differ/);
  }
});

test('Batch7 sales: permissions allow sales, admin, owner; reject finance, purchasing and viewer',()=>{
  const {vault,quote}=fixture(),owner=defaultOwnerMember();
  for(const role of ['finance','purchasing','viewer']){
    const person={...owner,id:role,role,displayName:role};
    const scope={...vault,teamMembers:[owner,person],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>acceptSalesOrder(scope,input(quote)),/does not have permission/);
  }
  for(const role of ['owner','admin','sales']){
    const person={...owner,id:role,role,displayName:role};
    const scope={...vault,teamMembers:[owner,person],appSettings:{...vault.appSettings,activeTeamMemberId:role}};
    assert.equal(acceptSalesOrder(scope,input(quote)).order.acceptedByMemberId,role);
  }
});

test('Batch7 sales: malformed acceptance or customer reassignment is rejected during merge',()=>{
  const {vault,quote}=fixture();
  const accepted=acceptSalesOrder(vault,input(quote)).vault;
  const malformed={...accepted,documentEvents:[...accepted.documentEvents,{
    ...accepted.documentEvents.at(-1),id:'tampered-order',note:'@lourex:sales-order:accepted:v1:{bad-json'
  }]};
  assert.throws(()=>assertSalesOrderIntegrity(malformed.documents,malformed.documentEvents),/evidence is corrupted/);
  const noSource=accepted.documents.filter(doc=>doc.id!==quote.id);
  assert.throws(()=>assertSalesOrderIntegrity(noSource,accepted.documentEvents),/source quotation changed or is missing/);
});

test('Batch7 sales: accepted SO blocks full-order quote conversion and preserves delivery-only billing',async()=>{
  const {vault,quote}=fixture();
  const accepted=acceptSalesOrder(vault,input(quote)).vault;
  assert.doesNotThrow(()=>assertSalesOrderIntegrity(accepted.documents,accepted.documentEvents));
  const linked=createLinkedDeliveryDraft(accepted,quote.id);
  assert.equal(linked.document.kind,'delivery-note');
  assert.deepEqual(linked.document.items.map(line=>line.quantity),quote.items.map(line=>line.quantity));
  const app=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  assert.match(app,/const committedOrder=salesOrderForQuotation\(source\.id,current\.documentEvents\)/);
  assert.match(app,/if\(committedOrder\)throw new Error/);
  assert.match(app,/Invoice confirmed Delivery Notes instead of the entire order/);
  assert.match(app,/createConfirmedDeliveryInvoiceDraft\(scoped,delivery\.id\)/);
  assert.match(app,/salesOrderForQuotation\(doc\.id,vault\.documentEvents\)/);
  assert.match(app,/salesOrderForQuotation\(source\.id,vault\.documentEvents\)/);
  assert.match(app,/salesOrderForQuotation\(current\.id,vault\.documentEvents\)/);
});

test('Batch7 sales: UI saves through protected serialized vault bridge with explicit consent',async()=>{
  const page=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/SalesOrderReview.tsx',import.meta.url),'utf8');
  const bridge=await readFile(new URL('../src/storage/vault-merge.ts',import.meta.url),'utf8');
  assert.match(page,/mutateVaultSafely\(vault=>acceptSalesOrder\(vault,input\)\.vault\)/);
  assert.match(page,/SalesOrderReview quotation=\{doc\}/);
  assert.match(panel,/this\.state\.confirmed/);
  assert.match(panel,/t\('Sales Order','أمر البيع'\)/);
  assert.match(bridge,/assertSalesOrderIntegrity\(documents,documentEvents\)/);
});
