import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { assertGovernancePermission } from './governance.js';
import { createDocumentEvent } from './document-lifecycle.js';
import { createLinkedPurchaseOrderDraft, linkedPurchaseOrders, purchaseOrderSourceEligible } from './procurement-flow.js';
import { decimalToScaled, isNonNegativeDecimalInput, normalizeDecimalInput } from './money.js';
import { isIsoDate } from './id.js';
import { t } from './i18n.js';

const QUOTE_MARKER='@lourex:supplier-quotation:accepted:v1:';

export interface SupplierQuotationAcceptanceInput{
  rfqId:string;
  expectedRfqUpdatedAt:string;
  expectedPurchaseOrderUpdatedAt:string;
  reference:string;
  unitPrices:string[];
  validUntil?:string;
  notes?:string;
}

export interface AcceptedSupplierQuotation{
  rfqId:string;
  purchaseOrderId:string;
  reference:string;
  supplierId:string;
  currency:string;
  acceptedAt:string;
  acceptedByMemberId:string;
  validUntil:string;
  notes:string;
  lines:Array<{rfqItemId:string;quantity:string;unit:string;unitPrice:string}>;
}

export function isAcceptedSupplierQuotationEvent(event:DocumentEventRecord):boolean{
  return event.type==='audit'&&event.note.startsWith(QUOTE_MARKER);
}

export function acceptedSupplierQuotationEvents(rfqId:string,events:DocumentEventRecord[]):AcceptedSupplierQuotation[]{
  return events.filter(event=>event.documentId===rfqId&&isAcceptedSupplierQuotationEvent(event)).flatMap(event=>{
    try{
      const payload=JSON.parse(event.note.slice(QUOTE_MARKER.length)) as AcceptedSupplierQuotation;
      if(!payload||payload.rfqId!==rfqId||!payload.purchaseOrderId||!Array.isArray(payload.lines)
        ||payload.lines.some(line=>!line.rfqItemId||!line.unit||!line.quantity||!line.unitPrice))return[];
      return [{...payload,acceptedAt:event.at}];
    }catch{return[];}
  });
}

function fail(en:string,ar:string):never{throw new Error(t(en,ar));}

function sameLine(source:LourexDocument['items'][number],target:LourexDocument['items'][number]):boolean{
  return Boolean(source&&target&&
    decimalToScaled(source.quantity,4)===decimalToScaled(target.quantity,4)&&
    source.unit.trim()===target.unit.trim()&&
    source.descriptionEn.trim()===target.descriptionEn.trim()&&
    source.descriptionAr.trim()===target.descriptionAr.trim()&&
    source.hsCode.trim()===target.hsCode.trim()&&source.origin.trim()===target.origin.trim());
}

export function acceptSupplierQuotation(
  vault:VaultPayload,input:SupplierQuotationAcceptanceInput
):{vault:VaultPayload;purchaseOrder:LourexDocument;quotation:AcceptedSupplierQuotation}{
  const actor=assertGovernancePermission(vault,'approve-supplier-quote');
  const rfq=vault.documents.find(doc=>doc.id===input.rfqId);
  if(!rfq||!purchaseOrderSourceEligible(rfq))fail('An active issued RFQ is required.','يلزم طلب عرض سعر صادر وسارٍ.');
  if(!input.expectedRfqUpdatedAt||rfq.updatedAt!==input.expectedRfqUpdatedAt){
    fail('RFQ changed. Reopen and review its latest version.','تغير طلب عرض السعر. افتح أحدث نسخة وراجعها.');
  }
  const supplierId=rfq.supplierSnapshot?.sourceSupplierId?.trim()||'';
  if(!supplierId)fail('Select a registered supplier in the RFQ first.','اختر موردًا مسجلًا في طلب عرض السعر أولًا.');
  if(!/^[A-Z]{3}$/.test(rfq.currency.trim()))fail('The RFQ currency is invalid.','عملة طلب عرض السعر غير صالحة.');
  if(!Array.isArray(input.unitPrices)||input.unitPrices.length!==rfq.items.length||!rfq.items.length){
    fail('Quote all RFQ lines without omitting or adding items.','أدخل أسعار جميع أصناف طلب عرض السعر دون إضافة أو حذف.');
  }
  const reference=input.reference.trim(),notes=(input.notes||'').trim(),validUntil=(input.validUntil||'').trim();
  if(!reference||reference.length>100||/[\u0000-\u001f]/.test(reference)){
    fail('Enter a valid supplier quotation reference (up to 100 characters).','أدخل مرجع عرض سعر المورد (حتى 100 حرف).');
  }
  if(notes.length>500||/[\u0000-\u001f]/.test(notes)){
    fail('Supplier quotation notes are too long or invalid.','ملاحظات عرض المورد طويلة جدًا أو غير صالحة.');
  }
  if(validUntil&&(!isIsoDate(validUntil)||validUntil<new Date().toISOString().slice(0,10))){
    fail('Supplier quotation expiry is invalid or in the past.','صلاحية عرض المورد غير صحيحة أو انتهت.');
  }
  const unitPrices=input.unitPrices.map(raw=>{
    const value=normalizeDecimalInput(raw);
    if(!isNonNegativeDecimalInput(value)||!/^\d{1,18}(?:\.\d{1,4})?$/.test(value)){
      fail('Each supplier unit price must be a non-negative number with at most 4 decimals.','يجب أن يكون سعر وحدة المورد موجبًا أو صفرًا وبحد أقصى أربع خانات عشرية.');
    }
    return value;
  });
  if(acceptedSupplierQuotationEvents(rfq.id,vault.documentEvents).some(quote=>
      vault.documents.some(doc=>doc.id===quote.purchaseOrderId&&doc.lifecycleStatus!=='voided'))){
    fail('A supplier quote has already been accepted for this active RFQ order.','تم اعتماد عرض مورد بالفعل لأمر الشراء النشط المرتبط بهذا الطلب.');
  }
  // The PO is a draft, and may be created atomically here if the user did not
  // first invoke the RFQ -> PO action. Neither path is allowed to post stock.
  const sourced=createLinkedPurchaseOrderDraft(vault,rfq.id);
  const po=sourced.document;
  if(po.status!=='draft'||po.lifecycleStatus==='voided'){
    fail('Only an active draft purchase order can receive supplier pricing.','لا يمكن نقل أسعار المورد إلا إلى مسودة أمر شراء نشطة.');
  }
  if(!sourced.created&&po.updatedAt!==input.expectedPurchaseOrderUpdatedAt){
    fail('Purchase order changed. Reopen and review the latest draft.','تغير أمر الشراء. افتح المسودة الحديثة وراجعها.');
  }
  if(sourced.created&&input.expectedPurchaseOrderUpdatedAt){
    fail('The previously linked purchase order is missing. Review before accepting.','لم يعد أمر الشراء المرتبط السابق موجودًا. راجع الطلب قبل الاعتماد.');
  }
  if(po.currency!==rfq.currency||po.supplierSnapshot?.sourceSupplierId!==supplierId){
    fail('Supplier or currency differs between the RFQ and the purchase order.','المورد أو العملة مختلفان بين طلب عرض السعر وأمر الشراء.');
  }
  if(po.items.length!==rfq.items.length||rfq.items.some((line,i)=>!sameLine(line,po.items[i]))){
    fail('PO item quantities or descriptions differ from the RFQ. Review before applying prices.','تختلف كميات أو أوصاف أمر الشراء عن طلب عرض السعر. راجعها قبل نقل الأسعار.');
  }
  if(po.items.some(line=>line.unitPrice.trim()||line.unitCost.trim())){
    fail('Purchase order already has prices or costs. Do not overwrite them silently.','أمر الشراء يحتوي على أسعار أو تكاليف. لن يتم استبدالها تلقائيًا.');
  }
  const acceptedAt=new Date().toISOString();
  const updated:LourexDocument={...po,items:po.items.map((line,i)=>({...line,unitPrice:unitPrices[i]})),updatedAt:acceptedAt};
  const quotation:AcceptedSupplierQuotation={
    rfqId:rfq.id,purchaseOrderId:po.id,reference,supplierId,currency:rfq.currency,
    acceptedAt,acceptedByMemberId:actor.id,validUntil,notes,
    lines:rfq.items.map((line,i)=>({rfqItemId:line.id,quantity:line.quantity,unit:line.unit,unitPrice:unitPrices[i]}))
  };
  const event=createDocumentEvent(rfq,'audit',QUOTE_MARKER+JSON.stringify(quotation),updated);
  const documents=sourced.vault.documents.map(doc=>doc.id===updated.id?updated:doc);
  return{
    vault:{...sourced.vault,documents,documentEvents:[...sourced.vault.documentEvents,event]},
    purchaseOrder:updated,quotation
  };
}
