/** Decode iPhone HEIC/HEIF photos locally where WebKit supports them.
 * Only JPEG leaves the browser for AI extraction. No silent partial fallback. */
export const AI_IPHONE_IMAGE_MAX_BYTES=2_600_000;
const MAX_INPUT_HEIC_BYTES=16_000_000;

type PhotoIdentity=Pick<File,'name'|'type'>;
export function isIphoneHeicPhoto(file:PhotoIdentity):boolean{
  return /\.(?:heic|heif)$/i.test(String(file.name||''))||
    /^(?:image\/heic|image\/heif|image\/heic-sequence|image\/heif-sequence)$/i.test(String(file.type||''));
}
function abortIfNeeded(signal?:AbortSignal):void{
  if(signal?.aborted)throw new DOMException('Photo conversion cancelled.','AbortError');
}
function jpegBlob(canvas:HTMLCanvasElement,quality:number):Promise<Blob>{
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?.type==='image/jpeg'&&blob.size?resolve(blob):reject(new Error('The browser could not create a JPEG version of this iPhone photo.')),'image/jpeg',quality);
  });
}
async function decodePhoto(file:File):Promise<{image:CanvasImageSource;width:number;height:number;close:()=>void}>{
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file);
      if(bitmap.width>0&&bitmap.height>0)return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close()};
      bitmap.close();
    }catch{ /* Safari may decode via an HTML image even if ImageBitmap rejects HEIC. */ }
  }
  if(typeof Image==='undefined'||typeof URL==='undefined'||!URL.createObjectURL)
    throw new Error('HEIC decoding is not supported in this browser. Export the photo as JPEG from Photos and select it again.');
  const url=URL.createObjectURL(file);
  try{
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
      const img=new Image();
      img.onload=()=>resolve(img);
      img.onerror=()=>reject(new Error('HEIC decoding is not supported in this browser. Export the photo as JPEG from Photos and select it again.'));
      img.src=url;
    });
    return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>{image.src='';}};
  }finally{URL.revokeObjectURL(url);}
}
/** Preserve original filename separately in the per-source evidence UI.
 * Returned File is suitable for the existing JPEG-only API. */
export async function jpegFromIphonePhoto(file:File,signal?:AbortSignal):Promise<File>{
  if(!isIphoneHeicPhoto(file))return file;
  abortIfNeeded(signal);
  if(!file.size||file.size>MAX_INPUT_HEIC_BYTES)
    throw new Error('This iPhone photo must be nonempty and at most 16 MB.');
  const decoded=await decodePhoto(file);
  try{
    abortIfNeeded(signal);
    if(!decoded.width||!decoded.height||decoded.width>16000||decoded.height>16000)
      throw new Error('The photo dimensions are invalid or too large for safe AI conversion.');
    const canvas=document.createElement('canvas');
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Photo conversion is unavailable on this device.');
    let maxSide=2600;
    for(let attempt=0;attempt<5;attempt++){
      abortIfNeeded(signal);
      const ratio=Math.min(1,maxSide/Math.max(decoded.width,decoded.height));
      canvas.width=Math.max(1,Math.round(decoded.width*ratio));
      canvas.height=Math.max(1,Math.round(decoded.height*ratio));
      context.fillStyle='#ffffff';
      context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(decoded.image,0,0,canvas.width,canvas.height);
      const blob=await jpegBlob(canvas,0.88);
      abortIfNeeded(signal);
      if(blob.size<=AI_IPHONE_IMAGE_MAX_BYTES){
        const header=new Uint8Array(await blob.slice(0,3).arrayBuffer());
        if(header[0]!==255||header[1]!==216||header[2]!==255)
          throw new Error('The converted image is not a valid JPEG. Nothing was analyzed.');
        const name=file.name.replace(/\.(?:heic|heif)$/i,'')||'iPhone-photo';
        return new File([blob],name+'.jpg',{type:'image/jpeg',lastModified:file.lastModified});
      }
      maxSide=Math.floor(maxSide*0.8);
    }
    throw new Error('This HEIC photo remains too large after safe conversion. Export a smaller JPEG and retry.');
  }finally{decoded.close();}
}
