import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sample=(name='IMG_001.HEIC',type='image/heic')=>new File([new Uint8Array([0,0,0,12,102,116,121,112])],name,{type,lastModified:42});
const jpegBytes=()=>new Uint8Array([255,216,255,224,0,1,255,217]);

test('General conversation exposes iPhone HEIC/HEIF in the existing attachment picker',async()=>{
  const {CONVERSATION_ATTACHMENT_ACCEPT:accept,validateConversationFiles}=await import('../dist/src/lib/ai-conversation-attachments.js');
  for(const token of ['.heic','.heif','image/heic','image/heif','.pdf','.xlsx'])assert.ok(accept.includes(token),token);
  const original=sample();
  assert.deepEqual(validateConversationFiles([original]),[original]);
  const source=await readFile(new URL('../src/lib/ai-conversation-attachments.ts',import.meta.url),'utf8');
  assert.match(source,/jpegFromIphonePhoto\(file,signal\)/,'one shared local converter, no duplicate HEIC decoder');
  assert.match(source,/conversationAttachmentPayload\(file,signal\)/,'abort propagates from analysis');
  assert.match(source,/fileName:boundedText\(file\.name,180\)/,'original source filename remains evidence');
});

test('General conversation converts an actual HEIC selection path to a verified JPEG payload on-device',async()=>{
  const {conversationAttachmentPayload}=await import('../dist/src/lib/ai-conversation-attachments.js');
  const original=sample('iPhone Arabic price list.HEIC');
  const oldBitmap=globalThis.createImageBitmap,oldDocument=globalThis.document;
  let closed=false,drawn=0;
  globalThis.createImageBitmap=async()=>({width:4032,height:3024,close(){closed=true;}});
  globalThis.document={createElement:()=>({
    getContext(){return{set fillStyle(v){},fillRect(){},drawImage(){drawn++;}};},
    toBlob(callback,type){assert.equal(type,'image/jpeg');callback(new Blob([jpegBytes()],{type:'image/jpeg'}));}
  })};
  try{
    const payload=await conversationAttachmentPayload(original);
    assert.equal(payload.kind,'file');
    assert.equal(payload.mimeType,'image/jpeg');
    assert.deepEqual([...Buffer.from(payload.data,'base64')],[...jpegBytes()]);
    assert.equal(original.name,'iPhone Arabic price list.HEIC');
    assert.equal(original.type,'image/heic');
    assert.equal(drawn,1);
    assert.equal(closed,true);
  }finally{
    if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
  }
});

test('General conversation rejects HEIC sequence, unsupported decode and cancelled selection instead of sending partial data',async()=>{
  const {conversationAttachmentPayload}=await import('../dist/src/lib/ai-conversation-attachments.js');
  const oldBitmap=globalThis.createImageBitmap,oldImage=globalThis.Image;
  globalThis.createImageBitmap=undefined;globalThis.Image=undefined;
  try{
    await assert.rejects(conversationAttachmentPayload(sample('sequence.HEIF','image/heif-sequence')),/multi-frame HEIC\/HEIF/);
    await assert.rejects(conversationAttachmentPayload(sample('unsupported.HEIC')),/HEIC decoding is not supported/);
    const abort=new AbortController();abort.abort();
    await assert.rejects(conversationAttachmentPayload(sample('cancelled.HEIC'),abort.signal),{name:'AbortError'});
  }finally{
    if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    if(oldImage===undefined)delete globalThis.Image;else globalThis.Image=oldImage;
  }
});

test('Existing JPEG conversation attachments pass unchanged without HEIC recompression',async()=>{
  const {conversationAttachmentPayload}=await import('../dist/src/lib/ai-conversation-attachments.js');
  const jpeg=new File([jpegBytes()],'existing-price-list.jpg',{type:'image/jpeg'});
  const payload=await conversationAttachmentPayload(jpeg);
  assert.equal(payload.kind,'file');
  assert.equal(payload.mimeType,'image/jpeg');
  assert.deepEqual([...Buffer.from(payload.data,'base64')],[...jpegBytes()]);
});
