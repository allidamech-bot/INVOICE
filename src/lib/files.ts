export type CompanyAssetKind = 'generic'|'logo'|'signature'|'stamp';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to process image file.'));
    image.src = src;
  });
}

interface BackgroundModel {
  red:number;
  green:number;
  blue:number;
  luma:number;
  saturation:number;
  spread:number;
  dominance:number;
}

function clamp(value:number,minimum:number,maximum:number):number{
  return Math.max(minimum,Math.min(maximum,value));
}

function percentile(values:number[],ratio:number):number{
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*ratio)));
  return sorted[index]??0;
}

function median(values:number[]):number{return percentile(values,.5);}

function pixelLuma(red:number,green:number,blue:number):number{
  return (red*.2126)+(green*.7152)+(blue*.0722);
}

function pixelSaturation(red:number,green:number,blue:number):number{
  const maximum=Math.max(red,green,blue);
  const minimum=Math.min(red,green,blue);
  return maximum<=0?0:(maximum-minimum)/maximum;
}

function colorDistance(data:Uint8ClampedArray,index:number,model:BackgroundModel):number{
  const red=(data[index]??0)-model.red;
  const green=(data[index+1]??0)-model.green;
  const blue=(data[index+2]??0)-model.blue;
  return Math.sqrt((red*red+green*green+blue*blue)/3);
}

function borderPixelIndexes(width:number,height:number):number[]{
  const indexes:number[]=[];
  const perimeter=Math.max(1,2*(width+height));
  const step=Math.max(1,Math.floor(perimeter/2400));
  const depths=[0,Math.min(2,Math.floor(Math.min(width,height)/40))].filter((value,index,array)=>array.indexOf(value)===index);
  for(const depth of depths){
    const left=depth;
    const right=Math.max(left,width-1-depth);
    const top=depth;
    const bottom=Math.max(top,height-1-depth);
    for(let x=left;x<=right;x+=step){indexes.push((top*width+x)*4);if(bottom!==top)indexes.push((bottom*width+x)*4);}
    for(let y=top+step;y<bottom;y+=step){indexes.push((y*width+left)*4);if(right!==left)indexes.push((y*width+right)*4);}
  }
  return indexes;
}

function backgroundModel(data:Uint8ClampedArray,width:number,height:number):BackgroundModel|null{
  const indexes=borderPixelIndexes(width,height).filter(index=>(data[index+3]??0)>24);
  if(indexes.length<8)return null;
  const reds=indexes.map(index=>data[index]??0);
  const greens=indexes.map(index=>data[index+1]??0);
  const blues=indexes.map(index=>data[index+2]??0);
  const red=median(reds),green=median(greens),blue=median(blues);
  const provisional:BackgroundModel={red,green,blue,luma:pixelLuma(red,green,blue),saturation:pixelSaturation(red,green,blue),spread:0,dominance:0};
  const distances=indexes.map(index=>colorDistance(data,index,provisional));
  const spread=percentile(distances,.9);
  const dominanceRadius=clamp(spread+18,24,86);
  const dominance=distances.filter(distance=>distance<=dominanceRadius).length/distances.length;
  return {...provisional,spread,dominance};
}

function transparencyRatio(data:Uint8ClampedArray):number{
  let transparent=0;
  let sampled=0;
  const pixels=data.length/4;
  const step=Math.max(1,Math.floor(pixels/12000));
  for(let pixel=0;pixel<pixels;pixel+=step){sampled+=1;if((data[pixel*4+3]??0)<235)transparent+=1;}
  return sampled?transparent/sampled:0;
}

function smoothstep(edge0:number,edge1:number,value:number):number{
  if(edge1<=edge0)return value>=edge1?1:0;
  const x=clamp((value-edge0)/(edge1-edge0),0,1);
  return x*x*(3-2*x);
}

function applySignatureMatte(data:Uint8ClampedArray,width:number,height:number,model:BackgroundModel):boolean{
  if(model.dominance<.42)return false;
  const softStart=clamp(model.spread*1.65+10,18,72);
  const softEnd=clamp(softStart+48+model.spread*.35,softStart+38,132);
  let changed=0;
  let visible=0;
  for(let index=0;index<data.length;index+=4){
    const originalAlpha=data[index+3]??0;
    if(originalAlpha===0)continue;
    const distance=colorDistance(data,index,model);
    const factor=smoothstep(softStart,softEnd,distance);
    const alpha=Math.round(originalAlpha*factor);
    if(alpha<originalAlpha-2)changed+=1;
    data[index+3]=alpha;
    if(alpha>12)visible+=1;
  }
  const total=width*height;
  if(visible<Math.max(8,total*.00035))return false;
  return changed>Math.max(12,total*.003);
}

function edgeThreshold(model:BackgroundModel,kind:CompanyAssetKind):number{
  const neutral=model.saturation<.22;
  const light=model.luma>176&&neutral;
  const dark=model.luma<92&&neutral;
  if(kind==='stamp'&&!light)return 0;
  if(light)return clamp(model.spread*2.45+24,46,108);
  if(dark)return clamp(model.spread*2.2+22,42,98);
  return clamp(model.spread*1.85+18,32,76);
}

function applyEdgeBackgroundRemoval(data:Uint8ClampedArray,width:number,height:number,model:BackgroundModel,kind:CompanyAssetKind):boolean{
  if(model.dominance<.43)return false;
  const threshold=edgeThreshold(model,kind);
  if(threshold<=0)return false;
  const total=width*height;
  const visited=new Uint8Array(total);
  const queue=new Int32Array(total);
  let start=0,end=0;
  const enqueue=(pixel:number):void=>{
    if(pixel<0||pixel>=total||visited[pixel])return;
    const index=pixel*4;
    if((data[index+3]??0)<=8)return;
    if(colorDistance(data,index,model)>threshold)return;
    visited[pixel]=1;
    queue[end++]=pixel;
  };
  for(let x=0;x<width;x+=1){enqueue(x);if(height>1)enqueue((height-1)*width+x);}
  for(let y=1;y<height-1;y+=1){enqueue(y*width);if(width>1)enqueue(y*width+width-1);}

  const clearUntil=threshold*.5;
  let changed=0;
  while(start<end){
    const pixel=queue[start++]!;
    const x=pixel%width;
    const y=Math.floor(pixel/width);
    const index=pixel*4;
    const originalAlpha=data[index+3]??0;
    const distance=colorDistance(data,index,model);
    const alpha=Math.round(originalAlpha*smoothstep(clearUntil,threshold,distance));
    if(alpha<originalAlpha-2)changed+=1;
    data[index+3]=alpha;
    if(x>0)enqueue(pixel-1);
    if(x+1<width)enqueue(pixel+1);
    if(y>0)enqueue(pixel-width);
    if(y+1<height)enqueue(pixel+width);
  }
  return changed>Math.max(12,total*.004);
}

function cropTransparentCanvas(canvas:HTMLCanvasElement,pixels:ImageData):string{
  const width=canvas.width,height=canvas.height;
  let left=width,top=height,right=-1,bottom=-1;
  for(let index=0;index<pixels.data.length;index+=4){
    if((pixels.data[index+3]??0)<=12)continue;
    const pixel=index/4;
    const x=pixel%width;
    const y=Math.floor(pixel/width);
    if(x<left)left=x;
    if(x>right)right=x;
    if(y<top)top=y;
    if(y>bottom)bottom=y;
  }
  if(right<left||bottom<top)return canvas.toDataURL('image/png');
  const padding=Math.max(4,Math.round(Math.min(width,height)*.025));
  const cropLeft=Math.max(0,left-padding);
  const cropTop=Math.max(0,top-padding);
  const cropRight=Math.min(width-1,right+padding);
  const cropBottom=Math.min(height-1,bottom+padding);
  const cropWidth=Math.max(1,cropRight-cropLeft+1);
  const cropHeight=Math.max(1,cropBottom-cropTop+1);
  if(cropWidth===width&&cropHeight===height)return canvas.toDataURL('image/png');
  const output=document.createElement('canvas');
  output.width=cropWidth;
  output.height=cropHeight;
  const outputContext=output.getContext('2d');
  if(!outputContext)return canvas.toDataURL('image/png');
  outputContext.clearRect(0,0,cropWidth,cropHeight);
  outputContext.drawImage(canvas,cropLeft,cropTop,cropWidth,cropHeight,0,0,cropWidth,cropHeight);
  return output.toDataURL('image/png');
}

async function normalizeImage(src:string,kind:CompanyAssetKind):Promise<string>{
  const image=await loadImage(src);
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;
  if(!naturalWidth||!naturalHeight)return src;
  const maxDimension=1400;
  const scale=Math.min(1,maxDimension/Math.max(naturalWidth,naturalHeight));
  const width=Math.max(1,Math.round(naturalWidth*scale));
  const height=Math.max(1,Math.round(naturalHeight*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;
  canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)return src;
  context.clearRect(0,0,width,height);
  context.drawImage(image,0,0,width,height);
  const pixels=context.getImageData(0,0,width,height);
  const model=backgroundModel(pixels.data,width,height);
  if(!model)return cropTransparentCanvas(canvas,pixels);

  const alreadyTransparent=transparencyRatio(pixels.data)>.06;
  let changed=false;
  if(!alreadyTransparent){
    if(kind==='signature')changed=applySignatureMatte(pixels.data,width,height,model);
    if(!changed)changed=applyEdgeBackgroundRemoval(pixels.data,width,height,model,kind);
  }
  if(changed)context.putImageData(pixels,0,0);
  return cropTransparentCanvas(canvas,pixels);
}

export async function cleanImageDataUrl(src:string,kind:CompanyAssetKind='generic'):Promise<string>{
  if(!src||!src.startsWith('data:image/'))return src;
  try{return await normalizeImage(src,kind);}catch{return src;}
}

export async function fileToDataUrl(file:File,maxBytes=4*1024*1024,kind:CompanyAssetKind='generic'):Promise<string>{
  if(file.size>maxBytes)throw new Error('Image is too large. Please use a file smaller than 4 MB.');
  if(!/^image\/(png|webp|jpeg|svg\+xml)$/i.test(file.type))throw new Error('Use PNG, WebP, JPEG, or SVG image files.');
  const src=await readFileAsDataUrl(file);
  return cleanImageDataUrl(src,kind);
}
