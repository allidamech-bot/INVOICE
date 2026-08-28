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
 * Aggressively reconstructs a transparent logo from its coloured artwork.
 * Unlike the conservative cleaner, this is an explicit user action. Coloured
 * pixels form the protected core; a narrow halo keeps black outlines and light
 * highlights, while broad neutral/black background slabs are discarded.
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

  // Preserve detached dark typography or hairline artwork close to the logo,
  // while rejecting broad compact rectangles such as the residue in the user's
  // screenshot. Anything already inside the colour halo is automatically kept.
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

function loadImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Unable to rebuild logo image.'));image.src=src;});}

function crop(canvas:HTMLCanvasElement,pixels:ImageData):string{
  const width=canvas.width,height=canvas.height;let left=width,top=height,right=-1,bottom=-1;
  for(let index=0;index<pixels.data.length;index+=4){if((pixels.data[index+3]??0)<=12)continue;const pixel=Math.floor(index/4),x=pixel%width,y=Math.floor(pixel/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(right<left||bottom<top)return canvas.toDataURL('image/png');const padding=Math.max(6,Math.round(Math.min(width,height)*.02));
  const cropLeft=Math.max(0,left-padding),cropTop=Math.max(0,top-padding),cropRight=Math.min(width-1,right+padding),cropBottom=Math.min(height-1,bottom+padding),cropWidth=cropRight-cropLeft+1,cropHeight=cropBottom-cropTop+1;
  if(cropWidth===width&&cropHeight===height)return canvas.toDataURL('image/png');const output=document.createElement('canvas');output.width=cropWidth;output.height=cropHeight;const context=output.getContext('2d');if(!context)return canvas.toDataURL('image/png');context.clearRect(0,0,cropWidth,cropHeight);context.drawImage(canvas,cropLeft,cropTop,cropWidth,cropHeight,0,0,cropWidth,cropHeight);return output.toDataURL('image/png');
}

export async function rebuildLogoWithoutBackgroundDataUrl(src:string):Promise<string>{
  if(!src||!src.startsWith('data:image/'))return src;
  try{
    const image=await loadImage(src),naturalWidth=image.naturalWidth||image.width,naturalHeight=image.naturalHeight||image.height;if(!naturalWidth||!naturalHeight)return src;
    const maxDimension=1600,scale=Math.min(1,maxDimension/Math.max(naturalWidth,naturalHeight)),width=Math.max(1,Math.round(naturalWidth*scale)),height=Math.max(1,Math.round(naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return src;context.clearRect(0,0,width,height);context.drawImage(image,0,0,width,height);const pixels=context.getImageData(0,0,width,height);
    if(!rebuildLogoTransparentPixels(pixels.data,width,height))return src;context.putImageData(pixels,0,0);return crop(canvas,pixels);
  }catch{return src;}
}
