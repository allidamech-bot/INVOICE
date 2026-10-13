import type {VaultPayload} from '../types.js';
import {scopeVault} from './workspaces.js';
import {confirmedSalesDeliveries} from './sales-delivery-flow.js';
import {salesDeliveryStockIssues} from './sales-delivery-stock.js';
import {inventoryMovementAccountingIsValid} from './operations.js';

const arDigits='٠١٢٣٤٥٦٧٨٩',faDigits='۰۱۲۳۴۵۶۷۸۹';
function normalized(value:string):string{
 return value.normalize('NFKC').replace(/[٠-٩۰-۹]/g,ch=>
  String(arDigits.includes(ch)?arDigits.indexOf(ch):faDigits.indexOf(ch))).trim();
}
/** Only explicit STATUS questions, never commands to create, issue or receive. */
export function isOperationalDocumentStatusIntent(message:string):boolean{
 const q=normalized(String(message||''));
 return q.length>=10&&q.length<=550&&
  /(?:\bstatus\b|\bprogress\b|\bstate\b|حالة|وضع|موقف|شو صار|وين وصل|هل تم|هل صدر|هل اعتمد)/iu.test(q)&&
  /(?:\bpurchase[\s-]*order\b|\bdelivery[\s-]*note\b|أمر\s*(?:ال)?شراء|طلب\s*(?:ال)?شراء|سند\s*(?:ال)?تسليم|\b(?:PO|DN)[-_]\d)/iu.test(q)&&
  !/(?:أنشئ|انشئ|جهز|جهّز|اعتمد الآن|أصدر الآن|\bcreate\b|\bprepare\b|\bpost\b|\bfinalize\b)/iu.test(q);
}
export function operationalDocumentStatus(vault:VaultPayload,message:string,language:'ar'|'en'):string{
 const ar=language==='ar';
 if(!isOperationalDocumentStatusIntent(message))throw new Error('Not an operational document status request.');
 const text=normalized(message);
 const references=[...text.matchAll(/\b[A-Z]{2,12}[-_]\d{2,}(?:[-_]\d{1,})+\b/giu)].map(m=>m[0]!.toUpperCase());
 if(new Set(references).size!==1)return ar
  ?'اذكر رقم أمر شراء أو سند تسليم واحدًا بالكامل حتى أتحقق من حالته. لم أغيّر أي سجل.'
  :'Provide one exact purchase order or delivery note number. No record was changed.';
 const wanted=references[0]!;
 const scoped=scopeVault(vault);
 const matches=scoped.documents.filter(doc=>(doc.kind==='purchase-order'||doc.kind==='delivery-note')&&doc.number.toUpperCase()===wanted);
 if(matches.length!==1)return ar
  ?'لم أجد أمر شراء أو سند تسليم مطابقًا لهذا الرقم في الشركة والفرع الحاليين.'
  :'No purchase order or delivery note with this exact number was found in the active company and branch.';
 const doc=matches[0]!;
 const requestedType=/أمر\s*(?:ال)?شراء|طلب\s*(?:ال)?شراء|\bpurchase[\s-]*order\b/iu.test(text)?'purchase-order':
  /سند\s*(?:ال)?تسليم|\bdelivery[\s-]*note\b/iu.test(text)?'delivery-note':null;
 if(requestedType&&doc.kind!==requestedType)return ar
  ?'رقم المستند موجود لكنه لا يطابق النوع الذي طلبته. لم أفتح أو أغيّر أي مستند.'
  :'The document number exists but its kind differs from the requested type. Nothing was opened or modified.';
 const lines=[ar?'حالة المستند '+doc.number:'Document status '+doc.number];
 lines.push((ar?'النوع: ':'Type: ')+(doc.kind==='purchase-order'?(ar?'أمر شراء':'Purchase order'):(ar?'سند تسليم':'Delivery note')));
 lines.push((ar?'الحالة المسجلة: ':'Recorded status: ')+
  (doc.lifecycleStatus==='voided'?(ar?'ملغى':'Voided'):doc.status==='final'?(ar?'صادر':'Issued'):(ar?'مسودة':'Draft')));
 if(doc.kind==='purchase-order'){
  lines.push(ar
   ?'إصدار أمر الشراء لا يثبت استلام البضاعة. لا يوجد هنا سجل GRN مستقل يمكن مطابقته آليًا بأمر الشراء؛ لا أستطيع تأكيد الاستلام أو إضافة مخزون اعتمادًا على حالة الأمر.'
   :'A purchase order being issued is not evidence of receipt. This record has no independent linked GRN to verify; goods receipt or stock additions cannot be asserted from order status.');
 }else{
  const confirmed=confirmedSalesDeliveries(doc.id,scoped.documentEvents);
  const validProof=doc.status==='final'&&doc.lifecycleStatus!=='voided'&&confirmed.length===1&&
   confirmed[0]!.deliveryNoteUpdatedAt===doc.updatedAt&&confirmed[0]!.deliveryNoteNumber===doc.number;
  lines.push(ar?'تأكيد التسليم: '+(validProof?'مثبت بدليل مطابق':'غير مثبت بدليل مطابق'):
    'Delivery confirmation: '+(validProof?'One matching recorded confirmation':'No single matching confirmation'));
  if(!validProof){
   lines.push(ar?'لا يمكن إثبات صرف مخزون لهذا السند من الحالة الحالية وحدها.':'No stock issue can be confirmed from this document status alone.');
  }else{
   const issues=salesDeliveryStockIssues(doc.id,scoped.inventoryMovements);
   const valid=issues.filter(inventoryMovementAccountingIsValid);
   const broken=issues.length-valid.length;
   lines.push(ar?'حركات الصرف الصالحة المرتبطة: '+valid.length:'Valid linked stock issue movements: '+valid.length);
   if(broken)lines.push(ar?'هناك '+broken+' حركة مرتبطة غير صالحة وتحتاج مراجعة.':broken+' linked movements fail validation and require review.');
   lines.push(ar?'عدد الحركات لا يثبت وحده اكتمال الكميات المسلّمة أو المطابقة النهائية.':'The movement count alone does not prove all delivered quantities were fulfilled or reconciled.');
  }
 }
 lines.push(ar?'المصدر: سجلات الشركة والفرع الحاليين. هذه قراءة فقط، دون حفظ أو ترحيل.':'Source: records in the active company and branch. Read only; nothing saved or posted.');
 return lines.join('\n');
}
