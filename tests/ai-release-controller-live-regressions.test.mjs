import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {currentSavedDraftQuantityEdit} from '../dist/src/lib/ai-commercial-conversation.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';
import {createAiToolRuntime,executeAiToolCall} from '../dist/src/lib/ai-tool-orchestrator.js';
import {formatAiDocumentEvidence,formatAiBusinessRecordReply} from '../dist/src/lib/ai-tool-presentation.js';
import {compiledReliabilityHarness} from './helpers/ai-reliability-runtime.mjs';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'release-review'};
const prompt='جهز تعديل عرض السعر الحالي: غيّر كمية الصنف إلى 12 مع إبقاء السعر 125 دولار والوحدة كرتون والصلاحية 14 يوماً من تاريخ الإصدار. اعرض التعديل للموافقة فقط ولا تحفظه.';
function fixture(){
 const vault=emptyVault(),doc=createBlankDocument('proforma','QA-RELEASE-20261018-01',vault.company);
 Object.assign(doc,{workspaceId:'default',branchId:'main',status:'draft',issueDate:'2026-10-18',dueDate:'2026-11-01',currency:'USD'});
 doc.items=[{...doc.items[0],id:'exact-line',descriptionEn:'QA carton sample',descriptionAr:'عينة كرتون',quantity:'10',unit:'Carton',unitPrice:'125'}];
 vault.documents=[doc];return{vault,doc,kernel:newConversationKernel(scope)};
}
test('live Arabic request prepares quantity and validity on the exact current line without saving',()=>{
 const {vault,doc,kernel}=fixture(),before=structuredClone(vault);
 const p=currentSavedDraftQuantityEdit(kernel,vault,prompt,doc.id);
 assert.deepEqual(p.itemEdits,[{itemId:'exact-line',quantity:'12'}]);
 assert.deepEqual(p.termsPatch,{validity:'14 days'});
 assert.deepEqual(reviewAiDocumentProposal(p,workspaceDrafting(vault,doc.id),'ar').blockers,[]);
 stageKernelArtifact(kernel,p);
 const preview=workspaceDocument(kernel,vault,'en');assert.equal(preview.subtotal,'1500.00');
 assert.equal(preview.rows[0].unitPrice,'125');assert.equal(preview.rows[0].unit,'Carton');
 assert.deepEqual(vault,before,'review must not mutate the saved document');
});
test('English and Arabic digits resolve the same explicit current-document quantity',()=>{
 const {vault,doc,kernel}=fixture();
 for(const message of ['Set item quantity to 12 keeping price 125 USD and unit Carton and validity 14 days from issue date, do not save',prompt.replace('12','١٢')]){
  const p=currentSavedDraftQuantityEdit(kernel,vault,message,doc.id);
  assert.deepEqual(p.itemEdits,[{itemId:'exact-line',quantity:'12'}]);
 }
});
test('ambiguous, foreign, final and preservation-mismatch drafts fail closed',()=>{
 const {vault,doc,kernel}=fixture();
 assert.equal(currentSavedDraftQuantityEdit(kernel,vault,prompt),null);
 for(const message of [prompt.replace('125 دولار','126 دولار'),prompt.replace('125 دولار','125 EUR'),prompt.replace('كرتون','قطعة'),prompt.replace('14 يوماً','0 يوماً'),prompt.replace('12 مع','0 مع')])
  assert.throws(()=>currentSavedDraftQuantityEdit(kernel,vault,message,doc.id));
 assert.equal(currentSavedDraftQuantityEdit(kernel,vault,'لا تغير كمية الصنف إلى 12',doc.id),null);
 doc.items.push({...doc.items[0],id:'second'});
 assert.throws(()=>currentSavedDraftQuantityEdit(kernel,vault,prompt,doc.id),/exact line number/);
 doc.items.pop();doc.status='final';assert.throws(()=>currentSavedDraftQuantityEdit(kernel,vault,prompt,doc.id),/active sales draft/);
 doc.status='draft';kernel.mode='advisor';assert.equal(currentSavedDraftQuantityEdit(kernel,vault,prompt,doc.id),null);
 kernel.mode='controller';doc.branchId='foreign';assert.throws(()=>currentSavedDraftQuantityEdit(kernel,vault,prompt,doc.id),/company and branch/);
});
test('installed runtime intercepts the live command before provider planning and keeps save separate',async()=>{
 const {vault,doc}=fixture(),before=structuredClone(vault);
 const {runtime,host}=await compiledReliabilityHarness(vault);
 const h=host();h.props={...h.props,screen:'editor',activeDocument:doc};let legacyCalls=0;
 h.ask=async()=>{legacyCalls++;};runtime.installIntelligenceRuntime(h);
 await h.ask(prompt);
 assert.equal(h.state.error,'');assert.equal(legacyCalls,0);
 assert.equal(h.__intelligenceKernel.artifact.proposal.itemEdits[0].quantity,'12');
 assert.equal(h.state.proposal,null,'preparation does not grant save approval');
 assert.deepEqual(vault,before);
});
test('real document.get evidence retains every requested financial field in the shipped answer formatter',()=>{
 const {vault,doc}=fixture();
 const result=executeAiToolCall(createAiToolRuntime(vault,{assistantRuntime:scope}),{id:'read',tool:'document.get',args:{documentId:doc.id},reason:'Review'});
 assert.equal(result.ok,true);
 const built=readFileSync('dist/src/components/AiCopilot.js','utf8');
 const start=built.indexOf('function __lourexNaturalizeToolAnswer('),end=built.indexOf('function __lourexToolActivityCard(',start);
 const context=vm.createContext({formatAiBusinessRecordReply,formatAiDocumentEvidence,__lourexCompactObject:()=>{throw Error('Document evidence fell into lossy compact formatter');},__lourexToolTitle:()=> 'Document'});
 vm.runInContext(built.slice(start,end),context);
 for(const language of ['ar','en']){
  const text=context.__lourexNaturalizeToolAnswer({results:[result]},language);
  for(const expected of ['QA-RELEASE-20261018-01','10','Carton','125','1,250','2026-10-18','2026-11-01'])
   assert.ok(text.replace(/1250/g,'1,250').includes(expected),expected+' missing from '+text);
  assert.match(text,language==='ar'?/عينة كرتون/:/QA carton sample/);
  assert.doesNotMatch(text,/حقول أخرى غير معروضة|additional fields not shown|exact-line/);
 }
});
test('document evidence discloses omitted lines and never treats truncated JSON as complete',()=>{
 const text=formatAiDocumentEvidence({number:'QA',items:[{descriptionEn:'Zero',quantity:'0',unit:'PCS',unitPrice:'0'}],itemCount:21,itemsTruncated:true,totals:{grandTotal:'0.00'},currency:'USD'},'en');
 assert.match(text,/Quantity: 0/);assert.match(text,/Unit price: 0/);assert.match(text,/item list is partial/);assert.match(text,/Grand total: 0.00/);
 assert.doesNotMatch(formatAiDocumentEvidence({truncated:true,preview:'UNVERIFIED'},'ar'),/UNVERIFIED/);
});
