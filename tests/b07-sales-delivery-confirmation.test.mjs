import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emptyVault,customerSnapshotFrom } from '../dist/src/lib/defaults.js';
import { createBlankDocument,validateDocument } from '../dist/src/lib/documents.js';
import { validatedCommercialTrackingEvent } from '../dist/src/lib/commercial-flow.js';
import { acceptSalesOrder } from '../dist/src/lib/sales-order-flow.js';
import { createLinkedDeliveryDraft,linkedDeliveries } from '../dist/src/lib/delivery-flow.js';
import {
  confirmSalesDelivery,confirmedSalesDeliveries,salesDeliveryBalances,deliverySalesOrderContext,assertSalesDeliveryIntegrity
} from '../dist/src/lib/sales-delivery-flow.js';
import { mergeVaultIntent } from '../dist/src/storage/vault-merge.js';
import { defaultOwnerMember } from '../dist/src/lib/governance.js';
import { todayIso } from '../dist/src/lib/id.js';

function setup(){
  const vault=emptyVault(),at=new Date().toISOString();
  const customer={id:'customer-07',companyNameEn:'Riyadh Foods',companyNameAr:'أغذية الرياض',
    contactPerson:'Ahmed',addressEn:'Riyadh',addressAr:'الرياض',city:'Riyadh',country:'Saudi Arabia',
    phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',createdAt:at,updatedAt:at};
  vault.customers=[customer];
  const quote=createBlankDocument('proforma','QUO-2026-710',vault.company);
  quote.status='final';quote.customerSnapshot=customerSnapshotFrom(customer);quote.currency='USD';
  quote.items=[
    {...quote.items[0],id:'so-line-1',descriptionEn:'Cookies',descriptionAr:'بسكويت',
      quantity:'12.5',unit:'Carton',unitPrice:'10'},
    {...quote.items[0],id:'so-line-2',descriptionEn:'Candy',descriptionAr:'حلوى',
      quantity:'6',unit:'Carton',unitPrice:'25'}
  ];
  assert.deepEqual(validateDocument(quote),{});
  vault.documents=[quote];
  vault.documentEvents.push(validatedCommercialTrackingEvent(vault,quote.id,'accepted'));
  const accepted=acceptSalesOrder(vault,{quotationId:quote.id,expectedQuotationUpdatedAt:quote.updatedAt,
    customerReference:'PO-CUST-710',orderDate:todayIso(),requestedDeliveryDate:todayIso()});
  return{vault:accepted.vault,quote,order:accepted.order,customer};
}
function issue(vault,delivery,quantities,keep=[]){
  const revised={...delivery,status:'final',
    items:delivery.items.map((item,i)=>({...item,quantity:quantities[i]??item.quantity}))
      .filter((item,i)=>!keep.length||keep.includes(i))};
  assert.deepEqual(validateDocument(revised),{});
  return{vault:{...vault,documents:vault.documents.map(d=>d.id===delivery.id?revised:d)},note:revised};
}
function input(note,reference='POD-001'){
  return{deliveryNoteId:note.id,expectedDeliveryNoteUpdatedAt:note.updatedAt,
    deliveredDate:todayIso(),reference,confirmed:true,notes:'Customer signed receipt'};
}
test('Batch7 delivery: accepted SO → issued DN → confirmed partial delivery, operational evidence only',()=>{
  const {vault,quote,order}=setup(),before=structuredClone(vault);
  const draft=createLinkedDeliveryDraft(vault,quote.id);
  assert.equal(draft.created,true);
  const mappingEvent=draft.vault.documentEvents.find(e=>e.documentId===draft.document.id&&e.type==='created');
  assert.match(mappingEvent.note,/@lourex:sales-order:delivery-draft:v2:/);
  const {vault:issued,note}=issue(draft.vault,draft.document,['5','2']);
  assert.equal(deliverySalesOrderContext(note,issued.documents,issued.documentEvents).order.salesOrderNumber,order.salesOrderNumber);
  const result=confirmSalesDelivery(issued,input(note));
  assert.equal(result.delivery.salesOrderNumber,order.salesOrderNumber);
  assert.equal(result.delivery.reference,'POD-001');
  assert.deepEqual(result.delivery.lines.map(line=>line.quantity),['5','2']);
  assert.deepEqual(result.delivery.lines.map(line=>line.salesOrderLineId),order.lines.map(line=>line.quotationLineId));
  assert.deepEqual(salesDeliveryBalances(order,result.vault.documentEvents).map(row=>row.remaining),['7.5','4']);
  assert.equal(confirmedSalesDeliveries(note.id,result.vault.documentEvents).length,1);
  for(const key of ['purchases','payments','supplierPayments','savedItems','inventoryMovements','treasuryEntries']){
    assert.deepEqual(result.vault[key],before[key],`delivery cannot post ${key}`);
  }
  assert.deepEqual(issued.documents,result.vault.documents);
  assert.doesNotThrow(()=>assertSalesDeliveryIntegrity(result.vault.documents,result.vault.documentEvents));
});

test('Batch7 delivery: next note contains remaining quantities, supports subset shipments and full fulfillment',()=>{
  const {vault,quote,order}=setup();
  const draft1=createLinkedDeliveryDraft(vault,quote.id);
  const first=issue(draft1.vault,draft1.document,['5','1'],[0]);
  const proof1=confirmSalesDelivery(first.vault,input(first.note,'POD-1')).vault;
  const next=createLinkedDeliveryDraft(proof1,quote.id);
  assert.equal(next.created,true);
  assert.notEqual(next.document.id,first.note.id);
  assert.deepEqual(next.document.items.map(x=>x.quantity),['7.5','6']);
  const repeat=createLinkedDeliveryDraft(next.vault,quote.id);
  assert.equal(repeat.created,false);
  assert.equal(repeat.document.id,next.document.id);
  const second=issue(next.vault,next.document,['7.5','6']);
  const proof2=confirmSalesDelivery(second.vault,input(second.note,'POD-2')).vault;
  assert.deepEqual(salesDeliveryBalances(order,proof2.documentEvents).map(x=>[x.ordered,x.delivered,x.remaining]),
    [['12.5','12.5','0'],['6','6','0']]);
  assert.equal(linkedDeliveries(quote,proof2.documents,proof2.documentEvents).length,2);
  assert.throws(()=>createLinkedDeliveryDraft(proof2,quote.id),/already confirmed delivered/);
});

test('Batch7 delivery: prevents duplicate receipts, stale notes, draft/void and overdelivery',()=>{
  const {vault,quote}=setup();
  const draft=createLinkedDeliveryDraft(vault,quote.id);
  assert.throws(()=>confirmSalesDelivery(draft.vault,input(draft.document)),/issued Delivery Note/);
  const original=issue(draft.vault,draft.document,['12.5','6']);
  const confirmed=confirmSalesDelivery(original.vault,input(original.note)).vault;
  assert.throws(()=>confirmSalesDelivery(confirmed,input(original.note)),/already been confirmed/);
  assert.throws(()=>confirmSalesDelivery(original.vault,{...input(original.note),expectedDeliveryNoteUpdatedAt:'stale'}),/changed/);
  assert.throws(()=>confirmSalesDelivery(original.vault,{...input(original.note),confirmed:false}),/Confirm physical/);
  const invalid=issue(draft.vault,draft.document,['12.5001','6']);
  assert.throws(()=>confirmSalesDelivery(invalid.vault,input(invalid.note)),/exceeds the remaining/);
  const voided={...original.vault,documents:original.vault.documents.map(doc=>doc.id===original.note.id?{...doc,lifecycleStatus:'voided'}:doc)};
  assert.throws(()=>confirmSalesDelivery(voided,input(original.note)),/issued Delivery Note/);
});

test('Batch7 delivery: mismatched line identity, customer, notes and dates fail closed',()=>{
  const {vault,quote}=setup(),d=createLinkedDeliveryDraft(vault,quote.id);
  const v=issue(d.vault,d.document,['3','2']);
  const wrongName={...v.vault,documents:v.vault.documents.map(doc=>doc.id===v.note.id?
    {...doc,items:doc.items.map((item,i)=>i===0?{...item,descriptionEn:'Wrong product'}:item)}:doc)};
  assert.throws(()=>confirmSalesDelivery(wrongName,input(v.note)),/no unique matching/);
  const wrongCustomer={...v.vault,documents:v.vault.documents.map(doc=>doc.id===v.note.id?
    {...doc,customerSnapshot:{...doc.customerSnapshot,sourceCustomerId:'other'}}:doc)};
  assert.throws(()=>confirmSalesDelivery(wrongCustomer,input(v.note)),/customer or currency/);
  assert.throws(()=>confirmSalesDelivery(v.vault,{...input(v.note),reference:'   '}),/reference is required/);
  assert.throws(()=>confirmSalesDelivery(v.vault,{...input(v.note),deliveredDate:'2099-01-01'}),/Delivery date/);
  assert.throws(()=>confirmSalesDelivery(v.vault,{...input(v.note),notes:'x'.repeat(600)}),/too long/);
});

test('Batch7 delivery: changing confirmed delivery quantity, revision, identity or erasing it is rejected',()=>{
  const {vault,quote}=setup(),d=createLinkedDeliveryDraft(vault,quote.id);
  const issued=issue(d.vault,d.document,['5','2']);
  const accepted=confirmSalesDelivery(issued.vault,input(issued.note)).vault;
  for(const patch of [
    {updatedAt:'new-date'},
    {status:'draft'},
    {lifecycleStatus:'voided'},
    {customerSnapshot:{...issued.note.customerSnapshot,sourceCustomerId:'OTHER'}},
    {items:issued.note.items.map((x,i)=>i===0?{...x,quantity:'4'}:x)}
  ]){
    const altered=accepted.documents.map(doc=>doc.id===issued.note.id?{...doc,...patch}:doc);
    assert.throws(()=>assertSalesDeliveryIntegrity(altered,accepted.documentEvents),
      /identity or version changed|items or quantities differ/);
  }
  assert.throws(()=>assertSalesDeliveryIntegrity(accepted.documents.filter(x=>x.id!==issued.note.id),accepted.documentEvents),
    /identity or version changed/);
  const corrupt={...accepted,documentEvents:[...accepted.documentEvents,
    {...accepted.documentEvents.at(-1),id:'bad',note:'@lourex:sales-order:delivery-confirmed:v1:broken'}]};
  assert.throws(()=>assertSalesDeliveryIntegrity(corrupt.documents,corrupt.documentEvents),/audit evidence is invalid/);
});

test('Batch7 delivery: two offline devices independently confirming full SO quantities cannot both sync',()=>{
  const {vault,quote}=setup();
  const leftDraft=createLinkedDeliveryDraft(vault,quote.id),rightDraft=createLinkedDeliveryDraft(vault,quote.id);
  const a=issue(leftDraft.vault,leftDraft.document,['12.5','6']);
  const b=issue(rightDraft.vault,rightDraft.document,['12.5','6']);
  const left=confirmSalesDelivery(a.vault,input(a.note,'LEFT')).vault;
  const right=confirmSalesDelivery(b.vault,input(b.note,'RIGHT')).vault;
  const combinedDocs=[...left.documents,...right.documents.filter(x=>x.kind==='delivery-note')];
  const combinedEvents=[...left.documentEvents,...right.documentEvents.filter(x=>
    (x.documentId===b.note.id&&x.type==='created')||
    (x.documentId===b.note.id&&x.note.startsWith('@lourex:sales-order:delivery-confirmed:v1:')))];
  assert.throws(()=>assertSalesDeliveryIntegrity(combinedDocs,combinedEvents),/Concurrent deliveries exceed ordered quantities/);
  assert.throws(()=>mergeVaultIntent(vault,left,right));
});

test('Batch7 delivery: sales/owner/admin confirm but finance, purchasing, viewer cannot',()=>{
  const {vault,quote}=setup(),d=createLinkedDeliveryDraft(vault,quote.id);
  const {vault:ready,note}=issue(d.vault,d.document,['4','2']);
  const owner=defaultOwnerMember();
  for(const role of ['finance','purchasing','viewer']){
    const person={...owner,id:role,role,displayName:role};
    const scope={...ready,teamMembers:[owner,person],appSettings:{...ready.appSettings,activeTeamMemberId:role}};
    assert.throws(()=>confirmSalesDelivery(scope,input(note)),/does not have permission/);
  }
  for(const role of ['owner','admin','sales']){
    const person={...owner,id:role,role,displayName:role};
    const scope={...ready,teamMembers:[owner,person],appSettings:{...ready.appSettings,activeTeamMemberId:role}};
    assert.equal(confirmSalesDelivery(scope,input(note)).delivery.confirmedByMemberId,role);
  }
});

test('Batch7 delivery: UI confirmation is explicit, vault write serialized, confirmed notes are locked',async()=>{
  const page=await readFile(new URL('../src/components/DocumentsPage.tsx',import.meta.url),'utf8');
  const panel=await readFile(new URL('../src/components/SalesDeliveryReview.tsx',import.meta.url),'utf8');
  const app=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
  const merge=await readFile(new URL('../src/storage/vault-merge.ts',import.meta.url),'utf8');
  assert.match(page,/mutateVaultSafely\(vault=>confirmSalesDelivery\(vault,input\)\.vault\)/);
  assert.match(page,/SalesDeliveryReview deliveryNote=\{doc\}/);
  assert.match(panel,/this\.state\.confirmed/);
  assert.match(app,/confirmedSalesDeliveries\(doc\.id,vault\.documentEvents\)/);
  assert.match(merge,/assertSalesDeliveryIntegrity\(documents,documentEvents\)/);
});
