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

/** Compact, read-only evidence in the final chat. Recorded values are never recomputed. */
export function formatAiBusinessRecordReply(value:unknown,language:'ar'|'en'):string|null{
 const ar=language==='ar';
 if(!value||typeof value!=='object')return null;
 const rows=(value as {results?:unknown}).results;
 if(!Array.isArray(rows)||!rows.length)return null;
 const allowed=new Set(['document.get','customer.getSummary','customer.getHistory']);
 if(rows.some(row=>!row||typeof row!=='object'||!allowed.has(String(row.tool))))return null;
 const find=(tool:string)=>rows.find(row=>row.tool===tool&&row.ok===true);
 const doc=aiCustomerEvidenceRecord(find('document.get')?.data);
 const customer=aiCustomerEvidenceRecord(find('customer.getSummary')?.data);
 const history=aiCustomerEvidenceRecord(find('customer.getHistory')?.data);
 if(!doc&&!customer&&!history)return null;
 const safe=(v:unknown,max=150)=>String(v??'').replace(/[\r\n|<>*#]/g,' ').replace(/:::lourex-/g,' ').trim().slice(0,max)||'—';
 const lri='\u2066',pdi='\u2069',iso=(v:unknown,max=70)=>lri+safe(v,max)+pdi;
 const field=(name:string,v:unknown,unit='')=>'- **'+name+'**: '+(v===null||v===undefined||v===''?'—':iso(v)+(unit?' '+iso(unit,8):''));
 const lines:string[]=[];
 const currency=doc?safe(doc.currency,8):'';
 if(doc){
  const kind=doc.kind==='invoice'?(ar?'فاتورة':'Invoice'):doc.kind==='proforma'?(ar?'عرض سعر':'Quotation'):(ar?'مستند':'Document');
  lines.push('## '+kind+' '+safe(doc.number,100),'');
  if(doc.customerName||doc.supplierName)lines.push((ar?'**الطرف:** ':'**Party:** ')+safe(doc.customerName||doc.supplierName,150));
  lines.push(field(ar?'تاريخ الإصدار':'Issue date',doc.issueDate),
   field(ar?'الحالة':'Status',doc.status==='final'?(ar?'صادرة':'Issued'):doc.status==='draft'?(ar?'مسودة':'Draft'):doc.status),'');
  if(doc.truncated===true)lines.push(ar?'**تنبيه:** بيانات الفاتورة جزئية؛ افتح الأصل للتحقق.':'**Note:** Invoice data is incomplete; verify the original.');
  else{
   const totals=aiCustomerEvidenceRecord(doc.totals);
   if(totals){
    lines.push('### '+(ar?'القيم المالية':'Financial values'));
    for(const [key,arabic,english] of [
      ['subtotal','الإجمالي قبل الرسوم','Subtotal'],
      ['discount','الخصم','Discount'],
      ['shipping','الشحن','Shipping'],
      ['otherCharges','رسوم إضافية','Other charges'],
      ['tax','الضريبة','Tax'],
      ['grandTotal','الإجمالي النهائي','Grand total']
     ] as const){
      if(totals[key]!==null&&totals[key]!==undefined)
       lines.push(field(ar?arabic:english,totals[key],currency));
    }
   }
  }
 }
 if(customer){
  if(!doc)lines.push('## '+(ar?'حساب العميل':'Customer account')+' · '+safe(customer.name,150));
  const receivables=Array.isArray(customer.receivables)?customer.receivables:[];
  if(receivables.length)lines.push('','### '+(ar?'المستحقات والتحصيلات':'Receivables and collections'));
  for(const value of receivables){
   const entry=aiCustomerEvidenceRecord(value);if(!entry)continue;
   const curr=safe(entry.currency,8);
   lines.push('**'+curr+'**',field(ar?'إجمالي الفواتير':'Billed',entry.billed,curr),
    field(ar?'المبالغ المحصلة':'Collected',entry.paid,curr),field(ar?'الرصيد المتبقي':'Outstanding',entry.outstanding,curr));
  }
 }
 if(history){
  const statements=Array.isArray(history.statements)?history.statements:[];
  if(history.truncated===true)lines.push('','**'+(ar?'كشف العميل غير مكتمل.':'Customer statement is incomplete.')+'**');
  else if(statements.length){
   lines.push('','### '+(ar?'حركات الحساب المسجلة':'Recorded account movements'));
   for(const value of statements){
    const s=aiCustomerEvidenceRecord(value);if(!s)continue;
    const curr=safe(s.currency,8),entries=Array.isArray(s.entries)?s.entries:[];
    lines.push('**'+curr+'**');
    for(const value of entries){
     const e=aiCustomerEvidenceRecord(value);if(!e)continue;
     const type=e.type==='payment'?(ar?'تحصيل':'Payment'):e.type==='invoice'?(ar?'فاتورة':'Invoice'):e.type==='credit-note'?(ar?'إشعار دائن':'Credit note'):(ar?'حركة':'Entry');
     const amount=e.type==='invoice'?e.debit:e.credit;
     lines.push('- **'+type+'** · '+iso(e.date,30)+' · '+iso(e.reference,130),
      '  '+(ar?'المبلغ: ':'Amount: ')+iso(amount)+' '+iso(curr,8)+' · '+(ar?'الرصيد بعد الحركة: ':'Balance after: ')+iso(e.balance)+' '+iso(curr,8));
    }
    if(entries.length>=12)lines.push(ar?'آخر 12 حركة فقط؛ قد توجد حركات أقدم.':'Latest 12 movements only; older entries may exist.');
    if(!entries.length)lines.push(ar?'لا توجد حركات مفصلة في هذه النتيجة.':'No detailed movements in this response.');
   }
  }
 }
 for(const row of rows.filter(row=>!row.ok)){
  lines.push('','**'+(ar?'قراءة غير مكتملة: ':'Incomplete read: ')+safe(row.tool,80)+'**',safe(row.summary,180));
 }
 // The source includes at most 20 items, even when the original has more.
 // Keep them accessible but visually collapsed, after the important account facts.
 if(doc&&doc.truncated!==true&&Array.isArray(doc.items)&&doc.items.length){
  const items=doc.items,reported=Number(doc.itemCount)||items.length;
  lines.push('',':::lourex-details '+(ar?'أصناف المستند':'Document items')+' ('+items.length+'/'+reported+')');
  for(const [i,value] of items.entries()){
   const item=aiCustomerEvidenceRecord(value);if(!item)continue;
   lines.push('- '+(i+1)+'. '+safe((ar?item.descriptionAr||item.descriptionEn:item.descriptionEn||item.descriptionAr)||item.sku,100)+
     ' — '+(ar?'الكمية':'Qty')+' '+iso(item.quantity,25)+' · '+(ar?'سعر الوحدة':'Unit price')+' '+iso(item.unitPrice,25)+' '+iso(currency,8));
  }
  if(doc.itemsTruncated||reported>items.length)lines.push(ar?'**القائمة جزئية:** افتح الفاتورة الأصلية لرؤية جميع الأصناف.':'**Partial list:** Open the original invoice for every item.');
  lines.push(':::lourex-end');
 }
 const output=lines.filter((line,i)=>line!==''||lines[i-1]!=='').join('\n').trim();
 if(output.length>4750){
  const notice='\n'+(ar?'… تفاصيل إضافية لم تُعرض؛ اطلب فترة أقصر أو افتح السجل الأصلي.':'… Additional details omitted; request a shorter period or open the original.');
  const first=output.slice(0,4700-notice.length),end=first.lastIndexOf('\n');
  return (end>0?first.slice(0,end):first)+notice;
 }
 return output;
}
