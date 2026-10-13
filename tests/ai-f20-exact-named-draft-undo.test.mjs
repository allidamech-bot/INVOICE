import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,normalizeConversationKernel,stageKernelArtifact,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDrafting,workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f20-named-lines'};
function fixture(items=[
 {savedItemId:'',descriptionEn:'QA SO Item',descriptionAr:'صنف اختبار',quantity:'2',unit:'CTN',unitPrice:'10'},
 {savedItemId:'',descriptionEn:'Monster 500 ml',descriptionAr:'مونستر',quantity:'3',unit:'CTN',unitPrice:'20'},
]){
 const vault=emptyVault(),kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,{capability:'document.createDraft',kind:'proforma',currency:'USD',language:'bilingual',
  customerId:'',customerDraft:{companyNameEn:'QA Buyer',companyNameAr:''},items,
  incoterm:'CIF',paymentTerms:'30 days',deliveryTime:'',validity:'',notes:'Source-backed terms',remarks:'',
  label:'Temporary quote',rationale:'Test only'});
 return{vault,kernel};
}
function revise({vault,kernel},message,language='ar'){
 return reviseKernelDraft(kernel,kernel.artifact.proposal,message,workspaceDrafting(vault),language);
}
test('F20 named line edit is exact, survives refresh, and changes only the intended price',()=>{
 const current=fixture(),before=structuredClone(current.vault);
 const unchanged=structuredClone(current.kernel.artifact.proposal);
 const result=revise(current,'غيّر سعر الصنف QA SO Item إلى 12');
 assert.equal(result.changed,true);
 assert.match(result.message,/تم تعديل المسودة/);
 const hydrated=normalizeConversationKernel(JSON.parse(JSON.stringify(current.kernel)),scope);
 assert.equal(hydrated.artifact.proposal.items[0].unitPrice,'12');
 assert.equal(hydrated.artifact.proposal.items[0].quantity,'2');
 assert.deepEqual(hydrated.artifact.proposal.items[1],unchanged.items[1]);
 assert.equal(hydrated.artifact.proposal.incoterm,'CIF');
 assert.equal(hydrated.artifact.proposal.notes,'Source-backed terms');
 assert.deepEqual(current.vault,before,'no generated financial save');
 assert.equal(workspaceDocument(hydrated,current.vault,'ar').subtotal,'84.00');
});
test('F20 natural Arabic undo with verified previous price is safe and restores exactly one revision',()=>{
 const current=fixture(),before=structuredClone(current.vault);
 assert.equal(revise(current,'غيّر سعر الصنف QA SO Item إلى 12').changed,true);
 const after=structuredClone(current.kernel),revision=current.kernel.artifact.revision;
 const wrong=revise(current,'تراجع… أعد السعر إلى 9');
 assert.equal(wrong.changed,false,'a guessed prior price must not be applied');
 assert.deepEqual(current.kernel,after);
 const correct=revise(current,'تراجع… أعد السعر إلى 10');
 assert.equal(correct.changed,true);
 assert.equal(current.kernel.artifact.revision,revision+1);
 assert.equal(current.kernel.artifact.proposal.items[0].unitPrice,'10');
 assert.equal(current.kernel.artifact.proposal.items[1].unitPrice,'20');
 assert.equal(workspaceDocument(current.kernel,current.vault,'en').subtotal,'80.00');
 assert.deepEqual(current.vault,before);
});
test('F20 ambiguous and partially matching product names cannot silently select a line',()=>{
 const duplicate=fixture([
 {savedItemId:'',descriptionEn:'QA SO Item',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'10'},
 {savedItemId:'',descriptionEn:'QA SO Item',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'20'},
 ]);
 const original=structuredClone(duplicate.kernel);
 const ambiguous=revise(duplicate,'غيّر سعر الصنف QA SO Item إلى 12');
 assert.equal(ambiguous.changed,false);
 assert.match(ambiguous.message,/multiple lines/);
 assert.deepEqual(duplicate.kernel,original);
 const current=fixture();
 const partial=revise(current,'غيّر سعر الصنف QA SO إلى 12');
 assert.equal(partial.changed,false);
 assert.match(partial.message,/not found/);
 assert.equal(current.kernel.artifact.proposal.items[0].unitPrice,'10');
});
test('F20 bilingual exact names, quantity, and explicit currency mismatch keep the source intact',()=>{
 const current=fixture(),before=structuredClone(current.vault);
 assert.equal(revise(current,'Change price item QA SO Item to 15','en').changed,true);
 assert.equal(current.kernel.artifact.proposal.items[0].unitPrice,'15');
 assert.equal(revise(current,'غيّر كمية الصنف مونستر إلى 4').changed,true);
 assert.equal(current.kernel.artifact.proposal.items[1].quantity,'4');
 const mismatch=revise(current,'غيّر سعر الصنف QA SO Item إلى 30 EUR');
 assert.equal(mismatch.changed,false);
 assert.equal(current.kernel.artifact.proposal.items[0].unitPrice,'15');
 assert.deepEqual(current.vault,before);
});
test('F20 runtime routes scoped edits before the generic planner and speaks request language',()=>{
 const source=readFileSync(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const start=source.indexOf('const exactDraftFollowup='),end=source.indexOf('// Exact edits must also work',start);
 assert.ok(start>=0&&end>start);
 const line=source.slice(start,end);
 assert.match(line,/سعر\|السعر\|كمية\|الكمية/);
 assert.match(source,/reviseKernelDraft\(next,original,message,drafting,requestLanguage\)/);
 assert.match(source,/text:requestLanguage==='ar'/);
 const revision=source.indexOf('const result=reviseKernelDraft('),ask=source.indexOf('await ask(raw);');
 assert.ok(revision>0&&revision<ask);
 assert.doesNotMatch(source.slice(start,ask),/mutateVaultSafely\(|saveDocument\(|postInvoice\(/);
});
