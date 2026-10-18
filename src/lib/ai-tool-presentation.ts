import { getUiLanguage, t } from './i18n.js';

/** Presentation only: never writes site or commercial-document preferences. */
export function assistantToolLanguage():'ar'|'en' {
  const language=typeof document==='undefined'?null:document.getElementById('lourex-ai-panel')?.getAttribute('data-ai-ui-language');
  return language==='ar'||language==='en'?language:getUiLanguage();
}
export function assistantToolText(en:string,ar:string):string {
  const language=typeof document==='undefined'?null:document.getElementById('lourex-ai-panel')?.getAttribute('data-ai-ui-language');
  return language==='ar'?ar:language==='en'?en:t(en,ar);
}
export function assistantToolIsArabic():boolean{return assistantToolLanguage()==='ar';}

/** Financial document evidence has ordered, explicit fields. The generic
 * ten-field summary must never hide its items or totals behind metadata. */
export function formatAiDocumentEvidence(data:unknown,language:'ar'|'en'):string {
 const ar=language==='ar';
 if(!data||typeof data!=='object'||Array.isArray(data))return '';
 const doc=data as Record<string,any>;
 if(doc.truncated===true)return ar?'نتيجة المستند غير مكتملة؛ لا يمكن اعتمادها للمراجعة.':'Document evidence is incomplete; it cannot be relied on for review.';
 const scalar=(value:unknown)=>value===null||value===undefined||value===''?'—':String(value).replace(/[\r\n]+/g,' ').slice(0,250);
 const field=(en:string,arabic:string,value:unknown)=>(ar?arabic:en)+': '+scalar(value);
 const lines=[field('Document','المستند',doc.number),field('Customer','العميل',doc.customerName),
  field('Issue date','تاريخ الإصدار',doc.issueDate),field('Valid until / due date','صالح حتى / الاستحقاق',doc.dueDate),field('Currency','العملة',doc.currency)];
 const items=Array.isArray(doc.items)?doc.items:[];
 lines.push(ar?'الأصناف:':'Items:');
 for(const [index,row] of items.slice(0,20).entries()){
  lines.push(String(index+1)+'. '+scalar(ar?(row.descriptionAr||row.descriptionEn):(row.descriptionEn||row.descriptionAr))+' · '+
   [field('Quantity','الكمية',row.quantity),field('Unit','الوحدة',row.unit),field('Unit price','سعر الوحدة',row.unitPrice)].join(' · '));
 }
 if(!items.length)lines.push(ar?'لا توجد بنود معروضة.':'No line items returned.');
 if(doc.itemsTruncated||items.length>20||Number(doc.itemCount)>items.length)
  lines.push(ar?'قائمة الأصناف جزئية؛ راجع المستند الكامل قبل الاعتماد.':'The item list is partial; review the complete document before approval.');
 const totals=doc.totals||{};
 for(const [key,en,arabic] of [['subtotal','Subtotal','الإجمالي الفرعي'],['discount','Discount','الخصم'],['shipping','Shipping','الشحن'],['otherCharges','Other charges','رسوم أخرى'],['tax','Tax','الضريبة'],['grandTotal','Grand total','الإجمالي النهائي']] as const)
  if(totals[key]!==undefined)lines.push(field(en!,arabic!,totals[key])+' '+scalar(doc.currency));
 if(doc.terms?.validity)lines.push(field('Validity','الصلاحية',doc.terms.validity));
 const answer=lines.join('\n');
 return answer.length<=4800?answer:answer.slice(0,4600)+'\n'+(ar?'العرض جزئي بسبب حد طول الإجابة؛ اطلب بنودًا محددة.':'Partial response due to the answer length limit; request specific lines.');
}
