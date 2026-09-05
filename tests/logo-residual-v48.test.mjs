import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { repairLogoResidualPixels } from '../dist/src/lib/logo-repair.js';

function makeCanvas(width,height){return new Uint8ClampedArray(width*height*4);}
function paint(data,width,left,top,right,bottom,[r,g,b,a=255]){
  for(let y=top;y<=bottom;y+=1)for(let x=left;x<=right;x+=1){const i=(y*width+x)*4;data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=a;}
}
function alpha(data,width,x,y){return data[(y*width+x)*4+3];}

test('enhanced logo cleanup removes compact dark backdrop remnants without erasing coloured artwork',()=>{
  const width=120,height=120,data=makeCanvas(width,height);
  // Legacy helper remains covered as a fallback utility even though uploaded
  // company logos are no longer passed through it automatically.
  paint(data,width,64,24,92,73,[46,48,49,255]);
  paint(data,width,26,37,43,78,[34,35,35,255]);
  paint(data,width,44,34,78,36,[20,20,20,255]);
  paint(data,width,42,37,44,88,[20,20,20,255]);
  paint(data,width,45,37,61,69,[164,43,28,255]);
  paint(data,width,62,37,77,69,[28,74,112,255]);
  paint(data,width,45,70,77,87,[193,126,32,255]);

  const changed=repairLogoResidualPixels(data,width,height);
  assert.equal(changed,true);
  assert.equal(alpha(data,width,90,30),0,'right-side dark rectangle should be transparent');
  assert.equal(alpha(data,width,28,55),0,'left dark residual should be transparent');
  assert.equal(alpha(data,width,52,50),255,'red logo artwork must remain');
  assert.equal(alpha(data,width,70,50),255,'blue logo artwork must remain');
  assert.equal(alpha(data,width,60,80),255,'gold logo artwork must remain');
  assert.equal(alpha(data,width,50,35),255,'thin dark outline immediately around the coloured core must remain');
});

test('long thin dark wordmarks are not mistaken for compact residual background',()=>{
  const width=140,height=100,data=makeCanvas(width,height);
  paint(data,width,48,20,91,64,[170,50,35,255]);
  paint(data,width,20,76,119,79,[28,28,28,255]);
  repairLogoResidualPixels(data,width,height);
  assert.equal(alpha(data,width,60,77),255);
});

test('settings preserve uploaded and saved logos and expose explicit AI removal instead of automatic residual repair',async()=>{
  const [settings,sw]=await Promise.all([readFile('src/components/SettingsModal.tsx','utf8'),readFile('public/sw.js','utf8')]);
  assert.match(settings,/const original=await fileToRawDataUrl\(file\)/);
  assert.match(settings,/logoDataUrl:original/);
  assert.match(settings,/logoOriginalDataUrl=hasSavedLogo\?source\.logoDataUrl/);
  assert.match(settings,/AI Remove Background/);
  assert.match(settings,/rebuildLogoWithoutBackgroundDataUrl\(source\)/);
  assert.doesNotMatch(settings,/repairLogoDataUrl\(source\.logoDataUrl\)/);
  assert.doesNotMatch(settings,/repairLogoDataUrl\(firstPass\)/);
  assert.match(sw,/lourex-invoice-v\d+/);
  assert.match(sw,/src\/lib\/logo-repair\.js/);
});
