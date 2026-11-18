import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fiscalQaInvoice,fiscalDocumentNextAction,validateFiscalDocumentState} from '../dist/src/lib/fiscal-document-client.js';
const doc={id:'draft',revision:1,kind:'invoice',companySnapshot:{country:'SA',vatNumber:'300000000000003'}};
const base={environment:'simulation',documentId:'draft',documentRevision:1,status:'not-reviewed',version:null,capabilities:{review:true,approval:true,preparation:false,submission:false}};
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