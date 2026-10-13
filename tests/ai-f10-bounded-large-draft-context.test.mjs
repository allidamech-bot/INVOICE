import test from 'node:test';
import assert from 'node:assert/strict';
import {newConversationKernel,stageKernelArtifact,composeKernelMemory,normalizeConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f10'};
function draft(count){
 return {capability:'document.createDraft',kind:'proforma',customerId:'',customerDraft:{companyNameEn:'QA Buyer'},
  currency:'USD',language:'en',items:Array.from({length:count},(_,i)=>({
    descriptionEn:'Exact source description item '+String(i+1).padStart(3,'0')+' '+String(i).repeat(100),
    descriptionAr:'',savedItemId:'',quantity:'2',unit:'CTN',unitPrice:'3.50'
  })),incoterm:'CIF',paymentTerms:'30 days',deliveryTime:'14 days',validity:'30 days',remarks:'',notes:'',
  label:'Large quote',rationale:'Manual source'};
}
test('F10 model context is bounded for 120 lines while workspace keeps 120 complete source rows',()=>{
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft(120));
 const before=structuredClone(kernel);
 const text=composeKernelMemory(kernel,[{role:'user',text:'Continue the quote'}]);
 assert.ok(text.length<24000);
 assert.match(text,/providerExcerptIncomplete":true/);
 assert.match(text,/completeLinesInLocalWorkspace":true/);
 assert.match(text,/Never claim all document lines were read/);
 assert.match(text,/lineCount":120/);
 assert.match(text,/item 120/);
 assert.match(text,/item 001/);
 assert.doesNotMatch(text,/item 060/);
 assert.deepEqual(kernel,before);
 assert.equal(kernel.artifact.proposal.items.length,120);
 assert.equal(kernel.artifact.lineIds.length,120);
 const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(kernel)),scope);
 assert.equal(restored.artifact.proposal.items[59].descriptionEn, draft(120).items[59].descriptionEn);
 const vault=emptyVault();
 const doc=workspaceDocument(restored,vault,'en');
 assert.equal(doc.rows.length,120);
 assert.equal(doc.subtotal,'840.00');
 const pdf=prepareAiPdfPreview(restored,vault,'en');
 assert.equal(pdf.items.length,120);
 assert.deepEqual(vault.documents,[]);
});
test('F10 smaller drafts retain full provider source context instead of unnecessary excerpt',()=>{
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft(3));
 const text=composeKernelMemory(kernel,[]);
 assert.doesNotMatch(text,/providerExcerptIncomplete/);
 assert.match(text,/item 002/);
 assert.equal(kernel.artifact.proposal.items.length,3);
});
test('F10 restored 120-row draft uses same stable line IDs and does not require issuing invoice',()=>{
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,draft(120));
 const saved=JSON.parse(JSON.stringify(kernel)),restored=normalizeConversationKernel(saved,scope);
 assert.deepEqual(restored.artifact.lineIds,kernel.artifact.lineIds);
 assert.equal(restored.artifact.proposal.items[119].unitPrice,'3.50');
 assert.equal(restored.artifact.proposal.items.length,120);
});
