import type {VaultPayload} from '../types.js';
import {scopeVault} from './workspaces.js';
import {invoiceSourceDelivery} from './sales-delivery-invoice.js';
import {salesDeliveryStockIssues} from './sales-delivery-stock.js';
import {inventoryMovementAccountingIsValid} from './operations.js';

/** Exact, read-only reply to "Did invoice NUMBER deduct stock?" The sales
 * delivery ledger, not invoice status alone, is accounting authority.
 * Direct document wording is the only trigger: do not follow file instructions. */
export function isAiInvoiceStockEvidenceIntent(message:string):boolean{
 const m=String(message||'').normalize('NFKC').trim();
 if(m.length<8||m.length>500)return false;
 return /(?:المخزون|مخزون|stock|inventory)/iu.test(m)&&
   /(?:فاتور[ةه]|invoice)/iu.test(m)&&
   /(?:خصم|نقص|سحب|صرف|ترحيل|تأثير|أثر|اثر|حرك[ةه]|deduct|decreas|reduc|issu|post|affect|movements?)/iu.test(m);
}
const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
const digits=(text:string)=>text.normalize('NFKC').replace(/[٠-٩۰-۹]/gu,
 ch=>String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch)));
export function aiInvoiceStockEvidence(vault:VaultPayload,message:string,language:'ar'|'en'):string{
 const arabic=language==='ar';
 if(!isAiInvoiceStockEvidenceIntent(message))throw new Error('Not an explicit invoice stock question.');
 const text=digits(message);
 const numbers=[...text.matchAll(/\b[A-Z]{2,12}[-_]\d{2,}(?:[-_]\d{1,})+\b/giu)]
   .map(m=>m[0]!.toUpperCase());
 const unique=[...new Set(numbers)];
 if(unique.length!==1)return arabic
  ?'اذكر رقم فاتورة واحدة بدقة لفحص دليل حركة المخزون. لم أغيّر أي بيانات.'
  :'Provide one exact invoice number so I can check linked stock evidence. No records were changed.';
 const scoped=scopeVault(vault);
 const invoices=scoped.documents.filter(doc=>doc.kind==='invoice'&&
   doc.number.toUpperCase()===unique[0]);
 if(invoices.length!==1)return arabic
  ?'لم أجد فاتورة واحدة مطابقة لهذا الرقم في الشركة والفرع الحاليين؛ لا أستطيع تأكيد أي حركة مخزون.'
  :'No unique invoice matches in the current company and branch; stock movement cannot be confirmed.';
 const invoice=invoices[0]!;
 if(invoice.status!=='final'||invoice.lifecycleStatus==='voided')
  return arabic
  ?'الفاتورة '+invoice.number+' مسودة أو ملغاة أو غير صادرة. لا يجوز اعتبار وجودها دليلًا على خصم المخزون. يلزم فحص سند التسليم وحركات المخزون المثبتة.'
  :'Invoice '+invoice.number+' is not an active issued invoice. Its existence is not proof of stock deduction; inspect the confirmed delivery and recorded movements.';
 let delivery;
 try{delivery=invoiceSourceDelivery(invoice.id,scoped.documents,scoped.documentEvents);}
 catch{return arabic
  ?'رابط سند التسليم للفاتورة غير صالح، لذلك لا أستطيع تأكيد خصم المخزون. يلزم مراجعة السجل.'
  :'The invoice-delivery evidence is invalid. Stock deduction cannot be verified; review the ledger.';}
 if(!delivery||delivery.kind!=='delivery-note')
  return arabic
   ?'الفاتورة '+invoice.number+' صادرة، لكن لا يوجد رابط سند تسليم موثق لها في هذا الفرع. إصدار الفاتورة وحده لا يثبت خصم المخزون، ولا يمكن استنتاج أن مخزونًا خُصم أو لم يُخصم بحركة مستقلة.'
   :'Invoice '+invoice.number+' is issued, but no verified delivery-note link was found in this branch. Invoice issuance alone is not stock-deduction evidence. Unrelated movements cannot be inferred.';
 const linked=salesDeliveryStockIssues(delivery.id,scoped.inventoryMovements);
 if(linked.some(m=>!inventoryMovementAccountingIsValid(m)))
  return arabic?'وجدت حركة صرف مرتبطة بسند التسليم لكنها غير صالحة محاسبيًا؛ لا يمكن تأكيد الخصم حتى إصلاح السجل.'
   :'A linked delivery stock issue fails accounting validation; deduction cannot be confirmed until the ledger is repaired.';
 if(!linked.length)return arabic
  ?'الفاتورة '+invoice.number+' مرتبطة بسند التسليم '+delivery.number+'، لكن لم أجد حركة صرف مخزون موثقة مرتبطة بهذا السند. لا أستطيع إثبات خصم المخزون من الفاتورة وحدها؛ راجع تأكيد التسليم وترحيل الصرف.'
  :'Invoice '+invoice.number+' links to delivery '+delivery.number+', but no validated linked stock issue was found. Issuing the invoice alone is not proof that stock was deducted.';
 const details=linked.slice(0,8).map(m=>{
  const name=scoped.savedItems.find(item=>item.id===m.itemId);
  const label=(arabic?name?.descriptionAr||name?.descriptionEn:name?.descriptionEn||name?.descriptionAr)||m.sku||m.itemId;
  return '• '+label+' — '+m.quantity+' ('+m.date+')';
 });
 const headline=arabic
  ?'وجدت '+linked.length+' حركة صرف مخزون مثبتة ومرتبطة بسند التسليم '+delivery.number+' للفاتورة '+invoice.number+'. هذه حركات صرف فعلية، وليست استنتاجًا من حالة الفاتورة.'
  :'Found '+linked.length+' validated stock issue movement(s) linked to delivery '+delivery.number+' for invoice '+invoice.number+'. These are recorded movements, not an inference from invoice status.';
 if(linked.length>8)details.push(arabic
  ?'هناك '+(linked.length-8)+' حركات إضافية غير معروضة هنا.'
  :(linked.length-8)+' additional movements not displayed.');
 return [headline,...details,arabic?'المصدر: سند التسليم المرتبط وسجل حركات المخزون للشركة والفرع الحاليين. لم تُغيَّر أي سجلات.':'Source: linked delivery note and recorded inventory movements in the current company and branch. No records changed.'].join('\n');
}
