import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rebuildLogoTransparentPixels } from '../dist/src/lib/logo-rebuild.js';

function makeCanvas(width,height,[r,g,b,a]=[246,246,244,255]){
  const data=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p+=1){const i=p*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
  return data;
}
function paint(data,width,left,top,right,bottom,[r,g,b,a=255]){
  for(let y=top;y<=bottom;y+=1)for(let x=left;x<=right;x+=1){const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
}
function alpha(data,width,x,y){return data[(y*width+x)*4+3];}

test('deterministic rebuild helper removes opaque paper and broad dark residue while preserving the coloured mark and outline',()=>{
  const width=140,height=120,data=makeCanvas(width,height);
  paint(data,width,72,22,106,80,[43,45,46,255]);
  paint(data,width,43,34,82,37,[18,18,18,255]);
  paint(data,width,40,37,44,91,[18,18,18,255]);
  paint(data,width,81,37,84,91,[18,18,18,255]);
  paint(data,width,44,89,81,92,[18,18,18,255]);
  paint(data,width,45,38,62,67,[170,47,29,255]);
  paint(data,width,63,38,80,67,[25,73,111,255]);
  paint(data,width,45,68,80,88,[196,128,31,255]);

  const changed=rebuildLogoTransparentPixels(data,width,height);
  assert.equal(changed,true);
  assert.equal(alpha(data,width,5,5),0);
  assert.equal(alpha(data,width,101,30),0);
  assert.equal(alpha(data,width,52,50),255);
  assert.equal(alpha(data,width,72,50),255);
  assert.equal(alpha(data,width,60,78),255);
  assert.equal(alpha(data,width,50,35),255);
});

test('deterministic helper keeps nearby thin dark wordmark-like strokes but rejects broad neutral slabs',()=>{
  const width=160,height=120,data=makeCanvas(width,height,[0,0,0,0]);
  paint(data,width,55,22,104,65,[176,54,31,255]);
  paint(data,width,34,82,124,84,[24,24,24,255]);
  paint(data,width,105,20,142,62,[47,48,48,255]);
  rebuildLogoTransparentPixels(data,width,height);
  assert.equal(alpha(data,width,75,83),255);
  assert.equal(alpha(data,width,135,28),0);
});

test('AI logo workflow keeps the bounded touch editor available as a fallback utility',async()=>{
  const [settings,rebuild,css,sw]=await Promise.all([
    readFile('src/components/SettingsModal.tsx','utf8'),
    readFile('src/lib/logo-rebuild.ts','utf8'),
    readFile('src/styles/company-assets.css','utf8'),
    readFile('public/sw.js','utf8')
  ]);
  assert.match(settings,/AI Remove Background/);
  assert.match(settings,/إزالة الخلفية بالذكاء الاصطناعي/);
  assert.match(settings,/rebuildLogoWithoutBackgroundDataUrl\(source\)/);
  assert.match(rebuild,/openManualBackgroundEditor/);
  assert.match(rebuild,/const maxDimension=1024/);
  assert.match(rebuild,/historyLimit=pixelCount>750_000\?4:pixelCount>400_000\?6:8/);
  assert.doesNotMatch(rebuild,/history\.length>12/);
  assert.match(rebuild,/getImageData\(left,top,localWidth,localHeight\)/);
  assert.match(rebuild,/putImageData\(pixels,left,top\)/);
  assert.match(rebuild,/onpointercancel/);
  assert.match(rebuild,/releasePointerCapture/);
  assert.match(rebuild,/event\.key==='Escape'/);
  assert.match(rebuild,/The logo cannot be empty/);
  assert.match(rebuild,/floodAt/);
  assert.match(rebuild,/eraseAt/);
  assert.match(rebuild,/Undo/);
  assert.match(rebuild,/اعتماد هذا الشعار/);
  assert.match(rebuild,/finish\(crop\(canvas,pixels\)\)/);
  assert.match(css,/logo-touch-editor-overlay/);
  assert.match(css,/touch-action:none/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/src\/lib\/logo-rebuild\.js/);
});
