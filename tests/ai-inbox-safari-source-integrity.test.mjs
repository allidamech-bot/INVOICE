import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const {productAiSourceMime:resolveMime,verifyProductAiBinarySignature:verify}=
  await import('../dist/src/lib/ai-product-multi-source.js');
const file=(name,type,bytes)=>new File([new Uint8Array(bytes)],name,{type});

test('AI Inbox Safari Files uses extension fallback only for generic MIME',()=>{
  for(const [name,type,expected] of [
    ['quote.PDF','application/octet-stream','application/pdf'],
    ['scan.JPG','binary/octet-stream','image/jpeg'],
    ['scan.PNG','','image/png'],
    ['scan.WEBP','application/octet-stream','image/webp'],
    ['notes.TXT','application/octet-stream','text/plain']
  ])assert.equal(resolveMime({name,type}),expected,name);
  assert.equal(resolveMime({name:'invoice.pdf',type:'image/png'}),'image/png',
    'explicit conflicting types must not silently become PDF');
  assert.equal(resolveMime({name:'unknown.gif',type:'application/octet-stream'}),
    'application/octet-stream','unsupported extension must fail closed');
});

test('AI Inbox reuses production PDF/photo signature checks, rejecting fake bytes',async()=>{
  for(const [name,type,bytes] of [
    ['quote.pdf','application/pdf',[37,80,68,70,45,49,46,55]],
    ['photo.jpg','image/jpeg',[255,216,255,225,0,0]],
    ['scan.png','image/png',[137,80,78,71,13,10,26,10]],
    ['photo.webp','image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]]
  ])await assert.doesNotReject(verify(file(name,type,bytes),type),name);
  for(const [name,type,bytes] of [
    ['fake.pdf','application/pdf',[60,104,116,109,108,108]],
    ['fake.jpg','image/jpeg',[137,80,78,71,13,10,26,10]],
    ['fake.png','image/png',[255,216,255]],
    ['fake.webp','image/webp',[82,73,70,70,0,0,0,0,78,79,80,69]],
    ['empty.pdf','application/pdf',[]]
  ])await assert.rejects(verify(file(name,type,bytes),type),/SOURCE_INCOMPLETE/,name);
});

test('real AI Inbox source reader rejects bad MIME and bytes before PDF parse or provider payload',async()=>{
  const ui=await read('src/components/AiWorkflowTools.tsx');
  const start=ui.indexOf('async function sourcePayload(file:File):Promise<AiPayload>{');
  const end=ui.indexOf('async function postAi(',start);
  assert.ok(start>0&&end>start,'production reader exists');
  const payload=ui.slice(start,end);
  assert.ok(payload.includes('const mime=productAiSourceMime(file);'));
  assert.ok(payload.includes("name.endsWith('.pdf')&&mime!=='application/pdf'"));
  assert.ok(payload.includes("name.endsWith('.txt')){if(mime!=='text/plain')"));
  const checkPdf=payload.indexOf("await verifyInboxBinarySource(file,'application/pdf')");
  const parsePdf=payload.indexOf('await readablePdfText(file,MAX_TEXT_CHARS)');
  assert.ok(checkPdf>=0&&parsePdf>checkPdf,'verify PDF bytes before parsing');
  const checkImage=payload.indexOf('await verifyInboxBinarySource(file,mime)');
  const sendBytes=payload.indexOf("return{kind:'file',mimeType:mime");
  assert.ok(checkImage>=0&&sendBytes>checkImage,'verify image before base64/provider');
  const wrapper=ui.slice(ui.indexOf('async function verifyInboxBinarySource('),start);
  assert.ok(wrapper.includes('await verifyProductAiBinarySignature(file,mime)'));
  assert.ok(wrapper.includes('No AI request was sent'));
});
