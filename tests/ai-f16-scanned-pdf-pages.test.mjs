import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cleanVisionPageAttachments,MAX_VISION_PDF_PAGES,MAX_VISION_PDF_BASE64_CHARS} from '../api/_ai/source-page-images.js';

const base64='/9j/'+ 'A'.repeat(100);
const page=(index,count,data=base64)=>({index,pageCount:count,mimeType:'image/jpeg',data});
test('F16 multi-page scanned PDF image requests preserve every page in source order',()=>{
 const all=[page(1,3),page(2,3),page(3,3)];
 const checked=cleanVisionPageAttachments({kind:'pages',fileName:'rfq.pdf',pages:all});
 assert.equal(checked.length,3);
 assert.deepEqual(checked.map(p=>p.fileName),['rfq.pdf (page 1 of 3)','rfq.pdf (page 2 of 3)','rfq.pdf (page 3 of 3)']);
 assert.equal(checked.every(p=>p.kind==='image'&&p.mimeType==='image/jpeg'),true);
 assert.equal(MAX_VISION_PDF_PAGES,3);
 assert.equal(MAX_VISION_PDF_BASE64_CHARS,2600000);
});
test('F16 OCR aborts partial/out-of-order PDF pages instead of silently omitting source rows',()=>{
 for(const pages of [[],[page(1,2)],[page(2,2),page(1,2)],[page(1,3),page(2,2)],
  Array.from({length:4},(_,i)=>page(i+1,4)),[page(1,1,'x'.repeat(120))],
  [page(1,1,'/9j/abc@&')],[{...page(1,1),mimeType:'image/png'}]]){
   assert.equal(cleanVisionPageAttachments({kind:'pages',pages}),null);
 }
});
test('F16 refuses oversized/malformed scanned images and never coerces them into normal text',()=>{
 assert.equal(cleanVisionPageAttachments({kind:'pages',pages:[page(1,1,'/9j/'+'A'.repeat(1_200_000))]}),null);
 assert.equal(cleanVisionPageAttachments({kind:'pages',pages:[page(1,3,'/9j/'+'A'.repeat(1_000_000)),page(2,3,'/9j/'+'A'.repeat(1_000_000)),page(3,3,'/9j/'+'A'.repeat(1_000_000))]}),null);
 assert.equal(cleanVisionPageAttachments({kind:'file',pages:[page(1,1)]}),null);
 assert.equal(cleanVisionPageAttachments({kind:'pages',pages:'not an array'}),null);
});
test('F16 all six authenticated extractors reuse one server-side ordered image-page validation',async()=>{
 for(const file of ['ai-inbox','quote-source-ai','customer-capture-ai','supplier-capture-ai','supplier-document-ai','product-source-ai']){
  const source=await readFile(new URL('../api/'+file+'.js',import.meta.url),'utf8');
  assert.match(source,/import \{cleanVisionPageAttachments\} from '\.\/_ai\/source-page-images\.js'/);
  assert.match(source,/const pageAttachments=cleanVisionPageAttachments\(body\)/);
  assert.match(source,/\(kind==='pages'&&!pageAttachments\)/);
  assert.match(source,/kind==='pages'\?pageAttachments:\[\]/);
  assert.match(source,/requireAiFirebaseAuth\(request,response\)/);
  assert.match(source,/sameOriginRequest\(request\)/);
 }
});
test('F16 client only emits complete image pages; large PDFs stay on native-document path',async()=>{
 const [reader,pdf]=await Promise.all([
  readFile(new URL('../src/lib/ai-conversation-attachments.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/lib/pdf-source.ts',import.meta.url),'utf8')]);
 assert.match(reader,/rasterScannedPdfPages\(file,signal\)/);
 assert.match(reader,/pageCount:rendered\.length/);
 assert.match(reader,/if\(total>2_600_000\)throw new Error\('SOURCE_INCOMPLETE/);
 assert.match(reader,/payload=\{kind:'pages',mimeType:'application\/pdf',pages\}/);
 assert.match(pdf,/if\(pdf\.numPages>3\)return null/);
 assert.match(pdf,/for\(let index=1;index<=pdf\.numPages;index\+\+\)/);
 assert.match(pdf,/if\(blobs\.length!==pdf\.numPages\)throw/);
 assert.match(pdf,/canvas\.toBlob\(resolve,'image\/jpeg'/);
 assert.match(pdf,/pdf\.destroy\(\)/);
});
