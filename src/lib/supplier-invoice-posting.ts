import type { DocumentEventRecord, LourexDocument, PurchaseRecord, VaultPayload } from '../types.js';
import { approvalGate } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { matchedSupplierInvoices, assertSupplierInvoiceIntegrity } from './supplier-invoice-flow.js';
import { assertGoodsReceiptIntegrity } from './goods-receipt-flow.js';
import { createPurchase, createPurchaseItem, postPurchase, purchaseTotals } from './operations.js';
import { decimalToScaled } from './money.js';
import { t } from './i18n.js';

const MATCH_MARKER='@lourex:supplier-invoice:matched:v1:';
const POST_MARKER='@lourex:supplier-invoice:purchase-posted:v1:';
export interface PostMatchedSupplierInvoiceInput{
  purchaseOrderId:string;
  matchEventId:string;
  expectedPurchaseOrderUpdatedAt:string;
  savedItemIds:string[];
  confirmed:boolean;
}
export interface SupplierInvoicePostingEvidence{
  purchaseOrderId:string;
  supplierInvoiceMatchEventId:string;
  purchaseId:string;
  purchaseNumber:string;
  supplierId:string;
  currency:string;
  lineTotal:string;
  postedAt:string;
}
function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
function amount(value:string):bigint{return decimalToScaled(value,2);}
function quantity(value:string):bigint{return decimalToScaled(value,4);}

export function invoicePostingForMatch(matchEventId:string,events:DocumentEventRecord[]):SupplierInvoicePostingEvidence|undefined{
  for(const event of events){
    if(event.type!=='audit'||!event.note.startsWith(POST_MARKER))continue;
    try{
      const row=JSON.parse(event.note.slice(POST_MARKER.length)) as SupplierInvoicePostingEvidence;
      if(row.supplierInvoiceMatchEventId===matchEventId)return row;
    }catch{ /* Corrupt evidence is rejected by the merge integrity check. */ }
  }
  return undefined;
}

function purchaseIdForMatch(matchEventId:string):string{return 'purchase-from-'+matchEventId;}

/** This action posts exactly ONE previously approved invoice, never an entire PO.
 * Every inventory product mapping is explicitly selected by the user.
 * One posted PurchaseRecord opens one payable in the existing financial ledger.
 */
export function postMatchedSupplierInvoice(vault:VaultPayload,input:PostMatchedSupplierInvoiceInput):
  {vault:VaultPayload;posted:boolean;purchase:PurchaseRecord|null;approvalPending:boolean}{
  if(!input.confirmed)fail('Confirm the supplier invoice and inventory mappings before posting.','أكد فاتورة المورد وربط أصناف المخزون قبل الترحيل.');
  assertGoodsReceiptIntegrity(vault.documents,vault.documentEvents);
  assertSupplierInvoiceIntegrity(vault.documents,vault.documentEvents);
  assertMatchedSupplierInvoicePostingIntegrity(vault);
  const order=vault.documents.find(doc=>doc.id===input.purchaseOrderId);
  if(!order||order.kind!=='purchase-order'||order.role!=='standard'||order.status!=='final'
    ||order.lifecycleStatus==='voided')fail('An active issued Purchase Order is required for posting.','يلزم أمر شراء صادر وسارٍ للترحيل.');
  if(!input.expectedPurchaseOrderUpdatedAt||order.updatedAt!==input.expectedPurchaseOrderUpdatedAt)
    fail('Purchase Order has changed. Reopen and review the matched invoice.','تغير أمر الشراء. افتح الفاتورة المطابقة وراجعها مجددًا.');
  const sourceEvent=vault.documentEvents.find(event=>event.id===input.matchEventId
    &&event.documentId===order.id&&event.type==='audit'&&event.note.startsWith(MATCH_MARKER));
  if(!sourceEvent)fail('Matched supplier invoice evidence was not found.','لم يتم العثور على سجل مطابقة فاتورة المورد.');
  const invoice=matchedSupplierInvoices(order.id,[sourceEvent])[0];
  if(!invoice)fail('Matched supplier invoice evidence is invalid.','بيانات مطابقة فاتورة المورد غير صالحة.');
  if(invoice.purchaseOrderUpdatedAt!==order.updatedAt||invoice.currency!==order.currency
    ||invoice.supplierId!==order.supplierSnapshot?.sourceSupplierId)
    fail('Supplier invoice no longer matches the Purchase Order.','لم تعد فاتورة المورد متطابقة مع أمر الشراء.');
  const purchaseId=purchaseIdForMatch(sourceEvent.id);
  if(vault.purchases.some(p=>p.id===purchaseId||p.sourceSupplierInvoiceEventId===sourceEvent.id)
    ||invoicePostingForMatch(sourceEvent.id,vault.documentEvents))
    fail('This matched supplier invoice has already been posted.','سبق ترحيل فاتورة المورد المطابقة هذه.');
  if(!Array.isArray(input.savedItemIds)||input.savedItemIds.length!==invoice.lines.length)
    fail('Select a catalog stock item for every matched invoice line.','اختر صنفًا مخزنيًا لكل بند في الفاتورة المطابقة.');
  const sourceLines=new Map(order.items.map(line=>[line.id,line]));
  const seen=new Set<string>();
  const purchaseLines=invoice.lines.map((line,i)=>{
    const poLine=sourceLines.get(line.purchaseOrderLineId);
    const savedId=input.savedItemIds[i]?.trim()||'';
    const saved=vault.savedItems.find(item=>item.id===savedId&&!item.archived);
    if(!poLine||!saved||!savedId)
      fail('Each matched line must map to an active catalog item.','يجب ربط كل بند مطابق بصنف نشط في دليل المنتجات.');
    if(seen.has(saved.id))
      fail('A catalog item cannot be mapped twice in the same supplier invoice posting.','لا يمكن تكرار ربط الصنف المخزني في عملية ترحيل فاتورة واحدة.');
    seen.add(saved.id);
    if(saved.unit.trim().toLowerCase()!==line.unit.trim().toLowerCase()||poLine.unit!==line.unit)
      fail('Catalog item unit differs from the supplier invoice unit.','وحدة الصنف المخزني مختلفة عن وحدة فاتورة المورد.');
    if(quantity(line.quantity)<=0n||quantity(line.quantity)>quantity(poLine.quantity)
      ||decimalToScaled(line.unitPrice,4)!==decimalToScaled(poLine.unitPrice,4))
      fail('Supplier invoice quantity or price no longer matches the approved PO.','كمية أو سعر فاتورة المورد لا يطابقان أمر الشراء المعتمد.');
    return {...createPurchaseItem(saved),savedItemId:saved.id,sku:saved.sku||'',
      descriptionEn:poLine.descriptionEn,descriptionAr:poLine.descriptionAr,unit:line.unit,
      quantity:line.quantity,unitCost:line.unitPrice,landedUnitCost:''};
  });
  const base=createPurchase(vault.purchases,vault.suppliers,order.currency);
  const draft:PurchaseRecord={...base,id:purchaseId,date:invoice.invoiceDate,dueDate:invoice.dueDate,
    supplierSnapshot:structuredClone(order.supplierSnapshot??null),currency:order.currency,items:purchaseLines,
    freight:'0.00',duty:'0.00',otherCosts:'0.00',
    notes:`PO ${order.number} | Supplier invoice ${invoice.invoiceReference} | Reviewed match ${sourceEvent.id}`,
    sourceSupplierInvoiceEventId:sourceEvent.id,sourcePurchaseOrderId:order.id};
  if(amount(purchaseTotals(draft).landedTotal)!==amount(invoice.total))
    fail('Posting total differs from the reviewed supplier invoice.','إجمالي الترحيل يختلف عن فاتورة المورد المطابقة.');
  // Bind each approval to the exact, user-selected catalog mapping. A changed
  // mapping requires a fresh approval rather than reusing the prior decision.
  const approvalVersion=`${sourceEvent.at}|${input.savedItemIds.join('|')}`;
  const gate=approvalGate(vault,{action:'post-purchase',entityType:'purchase',entityId:draft.id,
    entityLabel:`${order.number} / ${invoice.invoiceReference}`,entityUpdatedAt:approvalVersion});
  if(!gate.allowed)return{vault:gate.vault,posted:false,purchase:null,approvalPending:true};
  const posted=postPurchase(draft,vault.savedItems,vault.inventoryMovements);
  if(amount(purchaseTotals(posted.purchase).landedTotal)!==amount(invoice.total)
    ||posted.movements.length!==invoice.lines.length)
    fail('Posting would not match the reviewed invoice or stock lines.','لن يطابق الترحيل الفاتورة المراجعة أو بنود المخزون.');
  const evidence:SupplierInvoicePostingEvidence={
    purchaseOrderId:order.id,supplierInvoiceMatchEventId:sourceEvent.id,purchaseId:posted.purchase.id,
    purchaseNumber:posted.purchase.number,supplierId:invoice.supplierId,currency:invoice.currency,
    lineTotal:invoice.total,postedAt:posted.purchase.postedAt
  };
  const event=createDocumentEvent(order,'audit',POST_MARKER+JSON.stringify(evidence));
  const result:VaultPayload={...vault,purchases:[...vault.purchases,posted.purchase],
    savedItems:posted.savedItems,inventoryMovements:[...vault.inventoryMovements,...posted.movements],
    documentEvents:[...vault.documentEvents,event]};
  assertMatchedSupplierInvoicePostingIntegrity(result);
  return {vault:result,posted:true,purchase:posted.purchase,approvalPending:false};
}

/** Run after vault merge to reject duplicate postings from offline clients and broken links. */
export function assertMatchedSupplierInvoicePostingIntegrity(vault:Pick<VaultPayload,
  'documents'|'documentEvents'|'purchases'|'inventoryMovements'>):void{
  const postingEvents=vault.documentEvents.filter(event=>event.type==='audit'&&event.note.startsWith(POST_MARKER));
  const linked=vault.purchases.filter(purchase=>purchase.sourceSupplierInvoiceEventId||purchase.sourcePurchaseOrderId);
  if(!postingEvents.length&&!linked.length)return;
  const orders=new Map(vault.documents.filter(doc=>doc.kind==='purchase-order').map(doc=>[doc.id,doc]));
  const matchEvents=new Map(vault.documentEvents.filter(event=>event.type==='audit'&&event.note.startsWith(MATCH_MARKER))
    .map(event=>[event.id,event]));
  const byMatch=new Set<string>(),byPurchase=new Set<string>();
  for(const event of postingEvents){
    let row:SupplierInvoicePostingEvidence;
    try{row=JSON.parse(event.note.slice(POST_MARKER.length)) as SupplierInvoicePostingEvidence;}
    catch{fail('Supplier invoice posting evidence is corrupted.','سجل ترحيل فاتورة المورد تالف.');}
    if(!row||!row.supplierInvoiceMatchEventId||!row.purchaseId||!row.purchaseOrderId
      ||row.purchaseId!==purchaseIdForMatch(row.supplierInvoiceMatchEventId)
      ||byMatch.has(row.supplierInvoiceMatchEventId)||byPurchase.has(row.purchaseId))
      fail('Duplicate or invalid supplier invoice posting evidence.','سجل ترحيل فاتورة المورد مكرر أو غير صالح.');
    byMatch.add(row.supplierInvoiceMatchEventId);byPurchase.add(row.purchaseId);
    const order=orders.get(row.purchaseOrderId),source=matchEvents.get(row.supplierInvoiceMatchEventId);
    const purchase=vault.purchases.find(item=>item.id===row.purchaseId);
    if(!order||!source||source.documentId!==order.id||!purchase||purchase.status==='draft'
      ||purchase.sourceSupplierInvoiceEventId!==source.id||purchase.sourcePurchaseOrderId!==order.id
      ||purchase.number!==row.purchaseNumber||purchase.currency!==row.currency
      ||purchase.supplierSnapshot?.sourceSupplierId!==row.supplierId||event.documentId!==order.id)
      fail('Posted supplier invoice source or purchase record is inconsistent.','مصدر فاتورة المورد المرحلة أو سجل الشراء غير متطابق.');
    const invoice=matchedSupplierInvoices(order.id,[source])[0];
    if(!invoice||invoice.currency!==row.currency||invoice.supplierId!==row.supplierId
      ||amount(invoice.total)!==amount(row.lineTotal)
      ||purchase.date!==invoice.invoiceDate||purchase.dueDate!==invoice.dueDate
      ||purchase.items.length!==invoice.lines.length
      ||amount(purchaseTotals(purchase).landedTotal)!==amount(invoice.total))
      fail('Posted purchase differs from the reviewed supplier invoice.','سجل الشراء المرحّل يختلف عن فاتورة المورد المعتمدة.');
    const seen=new Set<string>();
    for(let i=0;i<invoice.lines.length;i++){
      const line=invoice.lines[i],item=purchase.items[i];
      if(!line||!item||!item.savedItemId||seen.has(item.savedItemId)
        ||quantity(line.quantity)!==quantity(item.quantity)||line.unit!==item.unit
        ||decimalToScaled(line.unitPrice,4)!==decimalToScaled(item.unitCost,4))
        fail('Posted purchase line differs from the approved invoice.','بند الشراء المرحّل يختلف عن الفاتورة المعتمدة.');
      seen.add(item.savedItemId);
    }
    // Detect two merged devices independently posting the same match. Both create
    // valid movements locally, but their merged receipts must never be doubled.
    for(const item of purchase.items){
      const receipts=vault.inventoryMovements.filter(m=>m.sourceId===purchase.id&&m.type==='purchase'&&m.itemId===item.savedItemId);
      const reversals=vault.inventoryMovements.filter(m=>m.sourceId===purchase.id&&m.type==='purchase-reversal'&&m.itemId===item.savedItemId);
      if(receipts.length!==1||quantity(receipts[0]?.quantity||'0')!==quantity(item.quantity)
        ||(purchase.status==='posted'&&reversals.length!==0)
        ||(purchase.status==='reversed'&&(reversals.length!==1||quantity(reversals[0]?.quantity||'0')!==-quantity(item.quantity))))
        fail('Duplicate, missing or inconsistent supplier invoice inventory posting.','ترحيل المخزون لفاتورة المورد مكرر أو ناقص أو غير متطابق.');
    }
  }
  for(const purchase of linked){
    if(!purchase.sourceSupplierInvoiceEventId||!purchase.sourcePurchaseOrderId
      ||!byMatch.has(purchase.sourceSupplierInvoiceEventId)||!byPurchase.has(purchase.id))
      fail('A linked supplier purchase lacks its posting audit evidence.','سجل شراء مرتبط بفاتورة مورد دون إثبات ترحيل.');
  }
}
