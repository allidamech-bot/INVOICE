import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('PDF stamp overlay keeps the contained artwork aspect ratio and bottom alignment',async()=>{
  const source=await readFile('public/ios-print-bridge.js','utf8');
  const start=source.indexOf('  const collectSharpMedia =');
  const end=source.indexOf('  const addSharpMedia =',start);
  const image={naturalWidth:150,naturalHeight:150,src:'data:image/png;base64,fixture',currentSrc:'',classList:{contains:()=>true},closest:()=>null,style:{setProperty(){}},getBoundingClientRect:()=>({left:40,top:60,width:120,height:90})};
  const page={getBoundingClientRect:()=>({left:0,top:0,width:794,height:1123}),querySelectorAll:()=>[image]};
  const assets=vm.runInNewContext(source.slice(start,end)+'collectSharpMedia(page)',{page,SHARP_MEDIA_SELECTOR:'.signature-image,.stamp-image',getComputedStyle:()=>({objectFit:'contain',objectPosition:'50% 100%'})});
  assert.ok(Math.abs(assets[0].w/assets[0].h-1)<.01,'a circular stamp must remain circular on A4');
  assert.ok(Math.abs(assets[0].x-55/794*210)<.01,'contained artwork is centered inside its image box');
  image.naturalWidth=300;image.naturalHeight=100;
  const wide=vm.runInNewContext(source.slice(start,end)+'collectSharpMedia(page)',{page,SHARP_MEDIA_SELECTOR:'.signature-image,.stamp-image',getComputedStyle:()=>({objectFit:'contain',objectPosition:'50% 100%'})});
  assert.ok(Math.abs(wide[0].y-110/1123*297)<.01,'wide artwork keeps its bottom-aligned vertical offset');
  assert.ok(Math.abs(wide[0].h-40/1123*297)<.01);
});
