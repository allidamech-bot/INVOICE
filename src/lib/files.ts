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

function isPaperPixel(data: Uint8ClampedArray,index:number):boolean{
  const red=data[index]??0;
  const green=data[index+1]??0;
  const blue=data[index+2]??0;
  const alpha=data[index+3]??0;
  const minimum=Math.min(red,green,blue);
  const maximum=Math.max(red,green,blue);
  return alpha>0&&maximum-minimum<36&&minimum>=210;
}

async function normalizeRasterImage(src: string): Promise<string> {
  const image = await loadImage(src);
  const maxDimension = 1400;
  const naturalWidth=image.naturalWidth||image.width;
  const naturalHeight=image.naturalHeight||image.height;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return src;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  const total=width*height;
  const visited=new Uint8Array(total);
  const queue=new Int32Array(total);
  let queueStart=0;
  let queueEnd=0;
  let paperBorder=0;
  let borderCount=0;

  const inspectBorder=(x:number,y:number):void=>{
    const pixel=y*width+x;
    const index=pixel*4;
    borderCount+=1;
    if(isPaperPixel(pixels.data,index)){
      paperBorder+=1;
      if(!visited[pixel]){visited[pixel]=1;queue[queueEnd++]=pixel;}
    }
  };
  for(let x=0;x<width;x+=1){inspectBorder(x,0);if(height>1)inspectBorder(x,height-1);}
  for(let y=1;y<height-1;y+=1){inspectBorder(0,y);if(width>1)inspectBorder(width-1,y);}

  // Only treat edge-connected near-white pixels as paper. This removes scanner/JPEG
  // backgrounds without erasing white artwork contained inside a logo or stamp.
  const removePaper=borderCount>0&&paperBorder/borderCount>=0.28;
  if(removePaper){
    while(queueStart<queueEnd){
      const pixel=queue[queueStart++]!;
      const x=pixel%width;
      const y=Math.floor(pixel/width);
      const index=pixel*4;
      const red=pixels.data[index]??0;
      const green=pixels.data[index+1]??0;
      const blue=pixels.data[index+2]??0;
      const minimum=Math.min(red,green,blue);
      const originalAlpha=pixels.data[index+3]??0;
      const paperStrength=Math.max(0,Math.min(1,(minimum-210)/35));
      pixels.data[index+3]=Math.round(originalAlpha*(1-paperStrength));

      const visit=(next:number):void=>{
        if(next<0||next>=total||visited[next])return;
        if(isPaperPixel(pixels.data,next*4)){visited[next]=1;queue[queueEnd++]=next;}
      };
      if(x>0)visit(pixel-1);
      if(x+1<width)visit(pixel+1);
      if(y>0)visit(pixel-width);
      if(y+1<height)visit(pixel+width);
    }
    context.putImageData(pixels, 0, 0);
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i + 3] ?? 0;
    if (alpha > 12) {
      const pixel = i / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return canvas.toDataURL('image/png');
  const padding = Math.max(4, Math.round(Math.min(width, height) * 0.025));
  const cropLeft = Math.max(0, left - padding);
  const cropTop = Math.max(0, top - padding);
  const cropRight = Math.min(width - 1, right + padding);
  const cropBottom = Math.min(height - 1, bottom + padding);
  const cropWidth = Math.max(1, cropRight - cropLeft + 1);
  const cropHeight = Math.max(1, cropBottom - cropTop + 1);

  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  const outputContext = output.getContext('2d');
  if (!outputContext) return canvas.toDataURL('image/png');
  outputContext.clearRect(0, 0, cropWidth, cropHeight);
  outputContext.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return output.toDataURL('image/png');
}

export async function fileToDataUrl(file: File, maxBytes = 4 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error('Image is too large. Please use a file smaller than 4 MB.');
  if (!/^image\/(png|webp|jpeg|svg\+xml)$/i.test(file.type)) throw new Error('Use PNG, WebP, JPEG, or SVG image files.');
  const src = await readFileAsDataUrl(file);
  if (/image\/svg\+xml/i.test(file.type)) return src;
  try { return await normalizeRasterImage(src); }
  catch { return src; }
}
