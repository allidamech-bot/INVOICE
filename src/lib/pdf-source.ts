import { t } from './i18n.js';
// Read selectable PDF text locally. Image-only PDFs keep the native AI route.
export async function readablePdfText(file:File,maxChars=120000):Promise<string>{
  const url=new URL('../../vendor/pdf.mjs',import.meta.url).href;
  const pdfjs=await import(url);
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  task.onPassword=()=>{void task.destroy();};
  let pdf:any;
  try{
    pdf=await task.promise;
    if(pdf.numPages>40)throw new Error(t('PDF exceeds the 40-page analysis limit.','ملف PDF يتجاوز حد التحليل البالغ 40 صفحة.'));
    const pages:string[]=[];let chars=0;
    for(let index=1;index<=pdf.numPages;index++){
      const page=await pdf.getPage(index),content=await page.getTextContent();
      const text=content.items.map((item:any)=>typeof item.str==='string'?item.str+(item.hasEOL?'\n':' '):'').join('');
      chars+=text.length;if(chars>maxChars)throw new Error(t('PDF text exceeds the analysis limit. Split the source into smaller files.','نص PDF يتجاوز حد التحليل. قسّم المصدر إلى ملفات أصغر.'));
      page.cleanup();
      // A mixed scanned/text PDF must retain every page through the vision route.
      if(!text.trim())return '';
      pages.push(`Page ${index}\n${text}`);
    }
    return pages.some(text=>text.replace(/Page \d+/, '').trim())?pages.join('\n\n'):'';
  }finally{if(pdf)await pdf.destroy();else await task.destroy();}
}
