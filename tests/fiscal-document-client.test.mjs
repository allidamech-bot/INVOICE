import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fiscalQaInvoice,fiscalDocumentNextAction,validateFiscalDocumentState} from '../dist/src/lib/fiscal-document-client.js';
const doc={id:'draft',revision:1,kind:'invoice',companySnapshot:{country:'SA',vatNumber:'300000000000003'}};
const base={environment:'simulation',documentId:'draft',documentRevision:1,status:'not-reviewed',version:null,response:null,artifacts:{xml:false,pdf:false},capabilities:{review:true,approval:true,preparation:false,submission:false,recovery:false,reconciliation:false}};
test('fiscal dialog follows authoritative state, refuses automatic retries and cannot activate production',()=>{
 assert.equal(fiscalQaInvoice(doc),false);
 assert.equal(fiscalDocumentNextAction(validateFiscalDocumentState(base,doc)),'review');
 assert.equal(fiscalDocumentNextAction({...base,status:'reviewed'}),'approve');
 assert.equal(fiscalDocumentNextAction({...base,status:'approved'}),null);
 for(const status of ['uncertain','submitting','retryable','rejected','cleared','reported'])assert.equal(fiscalDocumentNextAction({...base,status,version:3,capabilities:{...base.capabilities,submission:true}}),null);
 assert.throws(()=>validateFiscalDocumentState({...base,documentRevision:2},doc));
 assert.throws(()=>validateFiscalDocumentState({...base,environment:'production'},doc));
});
test('editor routes the QA issue confirmation before commercial finalization, and App blocks duplicate commercial output',async()=>{
 const core=await readFile('src/components/EditorPageCore.tsx','utf8'),app=await readFile('src/app/App.tsx','utf8');
 assert.match(core,/if\(fiscalQaInvoice\(this.state.doc\)\)[\s\S]*?fiscalOpen:true[\s\S]*?const finalDoc=/);
 assert.match(app,/doc.status==='final'&&\(fiscalQaInvoice\(doc\)/);
 assert.match(app,/private requestPrint=async[\s\S]*?if\(fiscalQaInvoice\(doc\)\)throw/);
 assert.match(app,/private publishFiscalDraft=async[\s\S]*?remote.meta.chunkStorage!=='period-generations-v1'/);
});
test('interrupted response recovery and reconciliation are distinct from submission',()=>{
 const response={mode:'reporting',updatedAt:'2026-11-18T10:00:00.000Z',reportingDeadline:'2026-11-19T10:00:00.000Z',overdue:false,hasReceipt:false,recoveryAvailable:true,acceptedWithWarnings:false,response:null};
 const state={...base,status:'submitting',version:2,response,capabilities:{...base.capabilities,recovery:true,submission:true}};
 assert.equal(fiscalDocumentNextAction(validateFiscalDocumentState(state,doc)),'recover');
 const receipt={httpStatus:400,kind:'validation-errors',warningCount:0,errorCount:1,warningCodes:[],errorCodes:['BR-KSA-01']};
 const held={...state,status:'uncertain',version:3,response:{...response,hasReceipt:true,recoveryAvailable:false,response:receipt},capabilities:{...base.capabilities,reconciliation:true}};
 assert.equal(fiscalDocumentNextAction(validateFiscalDocumentState(held,doc)),'reconcile');
 assert.throws(()=>validateFiscalDocumentState({...held,response:{...held.response,response:{...receipt,errorCodes:['<script>']}}},doc));
 assert.equal(fiscalDocumentNextAction({...held,capabilities:{...held.capabilities,reconciliation:false}}),null);
});

test('only verified terminal artifacts are downloadable',()=>{assert.throws(()=>validateFiscalDocumentState({...base,artifacts:{xml:true,pdf:true}},doc));assert.throws(()=>validateFiscalDocumentState({...base,artifacts:{xml:false,pdf:true}},doc));});
