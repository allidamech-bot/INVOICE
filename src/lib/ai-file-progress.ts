export interface FileProgressRow {
 id:string;status:'ready'|'processing'|'done'|'error';phase?:string;
 source?:{quoteSheetCandidate?:string;documentType?:string;extracted?:string}|null;
}
const fileCount=(row:FileProgressRow):number|null=>{
  // Only direct named-column spreadsheet parsing has a verifiable COMPLETE
  // source-row count. Model summaries are not proof that every row was found.
  const evidence=row.source?.quoteSheetCandidate;
  if(!evidence||evidence.length>160_000)return null;
  try{
    const value=JSON.parse(evidence);
    const count=value?.sourceRowCount;
    return value.parser==='exact-spreadsheet-columns'&&
      Number.isInteger(count)&&count>0&&count<=120&&
      Array.isArray(value.items)&&value.items.length===count?count:null;
  }catch{return null;}
};
/** Visible stage reflects only confirmed work, never simulated token streaming. */
export function fileProgressLabel(
 rows:FileProgressRow[],row:FileProgressRow,ar:boolean
):string{
 const pos=rows.findIndex(item=>item.id===row.id);
 const index=pos<0?'?':String(pos+1);
 const prefix=rows.length>1?(ar?'الملف '+index+'/'+rows.length+' · ':'File '+index+'/'+rows.length+' · '):'';
 if(row.status==='error')return prefix+(ar?'تعذر استخراج هذا الملف':'This file needs review');
 if(row.status==='done'){
   if(row.source?.documentType==='original-text')return prefix+(ar?'قُرئ النص محليًا · تعذّر تحليل AI · راجع المصدر':'Local text retained · AI analysis unavailable · review source');
   const count=fileCount(row);
   if(count!==null)return prefix+(ar?'اكتمل استخراج '+count+' صنفًا · راجع البيانات':'Extracted '+count+' complete source rows · review');
   return prefix+(ar?'تم التحليل · راجع البيانات قبل الحفظ':'Analysis complete · review before saving');
 }
 if(row.status==='ready')return prefix+(ar?'جاهز للتحليل':'Ready for analysis');
 const phases:{[key:string]:[string,string]}={
   reading:['جارٍ قراءة الملف','Reading file'],
   classifying:['جارٍ تحديد نوع المستند','Identifying document'],
   extracting:['جارٍ استخراج البيانات','Extracting source facts'],
   fallback:['جارٍ تجربة قارئ بديل','Trying alternative reader'],
 };
 const value=phases[row.phase||''];
 return prefix+(value?value[ar?0:1]:(ar?'جارٍ المعالجة':'Processing'));
}
