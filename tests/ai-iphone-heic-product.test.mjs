import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const sample=(name,type='image/heic')=>new File([new Uint8Array([0,0,0,12,102,116,121,112])],name,{type,lastModified:42});
const jpegBytes=()=>new Uint8Array([255,216,255,224,1,1,1,255,217]);

test('iPhone photo helper recognizes HEIC/HEIF without classifying JPEG as HEIC',async()=>{
  const {isIphoneHeicPhoto:isHeic,jpegFromIphonePhoto:convert}=await import('../dist/src/lib/ai-iphone-photo.js');
  assert.equal(isHeic({name:'IMG_101.HEIC',type:''}),true);
  assert.equal(isHeic({name:'IMG_202.heif',type:'application/octet-stream'}),true);
  assert.equal(isHeic({name:'mislabeled',type:'image/heif'}),true);
  assert.equal(isHeic({name:'photo.jpeg',type:'image/jpeg'}),false);
  const jpg=new File([jpegBytes()],'sample.jpg',{type:'image/jpeg'});
  assert.equal(await convert(jpg),jpg,'existing JPEG is never recompressed or relabeled');
});

test('Safari-compatible native HEIC decode creates an actual bounded JPEG payload',async()=>{
  const {jpegFromIphonePhoto:convert}=await import('../dist/src/lib/ai-iphone-photo.js');
  const savedBitmap=globalThis.createImageBitmap,savedDocument=globalThis.document;
  let closed=false;const draws=[],requests=[];
  globalThis.createImageBitmap=async()=>({width:4032,height:3024,close(){closed=true}});
  globalThis.document={createElement:()=>({
    width:0,height:0,getContext(){return{set fillStyle(x){},fillRect(){},drawImage(_image,_x,_y,w,h){draws.push([w,h])}};},
    toBlob(callback,mime,quality){requests.push([mime,quality]);callback(new Blob([jpegBytes()],{type:'image/jpeg'}));}
  })};
  try{
    const converted=await convert(sample('Product scan.HEIC'));
    assert.equal(converted.name,'Product scan.jpg');
    assert.equal(converted.type,'image/jpeg');
    assert.equal(converted.lastModified,42);
    assert.equal(converted.size,jpegBytes().byteLength);
    assert.ok(draws[0][0]<=2600&&draws[0][1]<=2600);
    assert.deepEqual(requests,[['image/jpeg',0.88]]);
    assert.ok(closed,'decoded HEIC bitmap is released');
  }finally{if(savedBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=savedBitmap;if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
});

test('Oversized HEIC conversion retries smaller dimensions, but never submits excessive or fabricated JPEG',async()=>{
  const {jpegFromIphonePhoto:convert}=await import('../dist/src/lib/ai-iphone-photo.js');
  const savedBitmap=globalThis.createImageBitmap,savedDocument=globalThis.document;
  let encoded=0,closed=0;
  globalThis.createImageBitmap=async()=>({width:3600,height:2700,close(){closed++}});
  const widths=[];
  globalThis.document={createElement:()=>({
    width:0,height:0,getContext(){return{set fillStyle(x){},fillRect(){},drawImage(_image,_x,_y,w){widths.push(w)}};},
    toBlob(cb){encoded++;cb(new Blob([encoded===1?new Uint8Array(2_600_001):jpegBytes()],{type:'image/jpeg'}));}
  })};
  try{
    const output=await convert(sample('Product.heif'));
    assert.equal(output.type,'image/jpeg');
    assert.equal(encoded,2);
    assert.ok(widths[1]<widths[0],'second encode is smaller');
    assert.equal(closed,1);
  }finally{if(savedBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=savedBitmap;if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;}
});

test('Unsupported HEIC decoding and cancelled conversion reject rather than uploading mislabeled data',async()=>{
  const {jpegFromIphonePhoto:convert}=await import('../dist/src/lib/ai-iphone-photo.js');
  const savedBitmap=globalThis.createImageBitmap,savedImage=globalThis.Image;
  globalThis.createImageBitmap=undefined;globalThis.Image=undefined;
  try{
    await assert.rejects(convert(sample('Animated.HEIF','image/heif-sequence')),/multi-frame HEIC\/HEIF/);
    await assert.rejects(convert(sample('Unsupported.HEIC')),/HEIC decoding is not supported/);
    const abort=new AbortController();abort.abort();
    await assert.rejects(convert(sample('Cancelled.HEIC'),abort.signal),{name:'AbortError'});
  }finally{if(savedBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=savedBitmap;if(savedImage===undefined)delete globalThis.Image;else globalThis.Image=savedImage;}
});

test('Product AI uses a file-complete HEIC handoff rather than classifying just the first file',async()=>{
  const [workflow,review,bridge,converter]=await Promise.all([
    read('src/components/AiWorkflowTools.tsx'),
    read('src/components/ProductAiSourceReview.tsx'),
    read('public/lourex-ai-workflows.js'),
    read('src/lib/ai-iphone-photo.ts')
  ]);
  assert.match(workflow,/if\(this\.state\.forcedRoute==='product_list'\)\{/);
  assert.match(workflow,/pre-read only file\[0\]/);
  assert.match(workflow,/\.heic,\.heif,image\/heic,image\/heif/);
  assert.match(workflow,/multiple=\{this\.state\.forcedRoute==='product_list'\}/);
  assert.match(workflow,/setPendingSource\(route,file,route==='product_list'/);
  assert.match(bridge,/files:Array\.isArray\(pending\.files\)\?pending\.files:undefined/);
  assert.match(review,/sheets\.length>12/);
  assert.match(review,/spreadsheetSheetsAsText\(sheets,MAX_TEXT_CHARS\+1\)/);
  assert.match(review,/text\.length>MAX_TEXT_CHARS/);
  assert.match(review,/const sourceFile=isIphoneHeicPhoto\(file\)\?await jpegFromIphonePhoto\(file,controller\.signal\):file/);
  assert.match(review,/fileName:file\.name,mimeType,data:bytesToBase64\(await sourceFile\.arrayBuffer\(\)\)/);
  assert.match(converter,/canvas\.toBlob/);
  assert.match(converter,/AI_IPHONE_IMAGE_MAX_BYTES=2_600_000/);
  assert.doesNotMatch(converter,/fetch\(|axios|https:\/\//,'HEIC should be decoded on device, not sent to a third-party service');
});
