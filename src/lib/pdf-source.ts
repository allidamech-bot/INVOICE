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

/** Browser-only raster fallback for short image-only PDFs. Each page remains a
 * distinct image in source order; never export partial page sets. PDFs longer
 * than 3 pages stay on the native-document path instead of dropping pages. */
export async function rasterScannedPdfPages(file:File,signal?:AbortSignal):Promise<Blob[]|null>{
  const url=new URL('../../vendor/pdf.mjs',import.meta.url).href;
  const pdfjs=await import(url);
  pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../vendor/pdf.worker.mjs',import.meta.url).href;
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});
  task.onPassword=()=>{void task.destroy();};
  let pdf:any;
  try{
    pdf=await task.promise;
    if(pdf.numPages<1)throw new Error('Scanned PDF contains no pages.');
    if(pdf.numPages>3)return null; // preserve every page via the existing native PDF route
    const blobs:Blob[]=[];
    for(let index=1;index<=pdf.numPages;index++){
      if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
      const page=await pdf.getPage(index);
      const initial=page.getViewport({scale:1});
      const scale=Math.min(2,1200/initial.width,1650/initial.height);
      const viewport=page.getViewport({scale});
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.ceil(viewport.width));
      canvas.height=Math.max(1,Math.ceil(viewport.height));
      const context=canvas.getContext('2d',{alpha:false});
      if(!context)throw new Error('Canvas rendering is unavailable for PDF OCR.');
      try{
        context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
        await page.render({canvasContext:context,viewport,canvas}).promise;
        const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.68));
        if(!blob||blob.type!=='image/jpeg'||blob.size<64||blob.size>900_000)
          throw new Error('PDF OCR page image is unreadable or too large. Export a clearer, smaller PDF.');
        blobs.push(blob);
      }finally{canvas.width=1;canvas.height=1;page.cleanup();}
    }
    if(blobs.length!==pdf.numPages)throw new Error('Not every scanned PDF page was rendered. No draft prepared.');
    return blobs;
  }finally{if(pdf)await pdf.destroy();else await task.destroy();}
}
