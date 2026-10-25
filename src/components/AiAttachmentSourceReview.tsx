// Cached extraction evidence only. Opening this disclosure never reclassifies
// files, calls a provider, stages an import or grants save authority.
export function renderAttachmentSourceReview(source:any,ar:boolean):any{
  const label=(en:string,arabic:string)=>ar?arabic:en;
  const missing=label('Not provided','غير مذكور');
  const text=(value:any)=>value===undefined||value===null||value===''?missing:typeof value==='object'?JSON.stringify(value):String(value);
  const raw=typeof source?.extracted==='string'?source.extracted:'';
  let data:any;try{data=JSON.parse(raw);}catch{data=null;}
  const rows=Array.isArray(data?.items)?data.items:null;
  const headers=[label('SKU','رمز الصنف'),label('Description','الوصف'),label('Quantity','الكمية'),label('Unit','الوحدة'),label('Unit price','سعر الوحدة')];
  const fields=[['customerName','Customer','العميل'],['currency','Currency','العملة'],['deliveryTime','Delivery','التسليم'],['paymentTerms','Payment terms','شروط الدفع']];
  return <details className="lxw-attachment-source-review">
    <summary>{label('Review extracted data','مراجعة البيانات المستخرجة')}</summary>
    <section aria-label={label('Cached attachment evidence','بيانات المرفق المستخرجة')} dir={ar?'rtl':'ltr'}>
      <strong>{text(source?.fileName)}</strong>
      <p>{label('Extracted evidence needs review. This is not a complete or approved document.','البيانات المستخرجة تحتاج مراجعة؛ ليست مستندًا مكتملًا أو معتمدًا.')}</p>
      {data&&fields.some(([key])=>data[key!])?<dl>{fields.filter(([key])=>data[key!]).map(([key,en,arabic])=><div key={key}><dt>{label(en!,arabic!)}</dt><dd dir="auto">{text(data[key!])}</dd></div>)}</dl>:null}
      {rows?<><p>{label('Extracted rows','الصفوف المستخرجة')}: {rows.length}</p><div className="lxw-response-table" tabIndex={0} role="region" aria-label={label('Extracted source rows','صفوف المصدر المستخرجة')}><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row:any,i:number)=><tr key={i}>{[row?.sku,row?.descriptionAr||row?.descriptionEn,row?.quantity,row?.unit,row?.unitPrice].map((value,j)=><td key={j} dir="auto">{text(value)}</td>)}</tr>)}</tbody></table></div></>:null}
      <details><summary>{label('All extracted fields','جميع الحقول المستخرجة')}</summary><pre dir="auto">{data?JSON.stringify(data,null,2):raw}</pre></details>
    </section>
  </details>;
}
