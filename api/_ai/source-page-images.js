/**
 * Multi-page OCR evidence is DATA, not instructions. Every page must be valid
 * and ordered; an invalid/oversized page aborts the entire source. The server
 * never silently keeps just the first page or creates a saved record here.
 */
export const MAX_VISION_PDF_PAGES=3;
export const MAX_VISION_PDF_BASE64_CHARS=2_600_000;
export function cleanVisionPageAttachments(body){
  if(body?.kind!=='pages')return null;
  const pages=body.pages;
  if(!Array.isArray(pages)||!pages.length||pages.length>MAX_VISION_PDF_PAGES)return null;
  const filename=String(body.fileName||'Scanned PDF').slice(0,120);
  let total=0;
  const attachments=[];
  for(let index=0;index<pages.length;index++){
    const row=pages[index];
    if(!row||typeof row!=='object'||Array.isArray(row)||row.mimeType!=='image/jpeg'||typeof row.data!=='string'||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(row.data))return null;
    if(row.data.length<80||row.data.length>1_200_000)return null;
    if(row.index!==index+1||row.pageCount!==pages.length)return null;
    total+=row.data.length;
    if(total>MAX_VISION_PDF_BASE64_CHARS)return null;
    attachments.push({kind:'image',mimeType:'image/jpeg',data:row.data,
      fileName:filename+' (page '+(index+1)+' of '+pages.length+')'});
  }
  return attachments;
}
