import test from 'node:test';
import assert from 'node:assert/strict';
import {bindR07SReadOnly,R07S_SOURCE_BINDING_ACTIVE}
  from '../../dist/src/ai-next/document-engine/grounded-source-bridge.js';
import {ingestDocument,SyntheticSourceRepository}
  from '../../dist/src/ai-next/document-engine/engine.js';
import {TextSourceAdapter,CsvSourceAdapter}
  from '../../dist/src/ai-next/document-engine/adapters.js';

const now='2026-10-31T12:00:00.000Z';
const enc=new TextEncoder();
const scope=(changes={})=>({
  ownerUid:'synthetic-owner',accountId:'synthetic-account',
  companyId:'synthetic-company',branchId:'synthetic-branch',
  threadId:'synthetic-thread',actorId:'synthetic-actor',
  role:'owner',scopeType:'business',authorizationVersion:1,...changes,
});
const intent=(ids,changes={})=>({
  schemaVersion:1,scope:scope(),intentId:'synthetic-intent',
  turnId:'synthetic-turn',action:'read_file',subjectRef:null,
  sourcePolicy:'uploaded_only',referencedSourceIds:ids,
  argumentFacts:[],unresolvedReferences:[],missingFields:[],
  contradictoryFields:[],executable:false,confidence:0,...changes,
});
const file=(id,format,text)=>({
  documentId:id,fileName:id+'.'+format,mimeType:'application/octet-stream',
  format,bytes:enc.encode(text),
});
const setup=async()=>{
  const objects=new SyntheticSourceRepository();
  const doc1=await ingestDocument({
    source:file('quotation-synthetic','text','عرض سعر: منتج 10 قطع بسعر 15 دولار\n'),
    scope:scope(),adapter:new TextSourceAdapter(),repository:objects,
    runId:'run-one',now,
  });
  const doc2=await ingestDocument({
    source:file('spreadsheet-synthetic','csv',
      'Description,Qty,Price\n"معجون, ١",10,\n"line\nwrapped",2,20\n'),
    scope:scope(),adapter:new CsvSourceAdapter(),repository:objects,
    runId:'run-two',now,
  });
  return {objects,doc1,doc2};
};
const bind=(o,ids=['quotation-synthetic'],runs=[o.doc1],changes={})=>
  bindR07SReadOnly({scope:scope(),intent:intent(ids),runs,
    objects:o.objects,maxEvidencePreview:10,...changes});
test('R07S remains disabled, independent from finance, inference and cloud',()=>{
  assert.equal(R07S_SOURCE_BINDING_ACTIVE,false);
});
test('valid R02 original bytes and coverage are available for review, not financial claims',async()=>{
  const o=await setup(),out=await bind(o);
  assert.equal(out.status,'review_only');
  assert.equal(out.originalBytesVerified,true);
  assert.equal(out.sourceCoverageComplete,true);
  assert.equal(out.canClaimCompleteDocumentAnswer,false);
  assert.equal(out.financialWriteAuthorized,false);
  assert.equal(out.sources.length,1);
  assert.equal(out.sources[0].needsReview,true);
  assert.ok(out.previews.length>=1);
  assert.ok(out.previews.every(p=>p.financialAuthority===false));
  assert.ok(out.previews.every(p=>p.sourceSha256===o.doc1.sourceSha256));
  assert.ok(out.previews.every(p=>p.provenanceStatus==='uncertain'));
});
test('multiple CSV and text attachments preserve original evidence/row locators',async()=>{
  const o=await setup();
  const ids=['quotation-synthetic','spreadsheet-synthetic'];
  const out=await bind(o,ids,[o.doc1,o.doc2],{maxEvidencePreview:200});
  assert.equal(out.status,'review_only');
  assert.deepEqual(out.requestedSourceIds,ids);
  assert.equal(out.sources.length,2);
  assert.equal(out.missingSourceIds.length,0);
  assert.ok(out.sources[1].totalSegments>=3);
  assert.ok(out.previews.some(p=>p.documentId==='spreadsheet-synthetic'&&p.rowId!==null));
  assert.ok(out.previews.some(p=>p.sheetName==='CSV'));
  assert.equal(out.financialWriteAuthorized,false);
});
test('unavailable reference never claims a complete file answer',async()=>{
  const o=await setup();
  const out=await bind(o,['quotation-synthetic','missing-source'],[o.doc1]);
  assert.equal(out.status,'blocked');
  assert.equal(out.sourceCoverageComplete,false);
  assert.equal(out.originalBytesVerified,false);
  assert.deepEqual(out.missingSourceIds,['missing-source']);
  assert.ok(out.warnings.includes('REQUESTED_SOURCE_NOT_FOUND'));
});
test('OCR/review-required segment cannot be labelled fully extracted',async()=>{
  const objects=new SyntheticSourceRepository();
  const adapter={
    format:'text',
    discover:async()=>({
      sourceFormat:'text',
      parts:[{segmentId:'part-one',pageNumber:1,sheetName:null,
        rowNumber:null,tableId:null}],
      expectedPageCount:1,expectedSheets:[],expectedTableRows:[],
    }),
    read:async()=>({
      text:'image scanned uncertain quantity 100',extractionMethod:'ocr',
      requiresReview:true,confidence:0.65,
    }),
  };
  const run=await ingestDocument({source:file('scanned','text','scan-image-fixture'),
    adapter,scope:scope(),repository:objects,runId:'scan-test',now});
  const out=await bindR07SReadOnly({
    scope:scope(),intent:intent(['scanned']),runs:[run],objects,
    maxEvidencePreview:10,
  });
  assert.equal(out.status,'incomplete');
  assert.equal(out.sourceCoverageComplete,false);
  assert.ok(out.warnings.some(w=>w.includes('SOURCE_INCOMPLETE')));
  assert.ok(out.previews.every(p=>p.extractionMethod==='ocr'));
});
test('tampered original binary is rejected even if metadata SHA appears valid',async()=>{
  const o=await setup(),original=o.objects;
  const fake={read:async(k,id)=>{
    const value=await original.read(k,id);
    if(value)value.bytes[0]^=0xff;
    return value;
  },store:async()=>{throw Error('unexpected-write');}};
  await assert.rejects(bind(o,undefined,undefined,{objects:fake}),
    /R07S_ORIGINAL_SOURCE_NOT_VERIFIED/);
});
test('foreign conversation scope is rejected before reading original bytes',async()=>{
  const o=await setup();
  let reads=0;
  const objects={read:async()=>{reads++;return null;},store:async()=>{}};
  await assert.rejects(bind(o,undefined,undefined,{
    scope:scope({threadId:'another-thread'}),objects,
  }),/R07S_INTENT_AUTHORITY_DENIED/);
  assert.equal(reads,0);
});
test('foreign document evidence is never emitted as an authenticated preview',async()=>{
  const o=await setup(),run=structuredClone(o.doc1);
  run.evidence[0].scope.companyId='foreign-company';
  await assert.rejects(bind(o,undefined,[run]),/R07S_UNTRUSTED_EVIDENCE/);
});
test('altered checkpoint and source revision mismatches fail closed',async()=>{
  const o=await setup(),run=structuredClone(o.doc1);
  run.checkpoint.sourceSha256='f'.repeat(64);
  await assert.rejects(bind(o,undefined,[run]),
    /R07S_SOURCE_RUN_INTEGRITY_FAILED/);
});
test('cross-file duplicate evidence identifier is refused',async()=>{
  const o=await setup(),a=structuredClone(o.doc1),b=structuredClone(o.doc2);
  b.evidence[0].evidenceId=a.evidence[0].evidenceId;
  await assert.rejects(bind(o,['quotation-synthetic','spreadsheet-synthetic'],
    [a,b]),/R07S_UNTRUSTED_EVIDENCE/);
});
test('unselected extra source in memory does not get silently included',async()=>{
  const o=await setup();
  await assert.rejects(bind(o,['quotation-synthetic'],[o.doc1,o.doc2]),
    /R07S_UNSELECTED_SOURCE_PRESENT/);
});
test('source excerpt cap announces both omitted evidence and text truncation',async()=>{
  const objects=new SyntheticSourceRepository();
  const run=await ingestDocument({
    source:file('large-source','text','X'.repeat(4800)),
    scope:scope(),adapter:new TextSourceAdapter(),
    repository:objects,runId:'large-source-run',now,
  });
  const out=await bindR07SReadOnly({
    scope:scope(),intent:intent(['large-source']),runs:[run],
    objects,maxEvidencePreview:1,
  });
  assert.equal(out.previews.length,1);
  assert.equal(out.previews[0].rawExcerpt.length,2000);
  assert.equal(out.previews[0].truncated,true);
  assert.ok(out.warnings.includes('INDIVIDUAL_EVIDENCE_EXCERPTS_TRUNCATED'));
  assert.equal(out.financialWriteAuthorized,false);
});
test('invalid policy, purported financial execution and unbounded requests are denied',async()=>{
  const o=await setup();
  await assert.rejects(bind(o,undefined,undefined,{
    intent:intent([], {sourcePolicy:'none',referencedSourceIds:[]}),
  }),/R07S_UNSUPPORTED_SOURCE_POLICY/);
  await assert.rejects(bind(o,undefined,undefined,{
    intent:intent(['quotation-synthetic'],{executable:true}),
  }),/R07S_INTENT_AUTHORITY_DENIED/);
  await assert.rejects(bind(o,undefined,undefined,{maxEvidencePreview:10000}),
    /R07S_INVALID_SOURCE_SET/);
});
