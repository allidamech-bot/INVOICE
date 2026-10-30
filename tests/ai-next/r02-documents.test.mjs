import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ingestDocument,ingestBatch,sha256,sourceScopeKey,verifyAttachmentBatch,
  SyntheticSourceRepository,DocumentProcessingError,
} from '../../dist/src/ai-next/document-engine/engine.js';
import {
  CsvSourceAdapter,SpreadsheetSourceAdapter,PdfSourceAdapter,
  ImageSourceAdapter,TextSourceAdapter,parseCsvRows,normalizeArabicPersianNumerals,
} from '../../dist/src/ai-next/document-engine/adapters.js';
import {
  proposeEvidenceCorrection,classifyPriceToken,mayPromoteQuotePrice,
} from '../../dist/src/ai-next/document-engine/corrections.js';
import {validateCoreContract} from '../../dist/src/ai-next/domain/validation.js';

const now='2026-10-30T14:00:00.000Z';
const enc=new TextEncoder();
const scope=(other={})=>({
  ownerUid:'synthetic-owner',accountId:'test-account',companyId:'company-1',
  branchId:'branch-1',threadId:'conversation-1',actorId:'actor-1',
  role:'owner',scopeType:'business',authorizationVersion:1,...other,
});
const source=(documentId,format,text,fileName=documentId+'.'+format)=>({
  documentId,format,fileName,mimeType:'application/octet-stream',
  bytes:enc.encode(text),
});
const input=(s,adapter,repository=new SyntheticSourceRepository(),options={})=>({
  source:s,scope:scope(),adapter,repository,runId:'r-'+s.documentId,now,...options,
});
const pageText=i=>'Page '+i+': '+('Synthetic verifiable searchable invoice text row '+i+' ').repeat(8);
const fakePdf=(count,{scanned=[],failOnce=[]}={})=>{
  const errors=new Set(failOnce);
  const touched=[];
  const runtime={
    OPS:{paintImageXObject:9},
    getDocument:({data,isEvalSupported})=>{
      assert.equal(isEvalSupported,false);
      assert.equal(new TextDecoder().decode(data.slice(0,5)),'%PDF-');
      return {promise:Promise.resolve({
        numPages:count,
        async getPage(i){
          assert.ok(i>=1&&i<=count);
          return {
            async getTextContent(){
              touched.push(i);
              if(errors.delete(i))throw new Error('SYNTHETIC_PAGE_OUTAGE');
              return {items:[{str:scanned.includes(i)?'':pageText(i)}]};
            },
            async getOperatorList(){return {fnArray:scanned.includes(i)?[9]:[]};},
            cleanup(){},
          };
        },async destroy(){},
      })};
    },
  };
  return {runtime,touched,errors};
};
const pdfFile=(id)=>source(id,'pdf','%PDF-1.7\n%Synthetic parser injected; no network calls');

test('source byte SHA-256 is stable and original immutable bytes are independently preserved',async()=>{
  const s=source('note','text','أرقام ۱۲۳ و ٤٥٦');const original=Uint8Array.from(s.bytes);
  const repository=new SyntheticSourceRepository(),result=await ingestDocument(input(s,new TextSourceAdapter(),repository));
  assert.equal(result.sourceSha256,await sha256(original));
  assert.equal(result.coverage.status,'complete');
  const persisted=await repository.read(sourceScopeKey(scope()),s.documentId);
  assert.deepEqual(persisted.bytes,original);
  persisted.bytes.fill(0);s.bytes.fill(0);
  assert.deepEqual((await repository.read(sourceScopeKey(scope()),s.documentId)).bytes,original);
  assert.equal(result.financialDraftEligible,false);
});
test('source identity collision with different bytes is rejected, not silently overwritten',async()=>{
  const repository=new SyntheticSourceRepository(),adapter=new TextSourceAdapter();
  await ingestDocument(input(source('fixed','text','original'),adapter,repository));
  await assert.rejects(ingestDocument(input(source('fixed','text','replacement'),adapter,repository)),
    /SOURCE_REVISION_COLLISION/);
});
test('24,000+ character text is never truncated to legacy 12,000 prompt limit',async()=>{
  const original='مقدمة '+('منتج تجريبي 200 USD\n').repeat(1200);
  assert.ok(original.length>24000);
  const run=await ingestDocument(input(source('long','text',original),new TextSourceAdapter()));
  assert.equal(run.coverage.status,'complete');
  assert.equal(run.evidence.map(x=>x.rawValue).join(''),original);
  assert.ok(run.evidence.length>=2);
  assert.equal(run.financialDraftEligible,false);
});
test('35-page searchable PDF preserves all original page numbers and page evidence',async()=>{
  const {runtime,touched}=fakePdf(35);
  const run=await ingestDocument(input(pdfFile('pdf35'),new PdfSourceAdapter(runtime)));
  assert.equal(run.coverage.status,'complete');
  assert.equal(run.coverage.expectedPageCount,35);
  assert.equal(run.coverage.observedPageCount,35);
  assert.equal(run.coverage.perSegment.length,35);
  assert.deepEqual(touched,Array.from({length:35},(_,i)=>i+1));
  assert.deepEqual(run.evidence.map(e=>e.locator.pageNumber),
    Array.from({length:35},(_,i)=>i+1));
  assert.ok(run.evidence[34].rawValue.includes('Page 35'));
});
test('8 scanned pages require review even when authorized OCR adapter returns text',async()=>{
  const calls=[],f=fakePdf(8,{scanned:[1,2,3,4,5,6,7,8]});
  const ocr=async({pageNumber})=>{
    calls.push(pageNumber);
    return {text:'Recognized page '+pageNumber+' synthetic table row '+pageNumber,confidence:.8};
  };
  const run=await ingestDocument(input(pdfFile('scan8'),new PdfSourceAdapter(f.runtime,ocr)));
  assert.deepEqual(calls,[1,2,3,4,5,6,7,8]);
  assert.equal(run.coverage.status,'needs_review');
  assert.equal(run.coverage.expectedPageCount,8);
  assert.equal(run.coverage.observedPageCount,8);
  assert.equal(run.evidence.length,8);
  assert.ok(run.evidence.every(e=>e.extractionMethod==='ocr'&&e.provenanceStatus==='uncertain'));
  assert.equal(run.financialDraftEligible,false);
});
test('unconfigured OCR explicitly blocks every scanned page, rather than masking source failure',async()=>{
  const f=fakePdf(8,{scanned:[1,2,3,4,5,6,7,8]});
  const run=await ingestDocument(input(pdfFile('scanblocked'),new PdfSourceAdapter(f.runtime)));
  assert.equal(run.coverage.status,'blocked');
  assert.equal(run.coverage.unprocessedSegments.length,8);
  assert.ok(run.coverage.blockers.every(s=>s.includes('OCR_NOT_CONFIGURED')));
  assert.equal(run.evidence.length,0);
});
test('mixed searchable and unreadable scan reports explicit partial coverage with affected pages',async()=>{
  const f=fakePdf(4,{scanned:[2,4]});
  const run=await ingestDocument(input(pdfFile('mixed'),new PdfSourceAdapter(f.runtime)));
  assert.equal(run.coverage.status,'partial');
  assert.deepEqual(run.coverage.unprocessedSegments,['page:2','page:4']);
  assert.deepEqual(run.evidence.map(e=>e.locator.pageNumber),[1,3]);
  assert.equal(run.financialDraftEligible,false);
});
test('recovery processes only failed segments; preserves previous successful evidence',async()=>{
  const f=fakePdf(4,{failOnce:[2]});const s=pdfFile('retry');
  const store=new SyntheticSourceRepository(),adapter=new PdfSourceAdapter(f.runtime);
  const first=await ingestDocument(input(s,adapter,store));
  assert.equal(first.coverage.status,'partial');
  assert.deepEqual(first.coverage.unprocessedSegments,['page:2']);
  const second=await ingestDocument(input(s,adapter,store,{checkpoint:first.checkpoint}));
  assert.equal(second.coverage.status,'complete');
  assert.deepEqual(second.evidence.map(e=>e.locator.pageNumber),[1,2,3,4]);
  assert.deepEqual(f.touched,[1,2,3,4,2]);
});
test('tampered checkpoint scope or source bytes cannot be resumed',async()=>{
  const s=source('checkpoint','text','safe synthetic document');
  const store=new SyntheticSourceRepository(),adapter=new TextSourceAdapter();
  const result=await ingestDocument(input(s,adapter,store));
  await assert.rejects(ingestDocument(input(s,adapter,store,{
    checkpoint:{...result.checkpoint,scopeKey:'foreign'}})),/CHECKPOINT_SCOPE_OR_MANIFEST_MISMATCH/);
  await assert.rejects(ingestDocument(input(s,adapter,store,{
    scope:scope({companyId:'foreign'}),
    checkpoint:result.checkpoint})),/CHECKPOINT_SCOPE_OR_MANIFEST_MISMATCH/);
});
test('CSV preserves all physical row indices, blank rows, repeated products and quoted multiline fields',async()=>{
  const csv='name,quantity,price\r\nTea,2,\r\n\r\nTea,3,50\r\n"Arabic\nTea",4,20';
  const s=source('csvrows','csv',csv);
  const run=await ingestDocument(input(s,new CsvSourceAdapter()));
  assert.equal(run.coverage.status,'complete');
  assert.equal(run.coverage.expectedTableRows[0].count,5);
  assert.equal(run.coverage.observedTableRows[0].count,5);
  assert.ok(run.evidence.some(e=>e.locator.rowId==='csv:row:3'));
  assert.equal(run.evidence.filter(e=>e.locator.cellReference==='A2')[0].rawValue,'Tea');
  assert.equal(run.evidence.filter(e=>e.locator.cellReference==='A4')[0].rawValue,'Tea');
  assert.equal(run.evidence.find(e=>e.locator.cellReference==='A5').rawValue,'Arabic\nTea');
  assert.equal(run.evidence.find(e=>e.locator.cellReference==='C2').rawValue,'');
});
test('CSV rejects ambiguous quotes rather than returning plausible incomplete rows',async()=>{
  assert.throws(()=>parseCsvRows('a,"b\nc'),/MALFORMED_CSV_UNCLOSED_QUOTE/);
  assert.throws(()=>parseCsvRows('a,"b"x,c'),/MALFORMED_CSV_AFTER_QUOTE/);
  assert.deepEqual(parseCsvRows('a,b\r\n\r\nc,d'),[['a','b'],[''],['c','d']]);
});
test('XLSX fake workbook adapter retains original physical positions and source-only formula text',async()=>{
  const fake={
    read:()=>({SheetNames:['Quotes','Prices'],
      Sheets:{
        Quotes:{'!ref':'B5:C7',B5:{v:'sku'},C5:{v:'sale'},B6:{v:'Tea'},C6:{f:'1+2'},B7:{v:'Tea'}},
        Prices:{'!ref':'A1:B2',A1:{v:'cost'},B1:{v:5},A2:{v:'unknown'},B2:{v:''}},
      }}),
    utils:{decode_range:ref=>{
      const m=ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      const col=str=>[...str].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;
      return {s:{r:Number(m[2])-1,c:col(m[1])},e:{r:Number(m[4])-1,c:col(m[3])}};
    }},
  };
  const adapter=new SpreadsheetSourceAdapter(fake,'xlsx');
  const s={...source('xlsx','xlsx','some zipped bytes'),bytes:Uint8Array.from([80,75,3,4,1,2])};
  const run=await ingestDocument(input(s,adapter));
  assert.equal(run.coverage.status,'complete');
  assert.deepEqual(run.coverage.expectedSheets,['Quotes','Prices']);
  assert.equal(run.coverage.expectedTableRows[0].count,3);
  assert.equal(run.coverage.expectedTableRows[1].count,2);
  assert.equal(run.evidence.find(e=>e.locator.sheetName==='Quotes'&&e.locator.cellReference==='C6').rawValue,'=1+2');
  assert.equal(run.evidence.filter(e=>e.locator.cellReference==='B6').length,1);
  assert.equal(run.evidence.find(e=>e.locator.sheetName==='Quotes'&&e.locator.cellReference==='B7').rawValue,'Tea');
});
test('workbook size and MIME signature protections fail closed without partial acceptance',async()=>{
  const fake={read:()=>({SheetNames:['S'],Sheets:{S:{'!ref':'A1:Z1000000'}}}),
    utils:{decode_range:()=>({s:{r:0,c:0},e:{r:999999,c:25}})}};
  const s={...source('oversize','xlsx','zip'),bytes:Uint8Array.from([80,75,3,4])};
  await assert.rejects(ingestDocument(input(s,new SpreadsheetSourceAdapter(fake))),
    /WORKBOOK_DIMENSIONS_EXCEED_LIMIT/);
  await assert.rejects(ingestDocument(input(source('bad','xlsx','notzip'),
    new SpreadsheetSourceAdapter(fake))),/INVALID_XLSX_SIGNATURE/);
});
test('ten attachments stay source-isolated with independent hashes, no substitution',async()=>{
  const files=Array.from({length:10},(_,i)=>source('source'+i,'text','Document '+i+' 400 items.'));
  const runs=await ingestBatch({files,scope:scope(),adapterFor:()=>new TextSourceAdapter(),
    repository:new SyntheticSourceRepository(),runId:'batch',now});
  assert.equal(runs.length,10);
  assert.equal(new Set(runs.map(x=>x.documentId)).size,10);
  assert.ok(runs.every(x=>x.status==='complete' && x.errorCode===null && x.result));
  assert.equal(new Set(runs.map(x=>x.result.sourceSha256)).size,10);
  assert.equal(new Set(runs.flatMap(x=>x.result.evidence.map(e=>e.documentId))).size,10);
  assert.ok(runs.every(x=>x.result.coverage.status==='complete'&&!x.result.financialDraftEligible));
  assert.throws(()=>verifyAttachmentBatch([...files,source('eleven','text','X')]),/INVALID_ATTACHMENT_COUNT/);
  assert.throws(()=>verifyAttachmentBatch([files[0],files[0]]),/DUPLICATE_DOCUMENT_ID/);
});
test('Arabic and Persian numbers normalize without changing original evidence',()=>{
  assert.equal(normalizeArabicPersianNumerals('١٢٣٫٤٥ / ۱۲۳٫۴۵'),'123.45 / 123.45');
  const price=classifyPriceToken('۳۵٫۵','CTN','USD');
  assert.equal(price.raw,'۳۵٫۵');
  assert.equal(price.normalizedNumerals,'35.5');
  assert.equal(price.status,'unverified_source_value');
  assert.equal(price.valid,true);
});
test('supplier purchasing price never becomes customer selling price automatically',()=>{
  const price=classifyPriceToken('25.00','CTN','USD');
  assert.equal(mayPromoteQuotePrice({sourceField:'supplier_cost',value:price,
    exactSellingUnit:'CTN',exactCurrency:'USD',explicitlyReviewed:true}),false);
  assert.equal(mayPromoteQuotePrice({sourceField:'selling_price',value:price,
    exactSellingUnit:'PCS',exactCurrency:'USD',explicitlyReviewed:true}),false);
  assert.equal(mayPromoteQuotePrice({sourceField:'selling_price',value:price,
    exactSellingUnit:'CTN',exactCurrency:'EUR',explicitlyReviewed:true}),false);
  assert.equal(mayPromoteQuotePrice({sourceField:'selling_price',value:price,
    exactSellingUnit:'CTN',exactCurrency:'USD',explicitlyReviewed:false}),false);
  assert.equal(mayPromoteQuotePrice({sourceField:'selling_price',value:price,
    exactSellingUnit:'CTN',exactCurrency:'USD',explicitlyReviewed:true}),true);
  assert.equal(classifyPriceToken('','PCS','USD').valid,false);
});
test('exact correction mapping preserves source row and requires separate explicit review',async()=>{
  const a=await ingestDocument(input(source('q1','csv','Tea,2\nTea,4'),new CsvSourceAdapter()));
  const b=await ingestDocument(input(source('q2','csv','Tea,3\nTea,4'),new CsvSourceAdapter()));
  const original=a.evidence.find(e=>e.locator.cellReference==='B1');
  const correction=b.evidence.find(e=>e.locator.cellReference==='B1');
  const review=proposeEvidenceCorrection(original,correction,{
    originalEvidenceId:original.evidenceId,correctionEvidenceId:correction.evidenceId,
    fieldName:'cell_text'});
  assert.equal(review.originalRawValue,'2');
  assert.equal(review.proposedRawValue,'3');
  assert.equal(review.financialWriteAuthorized,false);
  assert.equal(review.status,'needs_review');
  assert.throws(()=>proposeEvidenceCorrection(original,correction,{
    originalEvidenceId:original.evidenceId,correctionEvidenceId:'other',fieldName:'cell_text'}),
    /CORRECTION_REFERENCE_MISMATCH/);
  assert.throws(()=>proposeEvidenceCorrection(original,{...correction,scope:scope({companyId:'other'})},{
    originalEvidenceId:original.evidenceId,correctionEvidenceId:correction.evidenceId,
    fieldName:'cell_text'}),/CROSS_ACCOUNT_CORRECTION_DENIED/);
});
test('all document evidence and coverage validate against R01 contracts',async()=>{
  const run=await ingestDocument(input(source('schema','csv','SKU,price\nA,12\nB,'),new CsvSourceAdapter()));
  assert.equal(validateCoreContract('Coverage',run.coverage).ok,true);
  for(const evidence of run.evidence)
    assert.equal(validateCoreContract('DocumentEvidence',evidence).ok,true,evidence.evidenceId);
});
test('cancel during extraction identifies every cancelled page; preserves earlier evidence',async()=>{
  const abort=new AbortController();
  const f=fakePdf(4);
  const result=await ingestDocument(input(pdfFile('stop'),new PdfSourceAdapter(f.runtime),
    new SyntheticSourceRepository(),{
      signal:abort.signal,
      onObservedProgress:e=>{if(e.processedSegments===2)abort.abort();},
    }));
  assert.equal(result.coverage.status,'partial');
  assert.deepEqual(result.coverage.unprocessedSegments,['page:3','page:4']);
  assert.deepEqual(result.evidence.map(e=>e.locator.pageNumber),[1,2]);
});
test('image OCR is explicitly blocked unless injected; no hidden provider call',async()=>{
  const f={...source('photo','image',''),bytes:Uint8Array.from([255,216,255,0,1,2,3])};
  const blocked=await ingestDocument(input(f,new ImageSourceAdapter()));
  assert.equal(blocked.coverage.status,'blocked');
  assert.ok(blocked.coverage.blockers[0].includes('OCR_NOT_CONFIGURED'));
  const review=await ingestDocument(input(f,new ImageSourceAdapter(async()=>({text:'Synthetic scanned price 55',confidence:.6}))));
  assert.equal(review.coverage.status,'needs_review');
  assert.equal(review.evidence.length,1);
  assert.equal(review.financialDraftEligible,false);
});

test('one corrupt input in ten files cannot silently erase other nine file results',async()=>{
  const files=Array.from({length:10},(_,i)=>source('batch'+i,
    i===4?'image':'text',i===4?'corrupt-image-data':'Valid source '+i));
  const results=await ingestBatch({files,scope:scope(),
    adapterFor:format=>format==='image'?new ImageSourceAdapter():new TextSourceAdapter(),
    repository:new SyntheticSourceRepository(),runId:'ten',now});
  assert.equal(results.length,10);
  assert.equal(results.filter(x=>x.status==='complete').length,9);
  assert.equal(results[4].status,'blocked');
  assert.equal(results[4].errorCode,'INVALID_IMAGE_SIGNATURE');
  assert.deepEqual(results.map(x=>x.documentId),files.map(x=>x.documentId));
});
test('OCR service outage is classified per-page, with recovery not a fabricated complete result',async()=>{
  const f=fakePdf(3,{scanned:[2]});
  const run=await ingestDocument(input(pdfFile('provider-down'),new PdfSourceAdapter(
    f.runtime,async()=>{throw new Error('PROVIDER_OUTAGE');}
  )));
  assert.equal(run.coverage.status,'partial');
  assert.deepEqual(run.coverage.unprocessedSegments,['page:2']);
  assert.ok(run.coverage.blockers[0].includes('PROVIDER_OUTAGE'));
  assert.equal(run.financialDraftEligible,false);
});
test('plain-text chunks expose ordered segment IDs, not invented PDF page numbers',async()=>{
  const text='text '.repeat(7000);
  const run=await ingestDocument(input(source('segment-only','text',text),new TextSourceAdapter()));
  assert.equal(run.coverage.expectedPageCount,null);
  assert.equal(run.coverage.observedPageCount,null);
  assert.ok(run.coverage.perSegment.length>1);
  assert.ok(run.evidence.every(x=>x.locator.pageNumber===null));
  assert.deepEqual(run.evidence.map(x=>x.locator.segmentIndex),
    Array.from({length:run.evidence.length},(_,i)=>i));
  assert.equal(run.evidence.map(x=>x.rawValue).join(''),text);
});
test('a modifying injected parser cannot masquerade changed file as hashed original',async()=>{
  const s=source('malicious','text','original genuine content');
  const adapter={
    format:'text',
    async discover(){return {sourceFormat:'text',parts:[{segmentId:'chunk:1',
      pageNumber:null,sheetName:null,rowNumber:null,tableId:null}],
      expectedPageCount:null,expectedSheets:[],expectedTableRows:[]};},
    async read(file){file.bytes.fill(32);return {text:'fake',extractionMethod:'selectable_text'};}
  };
  await assert.rejects(ingestDocument(input(s,adapter)),/SOURCE_MUTATED_DURING_EXTRACTION/);
  assert.equal(new TextDecoder().decode(s.bytes),'original genuine content');
});
