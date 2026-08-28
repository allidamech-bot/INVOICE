import { rebuildLogoTransparentPixels } from './logo-rebuild.js';

function clamp(value:number,minimum:number,maximum:number):number{return Math.max(minimum,Math.min(maximum,value));}
function luma(red:number,green:number,blue:number):number{return red*.2126+green*.7152+blue*.0722;}
function saturation(red:number,green:number,blue:number):number{const max=Math.max(red,green,blue),min=Math.min(red,green,blue);return max<=0?0:(max-min)/max;}

interface Component{label:number;pixels:number;left:number;top:number;right:number;bottom:number;}

function transparencyRatio(data:Uint8ClampedArray):number{
  const pixels=Math.floor(data.length/4);const step=Math.max(1,Math.floor(pixels/12000));let sampled=0,transparent=0;
  for(let pixel=0;pixel<pixels;pixel+=step){sampled+=1;if((data[pixel*4+3]??0)<235)transparent+=1;}
  return sampled?transparent/sampled:0;
}

function dilate(mask:Uint8Array,width:number,height:number,iterations:number):Uint8Array{
  let current=mask;const total=width*height;
  for(let iteration=0;iteration<iterations;iteration+=1){
    const next=new Uint8Array(current);
    for(let pixel=0;pixel<total;pixel+=1){
      if(!(current[pixel]??0))continue;const x=pixel%width,y=Math.floor(pixel/width);
      if(x>0)next[pixel-1]=1;if(x+1<width)next[pixel+1]=1;if(y>0)next[pixel-width]=1;if(y+1<height)next[pixel+width]=1;
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

function darkNeutral(data:Uint8ClampedArray,pixel:number,maxSaturation=.24,maxLuma=152):boolean{
  const index=pixel*4;if((data[index+3]??0)<=12)return false;const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0;
  return saturation(red,green,blue)<=maxSaturation&&luma(red,green,blue)<=maxLuma;
}

function darkSupport(data:Uint8ClampedArray,pixel:number,width:number,height:number):number{
  const x=pixel%width,y=Math.floor(pixel/width);let support=0,total=0;
  for(let dy=-1;dy<=1;dy+=1){for(let dx=-1;dx<=1;dx+=1){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;total+=1;if(darkNeutral(data,ny*width+nx,.27,160))support+=1;}}
  return total?support/total:0;
}

export function repairLogoResidualPixels(data:Uint8ClampedArray,width:number,height:number):boolean{
  if(width<2||height<2||data.length<width*height*4||transparencyRatio(data)<.08)return false;
  const total=width*height,core=new Uint8Array(total);let seeds=0,left=width,top=height,right=-1,bottom=-1;
  for(let pixel=0;pixel<total;pixel+=1){
    const index=pixel*4;if((data[index+3]??0)<=24)continue;const red=data[index]??0,green=data[index+1]??0,blue=data[index+2]??0;
    const sat=saturation(red,green,blue),range=Math.max(red,green,blue)-Math.min(red,green,blue);
    if(sat<.24||range<32)continue;core[pixel]=1;seeds+=1;const x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(seeds<Math.max(28,Math.round(total*.00028))||right<left||bottom<top)return false;

  const coreWidth=right-left+1,coreHeight=bottom-top+1,coreMin=Math.max(1,Math.min(coreWidth,coreHeight)),coreMax=Math.max(coreWidth,coreHeight);
  const haloRadius=clamp(Math.round(coreMin*.025),2,10),protectedMask=dilate(core,width,height,haloRadius);
  const proximity=clamp(Math.round(coreMax*.46),10,150),candidate=new Uint8Array(total);
  for(let pixel=0;pixel<total;pixel+=1){
    if(protectedMask[pixel]??0)continue;if(!darkNeutral(data,pixel,.23,150))continue;const x=pixel%width,y=Math.floor(pixel/width);
    if(x<left-proximity||x>right+proximity||y<top-proximity||y>bottom+proximity)continue;candidate[pixel]=1;
  }

  const {labels,components}=label(candidate,width,height),removeLabels=new Set<number>();
  for(const component of components){
    const componentWidth=component.right-component.left+1,componentHeight=component.bottom-component.top+1,componentMin=Math.max(1,Math.min(componentWidth,componentHeight)),componentMax=Math.max(componentWidth,componentHeight);
    const fill=component.pixels/Math.max(1,componentWidth*componentHeight),aspect=componentMax/componentMin;
    const nearCore=component.right>=left-proximity&&component.left<=right+proximity&&component.bottom>=top-proximity&&component.top<=bottom+proximity;
    const largeEnough=component.pixels>=Math.max(30,Math.round(total*.00055));
    const broadEnough=componentMin>=Math.max(3,Math.round(coreMin*.035));
    if(nearCore&&largeEnough&&broadEnough&&fill>=.11&&aspect<=7.5)removeLabels.add(component.label);
  }
  if(!removeLabels.size)return false;

  const removal=new Uint8Array(total);let removed=0;
  for(let pixel=0;pixel<total;pixel+=1){const componentLabel=labels[pixel]??-1;if(!removeLabels.has(componentLabel))continue;removal[pixel]=1;if((data[pixel*4+3]??0)>0){data[pixel*4+3]=0;removed+=1;}}

  const growIterations=clamp(Math.round(coreMin*.018),1,4);let frontier=removal;
  for(let iteration=0;iteration<growIterations;iteration+=1){
    const expanded=dilate(frontier,width,height,1),next=new Uint8Array(frontier);let grew=false;
    for(let pixel=0;pixel<total;pixel+=1){
      if(!(expanded[pixel]??0)||(frontier[pixel]??0)||(protectedMask[pixel]??0))continue;if(!darkNeutral(data,pixel,.27,160))continue;if(darkSupport(data,pixel,width,height)<.55)continue;
      data[pixel*4+3]=0;next[pixel]=1;removed+=1;grew=true;
    }
    frontier=next;if(!grew)break;
  }
  return removed>=Math.max(20,Math.round(total*.00035));
}

function loadImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Unable to repair logo image.'));image.src=src;});}

function crop(canvas:HTMLCanvasElement,pixels:ImageData):string{
  const width=canvas.width,height=canvas.height;let left=width,top=height,right=-1,bottom=-1;
  for(let index=0;index<pixels.data.length;index+=4){if((pixels.data[index+3]??0)<=12)continue;const pixel=Math.floor(index/4),x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left||bottom<top)return canvas.toDataURL('image/png');const padding=Math.max(5,Math.round(Math.min(width,height)*.018));
  const cropLeft=Math.max(0,left-padding),cropTop=Math.max(0,top-padding),cropRight=Math.min(width-1,right+padding),cropBottom=Math.min(height-1,bottom+padding),cropWidth=cropRight-cropLeft+1,cropHeight=cropBottom-cropTop+1;
  if(cropWidth===width&&cropHeight===height)return canvas.toDataURL('image/png');const output=document.createElement('canvas');output.width=cropWidth;output.height=cropHeight;const context=output.getContext('2d');if(!context)return canvas.toDataURL('image/png');context.clearRect(0,0,cropWidth,cropHeight);context.drawImage(canvas,cropLeft,cropTop,cropWidth,cropHeight,0,0,cropWidth,cropHeight);return output.toDataURL('image/png');
}

export async function repairLogoDataUrl(src:string):Promise<string>{
  if(!src||!src.startsWith('data:image/'))return src;
  try{
    const image=await loadImage(src),naturalWidth=image.naturalWidth||image.width,naturalHeight=image.naturalHeight||image.height;if(!naturalWidth||!naturalHeight)return src;
    const maxDimension=1600,scale=Math.min(1,maxDimension/Math.max(naturalWidth,naturalHeight)),width=Math.max(1,Math.round(naturalWidth*scale)),height=Math.max(1,Math.round(naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return src;context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);const pixels=context.getImageData(0,0,width,height);
    const residualChanged=repairLogoResidualPixels(pixels.data,width,height);
    const subjectChanged=rebuildLogoTransparentPixels(pixels.data,width,height);
    if(!residualChanged&&!subjectChanged)return src;
    context.putImageData(pixels,0,0);return crop(canvas,pixels);
  }catch{return src;}
}
