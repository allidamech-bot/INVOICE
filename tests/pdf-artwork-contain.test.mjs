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

test('PDF logo overlay is required and preserves the contained artwork rectangle',async()=>{
  const source=await readFile('public/ios-print-bridge.js','utf8');
  assert.match(source,/SHARP_MEDIA_SELECTOR = '[^']*\\.doc-logo img'/,'logo must be a sharp overlay, not only compressed JPEG');
  const start=source.indexOf('  const collectSharpMedia =');
  const end=source.indexOf('  const addSharpMedia =',start);
  const visibility=[];
  const image={
    naturalWidth:240,naturalHeight:72,src:'data:image/png;base64,fixture',currentSrc:'',
    classList:{contains:()=>false},
    closest:(selector)=>selector.includes('.doc-logo')?{}:null,
    style:{setProperty:(name,value)=>visibility.push([name,value])},
    getBoundingClientRect:()=>({left:40,top:60,width:60,height:60})
  };
  const page={getBoundingClientRect:()=>({left:0,top:0,width:794,height:1123}),querySelectorAll:()=>[image]};
  const assets=vm.runInNewContext(source.slice(start,end)+'collectSharpMedia(page)',{
    page,SHARP_MEDIA_SELECTOR:'.signature-image,.stamp-image,.doc-logo img',
    getComputedStyle:()=>({objectFit:'contain',objectPosition:'50% 100%'})
  });
  assert.equal(assets.length,1);
  assert.equal(assets[0].kind,'company logo');
  assert.equal(assets[0].required,true,'a shown logo may never silently disappear from PDF');
  assert.ok(Math.abs(assets[0].w/assets[0].h-240/72)<.01,'logo must not be stretched');
  assert.ok(Math.abs(assets[0].y-(102/1123*297))<.01,'bottom alignment must be preserved');
  assert.ok(visibility.some(([name,value])=>name==='visibility'&&value==='hidden'),'JPEG source must be hidden before sharp overlay');
});
