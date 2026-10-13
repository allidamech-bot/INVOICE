/** Source-derived, truthful extraction progress for the conversation chips.
 * Counts describe completed local work only; neither model thinking nor
 * unverified OCR row totals are presented as confirmed business records. */
export type SourceProgressStatus='ready'|'processing'|'done'|'error';
export interface SourceProgressRow {status:SourceProgressStatus;phase?:string;source?:{extracted?:string;quoteSheetCandidate?:string}|null;}
export function attachmentProgressSummary(rows:readonly SourceProgressRow[]):{total:number;done:number;processing:number;failed:number}{
 return{total:rows.length,
   done:rows.filter(row=>row.status==='done').length,
   processing:rows.filter(row=>row.status==='processing').length,
   failed:rows.filter(row=>row.status==='error').length};
}
export function attachmentRowCountEvidence(source:SourceProgressRow['source']):{count:number;verified:boolean}|null{
 if(!source)return null;
 const exact=typeof source.quoteSheetCandidate==='string'&&source.quoteSheetCandidate.length>0;
 const raw=exact?source.quoteSheetCandidate:source.extracted;
 if(!raw||raw.length>120_000)return null;
 try{
   const object=JSON.parse(raw) as {items?:unknown;products?:unknown;sourceRowCount?:unknown;parser?:unknown};
   const items=Array.isArray(object.items)?object.items:Array.isArray(object.products)?object.products:null;
   if(!items||items.length<1||items.length>120)return null;
   const verified=object.parser==='exact-spreadsheet-columns'&&Number.isInteger(object.sourceRowCount)&&object.sourceRowCount===items.length;
   return{count:items.length,verified};
 }catch{return null;}
}
