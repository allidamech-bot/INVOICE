/** Read-only presentation data model for LOUREX local business evidence.
 * The source is the stored assistant message, never legacy nested JSX.
 * This parser never calculates money, loads records, or triggers actions. */
export type FinancialFact={label:string;value:string};
export type FinancialMovement={kind:'movement';label:string;date:string;reference:string;amount:string;balance:string};
export type FinancialSection={title:string;facts:FinancialFact[];movements:FinancialMovement[];notes:string[]};
export type FinancialReadout={title:string;party:string;intro:FinancialFact[];sections:FinancialSection[];itemsTitle:string;items:string[];partial:boolean};

const clean=(value:string)=>value.replace(/[\u2066-\u2069]/g,'').replace(/\*\*/g,'').replace(/\x60/g,'').trim();
const fact=(line:string):FinancialFact|null=>{
 const m=line.match(/^-\s+\*\*([^*]{1,100})\*\*:\s*(.+)$/);
 return m?{label:clean(m[1]||''),value:clean(m[2]||'')}:null;
};

/** Backward-compatible reader for the exact locally produced evidence format.
 * All content remains plain text; malformed delimiters fail closed. */
export function parseFinancialReadout(source:unknown):FinancialReadout|null{
 if(typeof source!=='string'||source.length>15000)return null;
 const raw=source.replace(/\r\n?/g,'\n');
 const lines=raw.split('\n'),first=lines[0]?.trim()||'';
 if(!/^## [^\n]{1,180}$/.test(first))return null;
 const start=lines.findIndex(s=>s.startsWith(':::lourex-details '));
 const stop=start>=0?lines.indexOf(':::lourex-end',start+1):-1;
 if(start>=0&&(start<1||stop<=start||stop!==lines.length-1))return null;
 const end=start>=0?start:lines.length;
 if(lines.slice(1,end).some(s=>s.startsWith(':::lourex-')))return null;
 // Customer-only statements and bounded documents may have no item list.
 // Accept them only with a known local financial heading, never from generic chat.
 const titled=lines.slice(1,end).some(s=>/^### (?:القيم المالية|المستحقات والتحصيلات|حركات الحساب المسجلة|Financial values|Receivables and collections|Recorded account movements)$/.test(s.trim()));
 if(!titled)return null;
 const title=clean(first.slice(3)),itemsTitle=start>=0?clean((lines[start]||'').slice(':::lourex-details '.length)):'';
 if(!title||(start>=0&&!itemsTitle))return null;
 const answer:FinancialReadout={title,party:'',intro:[],sections:[],itemsTitle,items:[],partial:false};
 let active:FinancialSection|null=null,latest:FinancialMovement|null=null;
 for(const original of lines.slice(1,end)){
  const line=original.trim();if(!line)continue;
  if(line.startsWith('### ')){
   active={title:clean(line.slice(4)),facts:[],movements:[],notes:[]};
   if(!active.title)return null;
   answer.sections.push(active);latest=null;continue;
  }
  if(line.startsWith('**الطرف:** ')||line.startsWith('**Party:** ')){
   answer.party=clean(line.split(':').slice(1).join(':'));
   continue;
  }
  if(line.startsWith('- **')){
   const data=fact(line);
   if(data){(active?.facts||answer.intro).push(data);latest=null;continue;}
   const match=line.match(/^-\s+\*\*(.+?)\*\*\s*·\s*(.*?)\s*·\s*(.*)$/);
   if(match&&active){
    latest={kind:'movement',label:clean(match[1]||''),date:clean(match[2]||''),reference:clean(match[3]||''),amount:'',balance:''};
    active.movements.push(latest);continue;
   }
  }
  if(latest&&(line.includes('Balance after:')||line.includes('الرصيد بعد الحركة:'))){
   const segments=line.split(/\s*·\s*/);
   latest.amount=clean(segments[0]||'');
   latest.balance=clean(segments.slice(1).join(' · '));
   latest=null;continue;
  }
  if(active)active.notes.push(clean(line));
  else answer.intro.push({label:'',value:clean(line)});
 }
 for(const line of (start>=0?lines.slice(start+1,stop):[])){
  const text=line.trim();if(!text)continue;
  if(text.startsWith('- '))answer.items.push(clean(text.slice(2)));
  else if(text.includes('جزئية')||/partial|incomplete/i.test(text))answer.partial=true;
  else answer.items.push(clean(text));
 }
 if(answer.items.length>20)return null;
 return answer;
}


/** Immutable, bounded financial snapshot, derived directly from read tool data.
 * No arithmetic, provider rewriting, markdown parsing, or database writes. */
const rd=(v:unknown,n=150)=>typeof v==='string'||typeof v==='number'
 ?String(v).replace(/[\u0000-\u001f\u007f\u2066-\u2069<>]/g,' ').trim().slice(0,n):'';
const ro=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
const ra=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const money=(value:unknown,currency:unknown)=>[rd(value,45),rd(currency,8)].filter(Boolean).join(' ');
export const FINANCIAL_SNAPSHOT_MAX_BYTES=10000;

/** Normalize untrusted persisted records; reject oversized and executable shapes. */
export function normalizeFinancialReadout(value:unknown):FinancialReadout|null{
 const o=ro(value);if(!o||typeof o.title!=='string'||!o.title||o.title.length>180||
 typeof o.party!=='string'||o.party.length>180||typeof o.itemsTitle!=='string'||o.itemsTitle.length>160||
 typeof o.partial!=='boolean'||!Array.isArray(o.intro)||o.intro.length>12||
 !Array.isArray(o.sections)||o.sections.length>5||!Array.isArray(o.items)||o.items.length>20)return null;
 const getFacts=(v:unknown):FinancialFact[]|null=>{
  if(!Array.isArray(v)||v.length>12)return null;
  const out:FinancialFact[]=[];
  for(const x of v){const f=ro(x);if(!f||typeof f.label!=='string'||f.label.length>100||
   typeof f.value!=='string'||f.value.length>180)return null;out.push({label:f.label,value:f.value});}
  return out;
 };
 const intro=getFacts(o.intro);if(!intro)return null;
 const sections:FinancialSection[]=[];
 for(const raw of o.sections){
  const s=ro(raw),facts=getFacts(s?.facts);
  if(!s||!facts||typeof s.title!=='string'||s.title.length>120||
   !Array.isArray(s.movements)||s.movements.length>12||!Array.isArray(s.notes)||s.notes.length>8)return null;
  const movements:FinancialMovement[]=[];
  for(const raw of s.movements){
   const m=ro(raw);if(!m||m.kind!=='movement'||['label','date','reference','amount','balance']
    .some(k=>typeof m[k]!=='string'||(m[k] as string).length>180))return null;
   movements.push({kind:'movement',label:m.label as string,date:m.date as string,reference:m.reference as string,amount:m.amount as string,balance:m.balance as string});
  }
  if(s.notes.some(x=>typeof x!=='string'||x.length>180))return null;
  sections.push({title:s.title,facts,movements,notes:[...s.notes] as string[]});
 }
 if(o.items.some(x=>typeof x!=='string'||x.length>180))return null;
 const result:FinancialReadout={title:o.title,party:o.party,intro,sections,
  itemsTitle:o.itemsTitle,items:[...o.items] as string[],partial:o.partial};
 return new TextEncoder().encode(JSON.stringify(result)).length<=FINANCIAL_SNAPSHOT_MAX_BYTES?result:null;
}
/** Only allow recorded, read-only document/customer tool results in the selected scope. */
export function financialReadoutFromToolRows(value:unknown,language:'ar'|'en'):FinancialReadout|null{
 const source=ro(value),rows=ra(source?.results),allowed=['document.get','customer.getSummary','customer.getHistory'];
 if(!rows.length||rows.some(x=>{const r=ro(x);return !r||!allowed.includes(String(r.tool))||(r.class!==undefined&&r.class!=='read');}))return null;
 const get=(tool:string)=>ro(rows.map(ro).find(r=>r?.tool===tool&&r.ok===true)?.data);
 const doc=get('document.get'),customer=get('customer.getSummary'),history=get('customer.getHistory');
 if(!doc&&!customer&&!history)return null;
 const ar=language==='ar',l=(en:string,arabic:string)=>ar?arabic:en;
 const intro:FinancialFact[]=[],sections:FinancialSection[]=[];
 const fact=(dest:FinancialFact[],name:string,value:unknown,cur?:unknown)=>{
  if(value!==null&&value!==undefined&&value!=='')dest.push({label:name,value:cur?money(value,cur):rd(value,100)});
 };
 if(doc){
  fact(intro,l('Issue date','تاريخ الإصدار'),doc.issueDate);
  fact(intro,l('Status','الحالة'),doc.status==='final'?l('Issued','صادرة'):doc.status==='draft'?l('Draft','مسودة'):doc.status);
  fact(intro,doc.kind==='proforma'?l('Valid until','انتهاء الصلاحية'):l('Due date','تاريخ الاستحقاق'),doc.dueDate);
  const totals=ro(doc.totals),facts:FinancialFact[]=[];
  if(totals&&doc.truncated!==true){
   const labels:[string,string,string][]=[['subtotal','Subtotal','الإجمالي قبل الرسوم'],['discount','Discount','الخصم'],
    ['shipping','Shipping','الشحن'],['otherCharges','Other charges','رسوم إضافية'],
    ['tax','Tax','الضريبة'],['grandTotal','Grand total','الإجمالي النهائي']];
   for(const [key,en,arabic] of labels)fact(facts,l(en,arabic),totals[key],doc.currency);
   if(facts.length)sections.push({title:l('Financial values','القيم المالية'),facts,movements:[],notes:[]});
  }
 }
 if(customer){
  const receivables=ra(customer.receivables),facts:FinancialFact[]=[];
  for(const item of receivables.slice(0,3)){
   const row=ro(item);if(!row)continue;
   fact(facts,l('Billed','إجمالي الفواتير'),row.billed,row.currency);
   fact(facts,l('Collected','المبالغ المحصلة'),row.paid,row.currency);
   fact(facts,l('Outstanding','الرصيد المتبقي'),row.outstanding,row.currency);
  }
  if(facts.length)sections.push({title:l('Receivables and collections','المستحقات والتحصيلات'),facts,movements:[],
   notes:receivables.length>3?[l('Additional currencies omitted.','توجد عملات إضافية غير معروضة.')]:[]});
 }
 if(history){
  const statements=ra(history.statements),movements:FinancialMovement[]=[],notes:string[]=[];
  if(history.truncated===true)notes.push(l('The statement is incomplete.','كشف العميل غير مكتمل.'));
  for(const value of statements.slice(0,3)){
   const statement=ro(value);if(!statement)continue;
   const entries=ra(statement.entries);
   for(const item of entries.slice(0,10)){
    const e=ro(item);if(!e)continue;
    const name=e.type==='invoice'?l('Invoice','فاتورة'):e.type==='payment'?l('Payment','تحصيل'):e.type==='credit-note'?l('Credit note','إشعار دائن'):l('Entry','حركة');
    movements.push({kind:'movement',label:name,date:rd(e.date,40),reference:rd(e.reference,130),
     amount:l('Amount','المبلغ')+': '+money(e.type==='invoice'?e.debit:e.credit,statement.currency),
     balance:l('Balance after','الرصيد بعد الحركة')+': '+money(e.balance,statement.currency)});
   }
   if(entries.length>10)notes.push(l('Only ten returned entries displayed.','تُعرض عشر حركات من السجل المتاح فقط.'));
  }
  if(statements.length>3)notes.push(l('Additional statements omitted.','توجد كشوف بعملات أخرى غير معروضة.'));
  if(movements.length>12)notes.push(l('Only twelve retrieved movements are shown; more exist.','تُعرض اثنتا عشرة حركة فقط من الحركات المسترجعة، وتوجد حركات إضافية.'));
  if(movements.length||notes.length)sections.push({title:l('Recorded account movements','حركات الحساب المسجلة'),
   facts:[],movements:movements.slice(0,12),notes});
 }
 const rawItems=ra(doc?.items),count=Number(doc?.itemCount)||rawItems.length;
 const items=rawItems.slice(0,20).map((value,i)=>{
  const x=ro(value);if(!x)return '';
  return String(i+1)+'. '+rd((ar?x.descriptionAr||x.descriptionEn:x.descriptionEn||x.descriptionAr)||x.sku,80)+
   ' — '+l('Qty','الكمية')+' '+rd(x.quantity,20)+' · '+l('Unit','الوحدة')+' '+rd(x.unit,20)+
   ' · '+l('Unit price','سعر الوحدة')+' '+money(x.unitPrice,doc?.currency);
 }).filter(Boolean);
 const documentTitle=doc?.kind==='invoice'?l('Invoice','فاتورة'):doc?.kind==='proforma'?l('Quotation','عرض سعر'):l('Document','مستند');
 const model:FinancialReadout={title:doc?documentTitle+' '+rd(doc.number,100):
  l('Customer account','حساب العميل')+' · '+rd(customer?.name||history?.name,100),
  party:rd(doc?.customerName||doc?.supplierName),intro,sections,itemsTitle:'',
  items,partial:Boolean(doc?.itemsTruncated||doc?.truncated||count>items.length)};
 if(!doc&&!customer?.name&&!history?.name)return null;
 const itemTitle=()=>l('Document items','أصناف المستند')+' ('+model.items.length+'/'+count+')';
 if(model.items.length)model.itemsTitle=itemTitle();
 while(model.items.length&&!normalizeFinancialReadout(model)){
  model.items.pop();model.partial=true;model.itemsTitle=itemTitle();
 }
 return normalizeFinancialReadout(model);
}
