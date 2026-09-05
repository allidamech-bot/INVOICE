import { t } from './i18n.js';

function clamp(value:number,minimum:number,maximum:number):number{return Math.max(minimum,Math.min(maximum,value));}
function luma(red:number,green:number,blue:number):number{return red*.2126+green*.7152+blue*.0722;}
function saturation(red:number,green:number,blue:number):number{const maximum=Math.max(red,green,blue),minimum=Math.min(red,green,blue);return maximum<=0?0:(maximum-minimum)/maximum;}

interface Component{label:number;pixels:number;left:number;top:number;right:number;bottom:number;}

function dilate(mask:Uint8Array,width:number,height:number,iterations:number):Uint8Array{
  let current=mask;const total=width*height;
  for(let iteration=0;iteration<iterations;iteration+=1){
    const next=new Uint8Array(current);
    for(let pixel=0;pixel<total;pixel+=1){
      if(!(current[pixel]??0))continue;const x=pixel%width,y=Math.floor(pixel/width);
      if(x>0)next[pixel-1]=1;if(x+1<width)next[pixel+1]=1;if(y>0)next[pixel-width]=1;if(y+1<height)next[pixel+width]=1;
      if(x>0&&y>0)next[pixel-width-1]=1;if(x+1<width&&y>0)next[pixel-width+1]=1;if(x>0&&y+1<height)next[pixel+width-1]=1;if(x+1<width&&y+1<height)next[pixel+width+1]=1;
    }
    current=next;
  }
  return current;
}

function label(mask:Uint8Array,width:number,height:number):{labels:Int32Array;components:Component[]}{
  const total=width*height,labels=new Int32Array(total),queue=new Int32Array(total),components:Component[]=[];labels.fill(-1);let nextLabel=0;
  for(let seed=0;seed<total;seed+=1){
    if(!(mask[seed]??0)||(labels[seed]??-1)>=0)continue;
    let start=0,end=0,pixels=0,left=width,top=height,right=-1,bottom=-1;labels[seed]=nextLabel;queue[end++]=seed;
    while(start<end){
      const pixel=queue[start++]??0,x=pixel%width,y=Math.floor(pixel/width);pixels+=1;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      const visit=(neighbor:number)=>{if(neighbor<0||neighbor>=total||!(mask[neighbor]??0)||(labels[neighbor]??-1)>=0)return;labels[neighbor]=nextLabel;queue[end++]=neighbor;};
      if(x>0)visit(pixel-1);if(x+1<width)visit(pixel+1);if(y>0)visit(pixel-width);if(y+1<height)visit(pixel+width);
    }
    components.push({label:nextLabel,pixels,left,top,right,bottom});nextLabel+=1;
  }
  return {labels,components};
}

function isColourCore(data:Uint8ClampedArray,pixel:number):boolean{
  const index=pixel*4,alpha=data[index+3]??0;if(alpha<=20)return false;
  const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0,maximum=Math.max(red,green,blue),minimum=Math.min(red,green,blue);
  return saturation(red,green,blue)>=.17&&(maximum-minimum)>=24&&maximum>=42;
}

/**
 * Isolate central logo subject. This is deliberately different from ordinary
 * background-colour removal: it finds a confident central coloured subject,
 * builds a silhouette around that subject, preserves close dark outlines and
 * thin nearby wordmarks, and removes everything else. This directly handles
 * scanned logos where a broad black/gray slab touches the artwork.
 */
export function rebuildLogoTransparentPixels(data:Uint8ClampedArray,width:number,height:number):boolean{
  if(width<2||height<2||data.length<width*height*4)return false;
  const total=width*height,colourCore=new Uint8Array(total);let allSeeds=0;
  for(let pixel=0;pixel<total;pixel+=1){if(isColourCore(data,pixel)){colourCore[pixel]=1;allSeeds+=1;}}
  if(allSeeds<Math.max(28,Math.round(total*.00022)))return false;

  const joinRadius=clamp(Math.round(Math.min(width,height)*.012),1,4);
  const joined=dilate(colourCore,width,height,joinRadius);
  const joinedInfo=label(joined,width,height);
  const seedsByLabel=new Int32Array(joinedInfo.components.length);
  for(let pixel=0;pixel<total;pixel+=1){if(colourCore[pixel]){const id=joinedInfo.labels[pixel]??-1;if(id>=0)seedsByLabel[id]=(seedsByLabel[id]??0)+1;}}

  const centerX=(width-1)/2,centerY=(height-1)/2;let selected:Component|null=null,selectedSeeds=0,bestScore=-Infinity;
  for(const component of joinedInfo.components){
    const seeds=seedsByLabel[component.label]??0;if(seeds<=0)continue;
    const cx=(component.left+component.right)/2,cy=(component.top+component.bottom)/2;
    const distance=Math.hypot((cx-centerX)/Math.max(1,width),(cy-centerY)/Math.max(1,height));
    const centerWeight=clamp(1.18-distance,.56,1.18),score=seeds*centerWeight;
    if(score>bestScore){bestScore=score;selected=component;selectedSeeds=seeds;}
  }
  if(!selected||selectedSeeds<allSeeds*.58)return false;

  const selectedCore=new Uint8Array(total);let seeds=0,left=width,top=height,right=-1,bottom=-1;
  const rowLeft=new Int32Array(height),rowRight=new Int32Array(height),colTop=new Int32Array(width),colBottom=new Int32Array(width);
  rowLeft.fill(width);rowRight.fill(-1);colTop.fill(height);colBottom.fill(-1);
  for(let pixel=0;pixel<total;pixel+=1){
    if(!colourCore[pixel]||(joinedInfo.labels[pixel]??-1)!==selected.label)continue;
    selectedCore[pixel]=1;seeds+=1;const x=pixel%width,y=Math.floor(pixel/width);
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    rowLeft[y]=Math.min(rowLeft[y]??width,x);rowRight[y]=Math.max(rowRight[y]??-1,x);colTop[x]=Math.min(colTop[x]??height,y);colBottom[x]=Math.max(colBottom[x]??-1,y);
  }
  if(seeds<Math.max(24,Math.round(total*.0002))||right<left||bottom<top)return false;

  const coreWidth=right-left+1,coreHeight=bottom-top+1,coreMin=Math.max(1,Math.min(coreWidth,coreHeight)),coreMax=Math.max(coreWidth,coreHeight);
  const envelope=new Uint8Array(total);
  for(let y=top;y<=bottom;y+=1){
    if((rowRight[y]??-1)<(rowLeft[y]??width))continue;
    for(let x=left;x<=right;x+=1){
      if((colBottom[x]??-1)<(colTop[x]??height))continue;
      if(x<(rowLeft[y]??width)||x>(rowRight[y]??-1)||y<(colTop[x]??height)||y>(colBottom[x]??-1))continue;
      envelope[y*width+x]=1;
    }
  }
  for(let pixel=0;pixel<total;pixel+=1)if(selectedCore[pixel])envelope[pixel]=1;

  const outlineRadius=clamp(Math.round(coreMin*.055),3,18);
  const keep=dilate(envelope,width,height,outlineRadius);

  // Keep thin dark typography/outline components close to the selected subject.
  const darkMask=new Uint8Array(total),proximity=clamp(Math.round(coreMax*.46),10,120);
  for(let pixel=0;pixel<total;pixel+=1){
    if(keep[pixel])continue;const index=pixel*4,alpha=data[index+3]??0;if(alpha<=20)continue;
    const x=pixel%width,y=Math.floor(pixel/width);if(x<left-proximity||x>right+proximity||y<top-proximity||y>bottom+proximity)continue;
    const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0;
    if(saturation(red,green,blue)<=.30&&luma(red,green,blue)<=175)darkMask[pixel]=1;
  }
  const darkInfo=label(darkMask,width,height),preserveLabels=new Set<number>();
  for(const component of darkInfo.components){
    const componentWidth=component.right-component.left+1,componentHeight=component.bottom-component.top+1;
    const minimum=Math.max(1,Math.min(componentWidth,componentHeight)),maximum=Math.max(componentWidth,componentHeight),aspect=maximum/minimum,fill=component.pixels/Math.max(1,componentWidth*componentHeight);
    const thin=minimum<=Math.max(3,Math.round(coreMin*.055))&&aspect>=2.1;
    const tiny=component.pixels<=Math.max(22,Math.round(total*.00035))&&minimum<=Math.max(5,Math.round(coreMin*.06));
    if(thin||(tiny&&fill<=.9))preserveLabels.add(component.label);
  }

  let removed=0,kept=0;
  for(let pixel=0;pixel<total;pixel+=1){
    const index=pixel*4,alpha=data[index+3]??0;if(alpha<=0)continue;
    if(keep[pixel]||preserveLabels.has(darkInfo.labels[pixel]??-1)){kept+=1;continue;}
    data[index+3]=0;removed+=1;
  }
  return removed>0&&kept>=Math.max(20,Math.round(seeds*.78));
}

function loadImage(src:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(t('Unable to open logo image.','تعذر فتح صورة الشعار.')));image.src=src;
  });
}

function hasVisiblePixels(pixels:ImageData):boolean{for(let index=3;index<pixels.data.length;index+=4)if((pixels.data[index]??0)>12)return true;return false;}

function crop(canvas:HTMLCanvasElement,pixels:ImageData):string{
  const width=canvas.width,height=canvas.height;let left=width,top=height,right=-1,bottom=-1;
  for(let index=0;index<pixels.data.length;index+=4){if((pixels.data[index+3]??0)<=12)continue;const pixel=Math.floor(index/4),x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left||bottom<top)return canvas.toDataURL('image/png');
  const padding=Math.max(6,Math.round(Math.min(width,height)*.02));
  const cropLeft=Math.max(0,left-padding),cropTop=Math.max(0,top-padding),cropRight=Math.min(width-1,right+padding),cropBottom=Math.min(height-1,bottom+padding),cropWidth=cropRight-cropLeft+1,cropHeight=cropBottom-cropTop+1;
  if(cropWidth===width&&cropHeight===height)return canvas.toDataURL('image/png');
  const output=document.createElement('canvas');output.width=cropWidth;output.height=cropHeight;const context=output.getContext('2d');if(!context)return canvas.toDataURL('image/png');
  context.clearRect(0,0,cropWidth,cropHeight);context.drawImage(canvas,cropLeft,cropTop,cropWidth,cropHeight,0,0,cropWidth,cropHeight);return output.toDataURL('image/png');
}

function button(labelText:string,className:string):HTMLButtonElement{const element=document.createElement('button');element.type='button';element.className=className;element.textContent=labelText;return element;}
function paragraph(text:string,className:string):HTMLParagraphElement{const element=document.createElement('p');element.className=className;element.textContent=text;return element;}
function span(text:string,className:string):HTMLSpanElement{const element=document.createElement('span');element.className=className;element.textContent=text;return element;}

async function openManualBackgroundEditor(src:string):Promise<string>{
  const image=await loadImage(src),naturalWidth=image.naturalWidth||image.width,naturalHeight=image.naturalHeight||image.height;if(!naturalWidth||!naturalHeight)return src;

  const maxDimension=1024,scale=Math.min(1,maxDimension/Math.max(naturalWidth,naturalHeight));
  const width=Math.max(1,Math.round(naturalWidth*scale)),height=Math.max(1,Math.round(naturalHeight*scale)),pixelCount=width*height;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.className='logo-touch-editor-canvas';
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return src;
  context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);

  const rawOriginal=context.getImageData(0,0,width,height);
  const prepared=new ImageData(new Uint8ClampedArray(rawOriginal.data),width,height);
  // Isolate central logo subject before manual cleanup. This removes broad dark
  // slabs/specks outside the actual coloured artwork even when they touch it.
  const subjectIsolated=rebuildLogoTransparentPixels(prepared.data,width,height);
  if(subjectIsolated)context.putImageData(prepared,0,0);
  const original=context.getImageData(0,0,width,height),history:ImageData[]=[];
  const historyLimit=pixelCount>750_000?4:pixelCount>400_000?6:8;
  if(subjectIsolated)history.push(rawOriginal);
  let tool:'tap'|'erase'='tap',tolerance=42,brush=28,drawing=false,settled=false;

  const overlay=document.createElement('div');overlay.className='logo-touch-editor-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',t('Logo background editor','محرر خلفية الشعار'));
  const sheet=document.createElement('div');sheet.className='logo-touch-editor-sheet';overlay.appendChild(sheet);
  const header=document.createElement('header'),heading=document.createElement('div');heading.className='logo-touch-editor-heading';
  const title=document.createElement('strong');title.textContent=t('Remove logo background','إزالة خلفية الشعار');
  heading.append(title,span(t('The logo subject is isolated first. Tap or erase only if a small residue remains.','يتم عزل جسم الشعار أولًا. استخدم اللمس أو الممحاة فقط إذا بقيت بقايا صغيرة.'),'logo-touch-editor-subtitle'));
  const closeButton=button('×','logo-touch-editor-close');closeButton.setAttribute('aria-label',t('Close','إغلاق'));header.append(heading,closeButton);sheet.appendChild(header);
  const canvasWrap=document.createElement('div');canvasWrap.className='logo-touch-editor-canvas-wrap';canvasWrap.appendChild(canvas);sheet.appendChild(canvasWrap);

  const controls=document.createElement('div');controls.className='logo-touch-editor-controls';
  const switcher=document.createElement('div');switcher.className='logo-touch-editor-switch';
  const tapButton=button(t('Tap area','لمس المنطقة'),'active'),eraseButton=button(t('Eraser','ممحاة'),'');switcher.append(tapButton,eraseButton);controls.appendChild(switcher);
  const sliderRow=document.createElement('label');sliderRow.className='logo-touch-editor-slider';
  const sliderText=span(`${t('Color tolerance','حساسية اللون')}: ${tolerance}`,'');
  const slider=document.createElement('input');slider.type='range';slider.min='8';slider.max='90';slider.step='1';slider.value=String(tolerance);sliderRow.append(sliderText,slider);controls.appendChild(sliderRow);
  const utility=document.createElement('div');utility.className='logo-touch-editor-utility';
  const undoButton=button(t('Undo','تراجع'),'');undoButton.disabled=history.length===0;const resetButton=button(t('Reset','إعادة ضبط'),'');utility.append(undoButton,resetButton);controls.appendChild(utility);sheet.appendChild(controls);
  const hint=paragraph(subjectIsolated?t('Subject isolated automatically. Review the edges, then apply this logo.','تم عزل جسم الشعار تلقائيًا. راجع الحواف ثم اعتمد هذا الشعار.'):t('Tap the unwanted black/gray area, or use the eraser for pixels touching the logo edge.','المس الجزء الأسود أو الرمادي غير المرغوب، أو استخدم الممحاة للبقايا الملاصقة لحافة الشعار.'),'logo-touch-editor-hint');sheet.appendChild(hint);
  const footer=document.createElement('footer'),cancelButton=button(t('Cancel','إلغاء'),'logo-touch-editor-cancel'),applyButton=button(t('Use this logo','اعتماد هذا الشعار'),'logo-touch-editor-apply');footer.append(cancelButton,applyButton);sheet.appendChild(footer);

  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.appendChild(overlay);
  const updateUndo=()=>{undoButton.disabled=history.length===0;};
  const snapshot=()=>{history.push(context.getImageData(0,0,width,height));if(history.length>historyLimit)history.shift();updateUndo();};
  const discardLastSnapshot=()=>{history.pop();updateUndo();};
  const coordinates=(event:PointerEvent)=>{const rect=canvas.getBoundingClientRect();const x=Math.max(0,Math.min(width-1,Math.floor((event.clientX-rect.left)*width/Math.max(1,rect.width))));const y=Math.max(0,Math.min(height-1,Math.floor((event.clientY-rect.top)*height/Math.max(1,rect.height))));return{x,y};};

  const eraseAt=(x:number,y:number):boolean=>{
    const radius=Math.max(2,Math.round(brush*width/Math.max(320,canvas.clientWidth||320))),r2=radius*radius;
    const left=Math.max(0,x-radius),right=Math.min(width-1,x+radius),top=Math.max(0,y-radius),bottom=Math.min(height-1,y+radius);
    const localWidth=right-left+1,localHeight=bottom-top+1,pixels=context.getImageData(left,top,localWidth,localHeight),data=pixels.data;let changed=false;
    for(let ly=0;ly<localHeight;ly+=1)for(let lx=0;lx<localWidth;lx+=1){const px=left+lx,py=top+ly,dx=px-x,dy=py-y;if(dx*dx+dy*dy>r2)continue;const alphaIndex=(ly*localWidth+lx)*4+3;if((data[alphaIndex]??0)<=0)continue;data[alphaIndex]=0;changed=true;}
    if(changed)context.putImageData(pixels,left,top);return changed;
  };

  const floodAt=(x:number,y:number):boolean=>{
    const pixels=context.getImageData(0,0,width,height),data=pixels.data,total=width*height,seedPixel=y*width+x,seed=seedPixel*4;if((data[seed+3]??0)<=10)return false;
    const sr=data[seed]??0,sg=data[seed+1]??0,sb=data[seed+2]??0,threshold=tolerance*tolerance*3,visited=new Uint8Array(total),queue=new Int32Array(total);let start=0,end=0,changed=false;queue[end++]=seedPixel;visited[seedPixel]=1;
    while(start<end){
      const pixel=queue[start++]??0,index=pixel*4;if((data[index+3]??0)<=10)continue;
      const dr=(data[index]??0)-sr,dg=(data[index+1]??0)-sg,db=(data[index+2]??0)-sb;if(dr*dr+dg*dg+db*db>threshold)continue;
      data[index+3]=0;changed=true;const px=pixel%width,py=Math.floor(pixel/width);
      const visit=(next:number)=>{if(next<0||next>=total||visited[next])return;visited[next]=1;queue[end++]=next;};
      if(px>0)visit(pixel-1);if(px+1<width)visit(pixel+1);if(py>0)visit(pixel-width);if(py+1<height)visit(pixel+width);
    }
    if(changed)context.putImageData(pixels,0,0);return changed;
  };

  const setTool=(next:'tap'|'erase')=>{tool=next;tapButton.classList.toggle('active',tool==='tap');eraseButton.classList.toggle('active',tool==='erase');slider.min='8';slider.max=tool==='tap'?'90':'72';slider.value=String(tool==='tap'?tolerance:brush);sliderText.textContent=tool==='tap'?`${t('Color tolerance','حساسية اللون')}: ${tolerance}`:`${t('Eraser size','حجم الممحاة')}: ${brush}`;};
  tapButton.onclick=()=>setTool('tap');eraseButton.onclick=()=>setTool('erase');
  slider.oninput=()=>{const value=Number(slider.value);if(tool==='tap')tolerance=value;else brush=value;sliderText.textContent=tool==='tap'?`${t('Color tolerance','حساسية اللون')}: ${tolerance}`:`${t('Eraser size','حجم الممحاة')}: ${brush}`;};
  undoButton.onclick=()=>{const previous=history.pop();if(previous)context.putImageData(previous,0,0);updateUndo();};
  resetButton.onclick=()=>{context.putImageData(new ImageData(new Uint8ClampedArray(original.data),original.width,original.height),0,0);history.length=0;updateUndo();hint.textContent=t('Isolated logo restored.','تمت استعادة نسخة الشعار المعزولة.');};

  const endStroke=(event?:PointerEvent)=>{drawing=false;if(event)try{if(canvas.hasPointerCapture?.(event.pointerId))canvas.releasePointerCapture?.(event.pointerId);}catch{}};
  canvas.onpointerdown=(event)=>{event.preventDefault();canvas.setPointerCapture?.(event.pointerId);const{x,y}=coordinates(event);snapshot();if(tool==='tap'){if(!floodAt(x,y))discardLastSnapshot();return;}drawing=true;if(!eraseAt(x,y))discardLastSnapshot();};
  canvas.onpointermove=(event)=>{if(!drawing||tool!=='erase')return;event.preventDefault();const{x,y}=coordinates(event);eraseAt(x,y);};
  canvas.onpointerup=event=>endStroke(event);canvas.onpointercancel=event=>endStroke(event);

  return await new Promise<string>(resolve=>{
    const finish=(value:string)=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=previousOverflow;overlay.remove();resolve(value);};
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();finish(src);}};document.addEventListener('keydown',onKeyDown);
    closeButton.onclick=()=>finish(src);cancelButton.onclick=()=>finish(src);overlay.onclick=event=>{if(event.target===overlay)finish(src);};
    applyButton.onclick=()=>{const pixels=context.getImageData(0,0,width,height);if(!hasVisiblePixels(pixels)){hint.textContent=t('The logo cannot be empty. Undo or reset before applying.','لا يمكن اعتماد شعار فارغ. استخدم تراجع أو إعادة ضبط أولًا.');return;}finish(crop(canvas,pixels));};
  });
}

function dataUrlToBlob(src:string):Blob{
  const comma=src.indexOf(',');
  if(comma<0||!src.startsWith('data:image/'))throw new Error(t('Unable to read the original logo image.','تعذر قراءة صورة الشعار الأصلية.'));
  const metadata=src.slice(5,comma),payload=src.slice(comma+1),mime=(metadata.split(';')[0]||'').toLowerCase();
  if(!/^image\/(png|webp|jpeg)$/.test(mime))throw new Error(t('AI background removal supports PNG, WebP, and JPEG logos.','إزالة الخلفية بالذكاء الاصطناعي تدعم شعارات PNG وWebP وJPEG.'));
  try{
    const binary=metadata.includes(';base64')?atob(payload):decodeURIComponent(payload);
    const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
    return new Blob([bytes],{type:mime});
  }catch{throw new Error(t('Unable to read the original logo image.','تعذر قراءة صورة الشعار الأصلية.'));}
}

function blobToDataUrl(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error(t('Unable to read the AI result.','تعذر قراءة نتيجة الذكاء الاصطناعي.')));reader.readAsDataURL(blob);
  });
}

async function removeLogoBackgroundWithAi(src:string):Promise<string>{
  const blob=dataUrlToBlob(src);
  if(blob.size>4*1024*1024)throw new Error(t('The logo is too large for AI background removal. Use a file smaller than 4 MB.','حجم الشعار كبير جدًا لإزالة الخلفية بالذكاء الاصطناعي. استخدم ملفًا أصغر من 4 ميجابايت.'));
  const controller=new AbortController(),timeout=window.setTimeout(()=>controller.abort(),35000);
  try{
    const response=await fetch('/api/remove-background',{method:'POST',headers:{'Content-Type':blob.type,'X-Requested-With':'LOUREX-Invoice'},body:blob,signal:controller.signal,cache:'no-store'});
    if(!response.ok){
      let code='';
      try{const payload=await response.json() as {code?:string};code=payload.code||'';}catch{}
      if(code==='AI_NOT_CONFIGURED')throw new Error(t('AI background removal is not configured yet. Add the REMOVE_BG_API_KEY secret to the LOUREX Invoice Vercel project.','إزالة الخلفية بالذكاء الاصطناعي غير مهيأة بعد. أضف سر REMOVE_BG_API_KEY إلى مشروع LOUREX Invoice على Vercel.'));
      if(code==='AI_QUOTA_EXHAUSTED')throw new Error(t('AI background-removal quota is unavailable. Check the remove.bg account quota.','حصة إزالة الخلفية بالذكاء الاصطناعي غير متاحة. تحقق من حصة حساب remove.bg.'));
      if(code==='AI_RATE_LIMITED')throw new Error(t('AI background removal is busy right now. Try again shortly.','خدمة إزالة الخلفية بالذكاء الاصطناعي مشغولة الآن. حاول بعد قليل.'));
      if(code==='AI_IMAGE_REJECTED'||code==='UNSUPPORTED_IMAGE')throw new Error(t('The AI service could not process this logo. Try another PNG, WebP, or JPEG image.','تعذر على خدمة الذكاء الاصطناعي معالجة هذا الشعار. جرّب صورة PNG أو WebP أو JPEG أخرى.'));
      throw new Error(t('AI background removal is temporarily unavailable. Try again.','إزالة الخلفية بالذكاء الاصطناعي غير متاحة مؤقتًا. حاول مرة أخرى.'));
    }
    const result=await response.blob();
    if(!result.size)throw new Error(t('AI background removal returned an empty result.','أعادت إزالة الخلفية بالذكاء الاصطناعي نتيجة فارغة.'));
    return await blobToDataUrl(result);
  }catch(error){
    if(error instanceof Error&&error.name==='AbortError')throw new Error(t('AI background removal took too long. Try again.','استغرقت إزالة الخلفية بالذكاء الاصطناعي وقتًا طويلًا. حاول مرة أخرى.'));
    throw error;
  }finally{window.clearTimeout(timeout);}
}

export async function rebuildLogoWithoutBackgroundDataUrl(src:string):Promise<string>{
  if(!src||!src.startsWith('data:image/'))return src;
  return removeLogoBackgroundWithAi(src);
}
