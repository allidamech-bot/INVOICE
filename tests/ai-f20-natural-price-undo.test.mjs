import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,stageKernelArtifact,reviseKernelDraft} from '../dist/src/lib/ai-conversation-kernel.js';
import {applyWorkspaceCommand,workspaceDocument,workspaceDrafting} from '../dist/src/lib/ai-workspace-model.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f20'};
function fixture(){
 const vault=emptyVault(),kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,{capability:'document.createDraft',kind:'proforma',
  customerId:'',customerDraft:{companyNameEn:'QA Buyer',companyNameAr:''},
  currency:'USD',language:'bilingual',items:[
   {savedItemId:'',descriptionEn:'Item A',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'10'},
   {savedItemId:'',descriptionEn:'Item B',descriptionAr:'',quantity:'1',unit:'CTN',unitPrice:'15'}
  ],incoterm:'FOB',paymentTerms:'Advance',deliveryTime:'',validity:'',remarks:'',notes:'',
  label:'F20',rationale:'Regression'});
 return{vault,kernel};
}
function edit(vault,kernel,value){
 applyWorkspaceCommand(kernel,vault,{kind:'cell',artifactId:kernel.artifact.id,revision:kernel.artifact.revision,
  lineId:kernel.artifact.lineIds[0],field:'unitPrice',value});
}
const revise=(vault,kernel,message,language='ar')=>reviseKernelDraft(kernel,kernel.artifact.proposal,message,workspaceDrafting(vault),language);

test('F20 Arabic natural price undo restores only exact recorded previous line and preserves terms',()=>{
 const {vault,kernel}=fixture(),originalVault=structuredClone(vault);
 edit(vault,kernel,'12');
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'39.00');
 const correction=revise(vault,kernel,'تراجع… أعد السعر إلى 10');
 assert.equal(correction.changed,true);
 assert.equal(kernel.artifact.proposal.items[0].unitPrice,'10');
 assert.equal(kernel.artifact.proposal.items[1].unitPrice,'15');
 assert.equal(kernel.artifact.proposal.paymentTerms,'Advance');
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'35.00');
 assert.deepEqual(vault,originalVault);
 assert.equal(revise(vault,kernel,'redo').changed,true);
 assert.equal(kernel.artifact.proposal.items[0].unitPrice,'12');
});
test('F20 wrong old amount or wrong currency refuses undo without mutation',()=>{
 const {vault,kernel}=fixture();
 edit(vault,kernel,'12');
 for(const message of ['تراجع، أعد السعر إلى 11','تراجع، أعد السعر إلى 10 EUR']){
  const before=structuredClone(kernel),result=revise(vault,kernel,message);
  assert.equal(result.changed,false,message);
  assert.deepEqual(kernel,before,'failed natural undo must not consume history');
 }
 assert.equal(kernel.artifact.proposal.items[0].unitPrice,'12');
 assert.equal(revise(vault,kernel,'تراجع، أعد السعر إلى 10 USD').changed,true);
});
test('F20 no prior exact price edit cannot revert a guessed line',()=>{
 const {vault,kernel}=fixture();
 const before=structuredClone(kernel),result=revise(vault,kernel,'تراجع… أعد السعر إلى 10');
 assert.equal(result.changed,false);
 assert.deepEqual(kernel,before);
});
test('F20 exact English undo is allowed but unrelated or multi-operation instructions do not match',async()=>{
 const {vault,kernel}=fixture();
 edit(vault,kernel,'12');
 assert.equal(revise(vault,kernel,'undo, restore price to 10','en').changed,true);
 const source=await readFile(new URL('../src/lib/ai-intelligence-runtime.ts',import.meta.url),'utf8');
 const row=source.split('\n').find(line=>line.includes('const exactDraftFollowup='));
 assert.ok(row);
 const literal=row.slice(row.indexOf('=')+1,row.lastIndexOf('.test(message);'));
 const canRevise=Function('message','return '+literal+'.test(message);');
 assert.equal(canRevise('تراجع… أعد السعر إلى 10'),true);
 assert.equal(canRevise('undo, restore price to 10'),true);
 assert.equal(canRevise('تراجع، أعد السعر إلى 10 ثم احفظ الفاتورة'),false);
 assert.equal(canRevise('اعتمد النسخة'),false);
 assert.match(source,/reviseKernelDraft\(next,original,message,drafting,requestLanguage\)/);
});
