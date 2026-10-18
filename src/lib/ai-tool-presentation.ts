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

/** The shipped chat renderer has its own answer layer. Keep customer evidence
 * explicit there: the generic depth-limited object formatter hides entries. */
function aiCustomerEvidenceScalar(value:unknown,max=160):string {
 return value===null||value===undefined||value===''?'—':String(value).replace(/[\r\n]+/g,' ').trim().slice(0,max);
}
function aiCustomerEvidenceRecord(value:unknown):Record<string,unknown>|null {
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
}
function boundedCustomerEvidence(lines:string[],language:'ar'|'en'):string {
 const text=lines.join('\n');
 if(text.length<=4300)return text;
 let prefix=text.slice(0,4090),boundary=prefix.lastIndexOf('\n');
 if(boundary>0)prefix=prefix.slice(0,boundary);
 return prefix+'\n'+(language==='ar'
  ?'… العرض جزئي بسبب حد طول الرسالة. اطلب كشفًا لفترة أقصر للاطلاع على بقية الحركات.'
  :'… Partial display due to the message length limit. Ask for a shorter statement period to see remaining entries.');
}
/** Read-only ledger presentation. Never calculates a balance or suppresses a
 * recorded payment in favor of a nested JSON summary. */
export function formatAiCustomerHistoryEvidence(data:unknown,language:'ar'|'en'):string {
 const ar=language==='ar',history=aiCustomerEvidenceRecord(data);
 if(!history)return ar?'تعذر عرض كشف العميل من البيانات المتاحة.':'The available customer statement could not be displayed.';
 if(history.truncated===true)return ar?'كشف العميل غير مكتمل؛ لا يمكن اعتماد المعاينة. اطلب نطاقًا أصغر.':'Customer statement evidence is incomplete; request a smaller range.';
 if(!Array.isArray(history.statements))return ar?'كشف العميل غير متاح في النتيجة الحالية.':'No customer statement was returned.';
 if(!history.statements.length)return ar?'لا توجد حركات مالية مسجلة في كشف العميل.':'No financial movements are recorded in this customer statement.';
 const lines:string[]=[];
 for(const value of history.statements) {
  const statement=aiCustomerEvidenceRecord(value);if(!statement)continue;
  const currency=aiCustomerEvidenceScalar(statement.currency,8);
  lines.push('**'+(ar?'كشف حساب':'Statement')+' — '+currency+'**');
  lines.push((ar?'إجمالي الفواتير: ':'Billed: ')+aiCustomerEvidenceScalar(statement.billed,32)+' '+currency);
  lines.push((ar?'التحصيلات: ':'Payments: ')+aiCustomerEvidenceScalar(statement.paid,32)+' '+currency);
  lines.push((ar?'المستحق: ':'Outstanding: ')+aiCustomerEvidenceScalar(statement.outstanding,32)+' '+currency);
  const entries=Array.isArray(statement.entries)?statement.entries:[];
  if(!entries.length){lines.push(ar?'لا توجد حركات مفصلة.':'No detailed movements.');continue;}
  lines.push(ar?'**الحركات المسجلة:**':'**Recorded movements:**');
  for(const value of entries){
   const entry=aiCustomerEvidenceRecord(value);if(!entry)continue;
   const type=entry.type==='payment'?(ar?'تحصيل':'Payment')
    :entry.type==='invoice'?(ar?'فاتورة':'Invoice')
    :entry.type==='credit-note'?(ar?'إشعار دائن':'Credit note'):(ar?'حركة':'Entry');
   lines.push('- **'+type+' — '+aiCustomerEvidenceScalar(entry.date,24)+'**');
   lines.push('  '+(ar?'المرجع: ':'Reference: ')+aiCustomerEvidenceScalar(entry.reference,140));
   if(entry.type==='invoice')
    lines.push('  '+(ar?'قيمة الفاتورة: ':'Invoice amount: ')+aiCustomerEvidenceScalar(entry.debit,32)+' '+currency);
   else
    lines.push('  '+(ar?'المبلغ الدائن: ':'Credit amount: ')+aiCustomerEvidenceScalar(entry.credit,32)+' '+currency);
   lines.push('  '+(ar?'الرصيد بعد الحركة: ':'Balance after movement: ')+aiCustomerEvidenceScalar(entry.balance,32)+' '+currency);
   if(entry.relatedInvoiceNumber)
    lines.push('  '+(ar?'الفاتورة المرتبطة: ':'Related invoice: ')+aiCustomerEvidenceScalar(entry.relatedInvoiceNumber,140));
  }
  // The source currently returns the latest 12 entries. At that boundary,
  // don't imply that the displayed statement is the full historical ledger.
  if(entries.length>=12)lines.push(ar?'آخر 12 حركة فقط معروضة؛ قد توجد حركات أقدم.':'Only the latest 12 movements are shown; older movements may exist.');
  lines.push('');
 }
 return boundedCustomerEvidence(lines,language);
}
/** Companion summary for the same named customer, avoiding raw IDs and dense
 * English key/value dumps in Arabic advisor conversations. */
export function formatAiCustomerSummaryEvidence(data:unknown,language:'ar'|'en'):string {
 const ar=language==='ar',customer=aiCustomerEvidenceRecord(data);
 if(!customer)return ar?'ملخص العميل غير متاح.':'Customer summary unavailable.';
 if(customer.truncated===true)return ar?'ملخص العميل غير مكتمل.':'Customer summary is incomplete.';
 const lines=[(ar?'العميل: ':'Customer: ')+aiCustomerEvidenceScalar(customer.name,160)];
 const totals=Array.isArray(customer.receivables)?customer.receivables:[];
 for(const value of totals){
  const row=aiCustomerEvidenceRecord(value);if(!row)continue;
  const currency=aiCustomerEvidenceScalar(row.currency,8);
  lines.push((ar?'الفواتير: ':'Billed: ')+aiCustomerEvidenceScalar(row.billed,32)+' '+currency);
  lines.push((ar?'المقبوض: ':'Collected: ')+aiCustomerEvidenceScalar(row.paid,32)+' '+currency);
  lines.push((ar?'المتبقي: ':'Outstanding: ')+aiCustomerEvidenceScalar(row.outstanding,32)+' '+currency);
 }
 const docs=Array.isArray(customer.recentDocuments)?customer.recentDocuments:[];
 if(docs.length){
  lines.push(ar?'**المستندات الأخيرة:**':'**Recent documents:**');
  for(const value of docs){
   const row=aiCustomerEvidenceRecord(value);if(!row)continue;
   const kind=row.kind==='invoice'?(ar?'فاتورة':'Invoice'):row.kind==='proforma'?(ar?'عرض سعر':'Quotation'):(ar?'مستند':'Document');
   lines.push('- '+kind+' — '+aiCustomerEvidenceScalar(row.number,120));
   lines.push('  '+(ar?'التاريخ: ':'Date: ')+aiCustomerEvidenceScalar(row.date,24)+' · '+aiCustomerEvidenceScalar(row.total,40)+' '+aiCustomerEvidenceScalar(row.currency,8));
  }
 }
 return boundedCustomerEvidence(lines,language);
}
