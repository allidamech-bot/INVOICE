import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {newConversationKernel,stageKernelArtifact,composeKernelMemory,boundedKernelArtifactMemo,normalizeConversationKernel} from '../dist/src/lib/ai-conversation-kernel.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'memory84'};
function quote(count=84){
 return{capability:'document.createDraft',kind:'proforma',customerId:'',customerDraft:null,currency:'USD',language:'en',
  items:Array.from({length:count},(_,i)=>({savedItemId:'',descriptionEn:'Highly detailed product '+(i+1)+' '.repeat(8)+'Description '.repeat(12),descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'3.50'})),
  incoterm:'CIF',paymentTerms:'30 days',deliveryTime:'',validity:'',remarks:'Source data only',notes:'',label:'Local full quote',rationale:'Unsaved'};
}
test('F10 84 long lines are still present while provider memory exposes only an explicit sample',()=>{
 const k=newConversationKernel(scope);stageKernelArtifact(k,quote());
 const before=structuredClone(k);
 const recent=[{role:'user',text:'ما هو سعر الصنف 84؟'}];
 const output=composeKernelMemory(k,recent);
 assert.ok(output.length<36000,'transport context remains bounded');
 assert.match(output,/rowsNotIncludedInModel/);
 assert.match(output,/fullDataOwner/);
 assert.match(output,/quoteValuesAuthoritativeInModel":false/);
 const summary=boundedKernelArtifactMemo(k,recent);
 assert.equal(summary.count,84);
 assert.equal(summary.selectedLine[0].index,84);
 assert.equal(summary.selectedLine[0].item.unitPrice,'3.50');
 assert.equal(summary.sampleOnly.length,3);
 assert.equal(summary.rowsNotIncludedInModel,true);
 assert.equal(k.artifact.proposal.items.length,84);
 assert.deepEqual(k,before,'summary must NEVER mutate original state');
 const restored=normalizeConversationKernel(JSON.parse(JSON.stringify(k)),scope);
 assert.equal(restored.artifact.proposal.items.length,84);
});
test('F10 localized partial context never pretends to list every line',()=>{
 const k=newConversationKernel(scope);stageKernelArtifact(k,quote(120));
 const output=composeKernelMemory(k,[{role:'user',text:'How many items?'}]);
 assert.match(output,/rowsNotIncludedInModel/);
 assert.match(output,/"count":120/);
 assert.ok(!output.includes('Highly detailed product 55'));
 assert.ok(k.artifact.proposal.items.some(row=>row.descriptionEn.includes('product 55')));
 const snap=workspaceDocument(k,emptyVault(),'en');
 assert.equal(snap.rows.length,120);
});
test('F10 ordinary short drafts retain full exact provider context for safe existing behavior',()=>{
 const k=newConversationKernel(scope);stageKernelArtifact(k,quote(3));
 const text=composeKernelMemory(k,[{role:'user',text:'Check the third item'}]);
 assert.ok(text.includes('Highly detailed product 2'));
 assert.ok(text.includes('Highly detailed product 3'));
 assert.doesNotMatch(text,/rowsNotIncludedInModel/);
});
