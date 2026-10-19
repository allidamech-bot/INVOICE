import { cleanImageDataUrl } from './files.js';

// Presentation-only derivatives: never rewrite a saved signature or stamp.
// Bounded caching also lets preview and print share the same prepared pixels.
const prepared=new Map<string,Promise<string>>();
export function signingPaper(accent:string):string{
  return '#'+accent.slice(1).match(/../g)!.map(part=>Math.round(parseInt(part,16)*.16+255*.84).toString(16).padStart(2,'0')).join('');
}
export function prepareSigningArtwork(source:string,kind:'signature'|'stamp',paper:string):Promise<string>{
  const key=kind+paper+source;const cached=prepared.get(key);if(cached)return cached;
  const result=render(source,kind,paper).catch(()=>source);
  if(prepared.size>=24)prepared.delete(prepared.keys().next().value!);
  prepared.set(key,result);return result;
}
async function render(source:string,kind:'signature'|'stamp',paper:string):Promise<string>{
  if(!source.startsWith('data:image/'))return source;
  const clean=await cleanImageDataUrl(source,kind);
  const image=new Image();image.src=clean;await image.decode();
  const scale=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight));
  const w=Math.max(1,Math.round(image.naturalWidth*scale)),h=Math.max(1,Math.round(image.naturalHeight*scale));
  const canvas=document.createElement('canvas');canvas.width=w+12;canvas.height=h+12;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return source;
  ctx.drawImage(image,6,6,w,h);
  if(kind==='signature'){
    // The original pen silhouette becomes light ink on dark paper, with no panel.
    ctx.globalCompositeOperation='source-in';ctx.fillStyle=paper;ctx.fillRect(0,0,canvas.width,canvas.height);
  }else{
    const width=canvas.width,height=canvas.height,pixels=ctx.getImageData(0,0,width,height);
    const outside=new Uint8Array(width*height),queue=new Int32Array(width*height);let head=0,tail=1;queue[0]=0;outside[0]=1;
    // Exterior flood fill preserves closed circles, ovals, rectangles and custom
    // contours. Open marks receive only a small halo, never a guessed rectangle.
    while(head<tail){const i=queue[head++]!,x=i%width,y=Math.floor(i/width);
      for(const n of [x>0?i-1:-1,x+1<width?i+1:-1,y>0?i-width:-1,y+1<height?i+width:-1]){
        if(n<0||outside[n]||(pixels.data[n*4+3]??0)>30)continue;
        outside[n]=1;queue[tail++]=n;
      }
    }
    const support=document.createElement('canvas');support.width=width;support.height=height;
    const backing=support.getContext('2d');if(!backing)return clean;
    const mask=backing.createImageData(width,height);const rgb=paper.slice(1).match(/../g)!.map(v=>parseInt(v,16));
    for(let i=0;i<outside.length;i++)if(!outside[i]){mask.data[i*4]=rgb[0]!;mask.data[i*4+1]=rgb[1]!;mask.data[i*4+2]=rgb[2]!;mask.data[i*4+3]=255;}
    backing.putImageData(mask,0,0);
    ctx.globalCompositeOperation='destination-over';
    for(const [x,y] of [[0,0],[-2,0],[2,0],[0,-2],[0,2]])ctx.drawImage(support,x!,y!);
  }
  return canvas.toDataURL('image/png');
}
