import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rebuildLogoTransparentPixels } from '../dist/src/lib/logo-rebuild.js';

function make(width,height,[r,g,b,a]=[0,0,0,0]){
  const data=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p+=1){const i=p*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
  return data;
}
function paint(data,width,left,top,right,bottom,[r,g,b,a=255]){
  for(let y=top;y<=bottom;y+=1)for(let x=left;x<=right;x+=1){const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
}
function alpha(data,width,x,y){return data[(y*width+x)*4+3];}

test('subject isolation removes broad attached dark residue but keeps the central coloured mark and close dark outline',()=>{
  const width=180,height=150,data=make(width,height,[248,247,244,255]);
  paint(data,width,100,28,158,100,[42,43,43,255]);
  paint(data,width,49,40,111,43,[18,18,18,255]);
  paint(data,width,46,43,50,113,[18,18,18,255]);
  paint(data,width,110,43,114,113,[18,18,18,255]);
  paint(data,width,50,111,110,115,[18,18,18,255]);
  paint(data,width,51,44,79,77,[178,47,31,255]);
  paint(data,width,80,44,109,77,[25,76,116,255]);
  paint(data,width,51,78,109,110,[198,130,32,255]);
  paint(data,width,75,64,85,94,[30,30,30,255]);

  const changed=rebuildLogoTransparentPixels(data,width,height);
  assert.equal(changed,true);
  assert.equal(alpha(data,width,10,10),0);
  assert.equal(alpha(data,width,150,50),0);
  assert.equal(alpha(data,width,105,42),255);
  assert.equal(alpha(data,width,80,80),255);
});

test('v52 rebuild starts from subject isolation and automatic repair reuses the same subject helper',async()=>{
  const [rebuild,repair,sw]=await Promise.all([
    readFile('src/lib/logo-rebuild.ts','utf8'),
    readFile('src/lib/logo-repair.ts','utf8'),
    readFile('public/sw.js','utf8')
  ]);
  assert.match(rebuild,/Isolate central logo subject/);
  assert.match(rebuild,/rebuildLogoTransparentPixels\(prepared\.data,width,height\)/);
  assert.match(rebuild,/Subject isolated automatically/);
  assert.match(repair,/rebuildLogoTransparentPixels\(pixels\.data,width,height\)/);
  assert.match(sw,/lourex-invoice-v52/);
  assert.match(sw,/src\/lib\/logo-rebuild\.js/);
  assert.match(sw,/src\/lib\/logo-repair\.js/);
});
