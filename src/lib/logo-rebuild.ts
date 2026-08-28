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

/**
 * Kept as a deterministic pixel-level helper for existing automatic repair
 * tests. The user-facing "recreate" workflow below is now interactive because
 * neutral dark artwork and neutral dark background cannot always be separated
 * safely by colour heuristics alone.
 */
export function rebuildLogoTransparentPixels(data:Uint8ClampedArray,width:number,height:number):boolean{
  if(width<2||height<2||data.length<width*height*4)return false;
  const total=width*height,colourCore=new Uint8Array(total);let seeds=0,left=width,top=height,right=-1,bottom=-1;
  for(let pixel=0;pixel<total;pixel+=1){
    const index=pixel*4,alpha=data[index+3]??0;if(alpha<=20)continue;
    const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0,maximum=Math.max(red,green,blue),minimum=Math.min(red,green,blue),range=maximum-minimum;
    if(saturation(red,green,blue)<.18||range<24||maximum<38)continue;
    colourCore[pixel]=1;seeds+=1;const x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(seeds<Math.max(20,Math.round(total*.00018))||right<left||bottom<top)return false;

  const coreWidth=right-left+1,coreHeight=bottom-top+1,coreMin=Math.max(1,Math.min(coreWidth,coreHeight)),coreMax=Math.max(coreWidth,coreHeight);
  const outlineRadius=clamp(Math.round(coreMin*.07),3,10);
  const keep=dilate(colourCore,width,height,outlineRadius);
  const darkMask=new Uint8Array(total),proximity=clamp(Math.round(coreMax*1.25),18,260);
  for(let pixel=0;pixel<total;pixel+=1){
    if(keep[pixel]??0)continue;const index=pixel*4,alpha=data[index+3]??0;if(alpha<=20)continue;
    const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0,x=pixel%width,y=Math.floor(pixel/width);
    if(x<left-proximity||x>right+proximity||y<top-proximity||y>bottom+proximity)continue;
    if(saturation(red,green,blue)<=.32&&luma(red,green,blue)<=180)darkMask[pixel]=1;
  }
  const {labels,components}=label(darkMask,width,height),preserveLabels=new Set<number>();
  for(const component of components){
    const componentWidth=component.right-component.left+1,componentHeight=component.bottom-component.top+1,minimum=Math.max(1,Math.min(componentWidth,componentHeight)),maximum=Math.max(componentWidth,componentHeight),aspect=maximum/minimum,fill=component.pixels/Math.max(1,componentWidth*componentHeight);
    const thin=minimum<=Math.max(3,Math.round(coreMin*.055))&&aspect>=2.1;
    const tiny=component.pixels<=Math.max(22,Math.round(total*.00035))&&minimum<=Math.max(5,Math.round(coreMin*.06));
    const textLike=thin||(tiny&&fill<=.9);
    if(textLike)preserveLabels.add(component.label);
  }

  let removed=0,kept=0;
  for(let pixel=0;pixel<total;pixel+=1){
    const index=pixel*4,alpha=data[index+3]??0;if(alpha<=0)continue;
    const darkLabel=labels[pixel]??-1;
    if((keep[pixel]??0)||preserveLabels.has(darkLabel)){kept+=1;continue;}
    data[index+3]=0;removed+=1;
  }
  return removed>0&&kept>=Math.max(20,Math.round(seeds*.72));
}

function loadImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(t('Unable to open logo image.','تعذر فتح صورة الشعار.')));image.src=src;});}

function crop(canvas:HTMLCanvasElement,pixels:ImageData):string{
  const width=canvas.width,height=canvas.height;let left=width,top=height,right=-1,bottom=-1;
  for(let index=0;index<pixels.data.length;index+=4){if((pixels.data[index+3]??0)<=12)continue;const pixel=Math.floor(index/4),x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left||bottom<top)return canvas.toDataURL('image/png');const padding=Math.max(6,Math.round(Math.min(width,height)*.02));
  const cropLeft=Math.max(0,left-padding),cropTop=Math.max(0,top-padding),cropRight=Math.min(width-1,right+padding),cropBottom=Math.min(height-1,bottom+padding),cropWidth=cropRight-cropLeft+1,cropHeight=cropBottom-cropTop+1;
  if(cropWidth===width&&cropHeight===height)return canvas.toDataURL('image/png');const output=document.createElement('canvas');output.width=cropWidth;output.height=cropHeight;const context=output.getContext('2d');if(!context)return canvas.toDataURL('image/png');context.clearRect(0,0,cropWidth,cropHeight);context.drawImage(canvas,cropLeft,cropTop,cropWidth,cropHeight,0,0,cropWidth,cropHeight);return output.toDataURL('image/png');
}

function button(labelText:string,className:string):HTMLButtonElement{const element=document.createElement('button');element.type='button';element.className=className;element.textContent=labelText;return element;}
function paragraph(text:string,className:string):HTMLParagraphElement{const element=document.createElement('p');element.className=className;element.textContent=text;return element;}
function span(text:string,className:string):HTMLSpanElement{const element=document.createElement('span');element.className=className;element.textContent=text;return element;}

async function openManualBackgroundEditor(src:string):Promise<string>{
  const image=await loadImage(src),naturalWidth=image.naturalWidth||image.width,naturalHeight=image.naturalHeight||image.height;if(!naturalWidth||!naturalHeight)return src;
  const maxDimension=1600,scale=Math.min(1,maxDimension/Math.max(naturalWidth,naturalHeight)),width=Math.max(1,Math.round(naturalWidth*scale)),height=Math.max(1,Math.round(naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.className='logo-touch-editor-canvas';const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return src;context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);
  const original=context.getImageData(0,0,width,height),history:ImageData[]=[];let tool:'tap'|'erase'='tap',tolerance=42,brush=28,drawing=false,settled=false;
  const overlay=document.createElement('div');overlay.className='logo-touch-editor-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',t('Logo background editor','محرر خلفية الشعار'));
  const sheet=document.createElement('div');sheet.className='logo-touch-editor-sheet';overlay.appendChild(sheet);
  const header=document.createElement('header'),heading=document.createElement('div');heading.className='logo-touch-editor-heading';const title=document.createElement('strong');title.textContent=t('Remove logo background','إزالة خلفية الشعار');heading.append(title,span(t('Tap an unwanted area to remove it. Use the eraser when the unwanted pixels touch the logo edge.','اضغط على الجزء غير المرغوب لحذفه. استخدم الممحاة عندما تكون البقايا ملاصقة لحافة الشعار.'),'logo-touch-editor-subtitle'));const closeButton=button('×','logo-touch-editor-close');closeButton.setAttribute('aria-label',t('Close','إغلاق'));header.append(heading,closeButton);sheet.appendChild(header);
  const canvasWrap=document.createElement('div');canvasWrap.className='logo-touch-editor-canvas-wrap';canvasWrap.appendChild(canvas);sheet.appendChild(canvasWrap);
  const controls=document.createElement('div');controls.className='logo-touch-editor-controls';
  const switcher=document.createElement('div');switcher.className='logo-touch-editor-switch';const tapButton=button(t('Tap area','لمس المنطقة'),'active'),eraseButton=button(t('Eraser','ممحاة'),'');switcher.append(tapButton,eraseButton);controls.appendChild(switcher);
  const sliderRow=document.createElement('label');sliderRow.className='logo-touch-editor-slider';const sliderText=span(`${t('Color tolerance','حساسية اللون')}: ${tolerance}`,'');const slider=document.createElement('input');slider.type='range';slider.min='8';slider.max='90';slider.step='1';slider.value=String(tolerance);sliderRow.append(sliderText,slider);controls.appendChild(sliderRow);
  const utility=document.createElement('div');utility.className='logo-touch-editor-utility';const undoButton=button(t('Undo','تراجع'),'');undoButton.disabled=true;const resetButton=button(t('Reset','إعادة ضبط'),'');utility.append(undoButton,resetButton);controls.appendChild(utility);sheet.appendChild(controls);
  const hint=paragraph(t('Tip: start by tapping the black/gray block. If that also removes part of the logo, press Undo and erase only the unwanted pixels with your finger.','نصيحة: ابدأ بلمس الكتلة السوداء أو الرمادية. إذا أزال ذلك جزءًا من الشعار اضغط تراجع ثم امسح البقايا فقط بإصبعك.'),'logo-touch-editor-hint');sheet.appendChild(hint);
  const footer=document.createElement('footer'),cancelButton=button(t('Cancel','إلغاء'),'logo-touch-editor-cancel'),applyButton=button(t('Use this logo','اعتماد هذا الشعار'),'logo-touch-editor-apply');footer.append(cancelButton,applyButton);sheet.appendChild(footer);

  const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.body.appendChild(overlay);
  const updateUndo=()=>{undoButton.disabled=history.length===0;};
  const snapshot=()=>{history.push(context.getImageData(0,0,width,height));if(history.length>12)history.shift();updateUndo();};
  const coordinates=(event:PointerEvent)=>{const rect=canvas.getBoundingClientRect(),x=Math.max(0,Math.min(width-1,Math.floor((event.clientX-rect.left)*width/Math.max(1,rect.width)))),y=Math.max(0,Math.min(height-1,Math.floor((event.clientY-rect.top)*height/Math.max(1,rect.height))));return{x,y};};
  const eraseAt=(x:number,y:number)=>{const pixels=context.getImageData(0,0,width,height),data=pixels.data,radius=Math.max(2,Math.round(brush*width/Math.max(320,canvas.clientWidth||320))),r2=radius*radius,left=Math.max(0,x-radius),right=Math.min(width-1,x+radius),top=Math.max(0,y-radius),bottom=Math.min(height-1,y+radius);for(let py=top;py<=bottom;py+=1)for(let px=left;px<=right;px+=1){const dx=px-x,dy=py-y;if(dx*dx+dy*dy<=r2)data[(py*width+px)*4+3]=0;}context.putImageData(pixels,0,0);};
  const floodAt=(x:number,y:number)=>{const pixels=context.getImageData(0,0,width,height),data=pixels.data,total=width*height,seedPixel=y*width+x,seed=seedPixel*4;if((data[seed+3]??0)<=10)return;const sr=data[seed]??0,sg=data[seed+1]??0,sb=data[seed+2]??0,threshold=tolerance*tolerance*3,visited=new Uint8Array(total),queue=new Int32Array(total);let start=0,end=0;queue[end++]=seedPixel;visited[seedPixel]=1;while(start<end){const pixel=queue[start++]??0,index=pixel*4;if((data[index+3]??0)<=10)continue;const dr=(data[index]??0)-sr,dg=(data[index+1]??0)-sg,db=(data[index+2]??0)-sb;if(dr*dr+dg*dg+db*db>threshold)continue;data[index+3]=0;const px=pixel%width,py=Math.floor(pixel/width);const visit=(next:number)=>{if(next<0||next>=total||visited[next])return;visited[next]=1;queue[end++]=next;};if(px>0)visit(pixel-1);if(px+1<width)visit(pixel+1);if(py>0)visit(pixel-width);if(py+1<height)visit(pixel+width);}context.putImageData(pixels,0,0);};
  const setTool=(next:'tap'|'erase')=>{tool=next;tapButton.classList.toggle('active',tool==='tap');eraseButton.classList.toggle('active',tool==='erase');slider.min='8';slider.max=tool==='tap'?'90':'72';slider.value=String(tool==='tap'?tolerance:brush);sliderText.textContent=tool==='tap'?`${t('Color tolerance','حساسية اللون')}: ${tolerance}`:`${t('Eraser size','حجم الممحاة')}: ${brush}`;};
  tapButton.onclick=()=>setTool('tap');eraseButton.onclick=()=>setTool('erase');slider.oninput=()=>{const value=Number(slider.value);if(tool==='tap')tolerance=value;else brush=value;sliderText.textContent=tool==='tap'?`${t('Color tolerance','حساسية اللون')}: ${tolerance}`:`${t('Eraser size','حجم الممحاة')}: ${brush}`;};
  undoButton.onclick=()=>{const previous=history.pop();if(previous)context.putImageData(previous,0,0);updateUndo();};resetButton.onclick=()=>{context.putImageData(new ImageData(new Uint8ClampedArray(original.data),original.width,original.height),0,0);history.length=0;updateUndo();};
  canvas.onpointerdown=(event)=>{event.preventDefault();canvas.setPointerCapture?.(event.pointerId);const{x,y}=coordinates(event);snapshot();if(tool==='tap'){floodAt(x,y);return;}drawing=true;eraseAt(x,y);};canvas.onpointermove=(event)=>{if(!drawing||tool!=='erase')return;event.preventDefault();const{x,y}=coordinates(event);eraseAt(x,y);};canvas.onpointerup=()=>{drawing=false;};canvas.onpointercancel=()=>{drawing=false;};

  return await new Promise<string>(resolve=>{
    const finish=(value:string)=>{if(settled)return;settled=true;document.body.style.overflow=previousOverflow;overlay.remove();resolve(value);};
    closeButton.onclick=()=>finish(src);cancelButton.onclick=()=>finish(src);overlay.onclick=event=>{if(event.target===overlay)finish(src);};
    applyButton.onclick=()=>{const pixels=context.getImageData(0,0,width,height);finish(crop(canvas,pixels));};
  });
}

export async function rebuildLogoWithoutBackgroundDataUrl(src:string):Promise<string>{
  if(!src||!src.startsWith('data:image/'))return src;
  try{return await openManualBackgroundEditor(src);}catch{return src;}
}
