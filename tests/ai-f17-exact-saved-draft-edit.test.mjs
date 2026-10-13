import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';
import {exactSavedDraftLineEdit} from '../dist/src/lib/ai-commercial-conversation.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f17-edit-existing'};
function fixture(){
 const vault=emptyVault(),doc=createBlankDocument('invoice','INV-2026-0001',vault.company);
 doc.workspaceId='default';doc.branchId='main';doc.status='draft';
 doc.items=[
  {id:'first-line',descriptionEn:'Red Bull 250 ml',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'10'},
  {id:'second-line',descriptionEn:'Monster 500 ml',descriptionAr:'',quantity:'3',unit:'CTN',unitPrice:'20'}
 ];
 vault.documents=[doc];
 return{vault,doc,kernel:newConversationKernel(scope)};
}
test('F17 exact visible invoice number creates review-only original draft update with no saved change',()=>{
 const {vault,doc,kernel}=fixture(),before=structuredClone(vault);
 const p=exactSavedDraftLineEdit(kernel,vault,'تعديل سعر أول سطر INV-2026-0001 إلى 12 مع عدم الحفظ');
 assert.equal(p?.capability,'document.updateDraft');
 assert.equal(p.documentId,doc.id);
 assert.deepEqual(p.itemEdits,[{itemId:'first-line',unitPrice:'12'}]);
 assert.equal(p.addItems.length,0);
 const review=reviewAiDocumentProposal(p,workspaceDrafting(vault,doc.id),'ar');
 assert.deepEqual(review.blockers,[]);
 assert.match(review.text,/INV-2026-0001/);
 assert.match(review.text,/12/);
 stageKernelArtifact(kernel,p);
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'84.00');
 assert.equal(vault.documents[0].items[0].unitPrice,'10');
 assert.deepEqual(vault,before);
});
test('F17 Arabic numeric ordinal and English edits have the same exact line and currency checks',()=>{
 const {vault,kernel}=fixture();
 const a=exactSavedDraftLineEdit(kernel,vault,'غيّر سعر السطر الثاني في الفاتورة رقم INV-2026-0001 إلى 21 USD دون حفظ');
 assert.deepEqual(a.itemEdits,[{itemId:'second-line',unitPrice:'21'}]);
 const e=exactSavedDraftLineEdit(kernel,vault,'Change price of line 2 in invoice INV-2026-0001 to 21 USD, do not save');
 assert.deepEqual(e.itemEdits,a.itemEdits);
 assert.throws(()=>exactSavedDraftLineEdit(kernel,vault,'غيّر سعر السطر الثاني في الفاتورة رقم INV-2026-0001 إلى 21 EUR'),/currency/);
});
test('F17 never substitutes ambiguous IDs, missing lines, final status or other branches',()=>{
 const {vault,doc,kernel}=fixture(),original=structuredClone(vault);
 const ask='عدل سعر أول سطر INV-2026-0001 إلى 12';
 for(const command of [
  'عدل سعر أول سطر INV-2026-0001 إلى 12 واحفظه الآن',
  'عدل سعر أول سطر INV-2026-0001 و INV-2026-9999 إلى 12',
  'عدل سعر ثالث سطر INV-2026-0001 إلى 12',
  'عدل سعر أول سطر INV-2026-9999 إلى 12',
  'عدل سعر أول سطر INV-2026-0001 إلى -12',
 ]){
  assert.throws(()=>exactSavedDraftLineEdit(kernel,vault,command),/exact line|exactly one|line does not|not found|amount|quantity|Give one/);
 }
 assert.deepEqual(vault,original,'unverified edits must not mutate vault');
 doc.status='final';assert.throws(()=>exactSavedDraftLineEdit(kernel,vault,ask),/Final or voided/);
 doc.status='draft';
 kernel.mode='advisor';assert.equal(exactSavedDraftLineEdit(kernel,vault,ask),null);
 kernel.mode='controller';kernel.scope.branchId='wrong';
 assert.equal(exactSavedDraftLineEdit(kernel,vault,ask),null);
});
test('F17 natural saved edit intercepts Controller before broad navigation and requires a separate approval',async()=>{
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const exact=source.indexOf('const savedLineEdit=currentConversationMode(host)');
 const nav=source.indexOf('const previewId=currentConversationMode(host)');
 assert.ok(exact>0&&nav>exact);
 assert.match(source,/exactSavedDraftLineEdit\(kernel,fresh\.vault,message\)/);
 assert.match(source,/if\(kernel\.artifact\)throw new Error/,'cannot overwrite an existing unsaved draft');
 assert.match(source,/stageKernelArtifact\(kernel,savedLineEdit\)/);
 assert.match(source,/proposal:null,review:null/,'no immediate save approval is granted');
 assert.match(source,/saving requires a separate approval/);
});
