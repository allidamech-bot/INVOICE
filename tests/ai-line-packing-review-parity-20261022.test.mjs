import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {reviseAiPendingDocumentDraft} from '../dist/src/lib/ai-document-conversation.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
import {assertAiDocumentCreateApproval,assertAiDocumentUpdateApproval} from '../dist/src/lib/ai-document-approval-guard.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'pack-line-qa'};
function fixture(){
 const vault=emptyVault();
 const customer={id:'pack-customer',workspaceId:'default',branchId:'main',companyNameEn:'QA Pack Customer',companyNameAr:'عميل التعبئة',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 vault.customers=[customer];
 const line={savedItemId:'',descriptionEn:'Strawberry dragee',descriptionAr:'دراجية فراولة',quantity:'12',unit:'CTN',unitPrice:'50'};
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:customer.id,customerDraft:null,currency:'SAR',language:'bilingual',items:[line],
  incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',label:'QA packing quote',rationale:'Explicit QA'};
 const context={customers:[{id:customer.id,name:customer.companyNameEn}],items:[],defaults:{currency:'SAR',language:'bilingual',incoterm:'',paymentTerms:'',deliveryTime:'',validity:''},activeDocument:null};
 const kernel=newConversationKernel(scope);
 stageKernelArtifact(kernel,proposal);
 return {vault,customer,proposal,context,kernel};
}

test('line-specific Arabic packing stages without converting price, units, count or saving',()=>{
 const {vault,proposal,context,kernel}=fixture();
 const before=structuredClone(vault),pBefore=structuredClone(proposal);
 const step=reviseAiPendingDocumentDraft(proposal,'غيّر تعبئة الصنف رقم ١ إلى كرتون ٦ علب × ٣ كيلو',context,'ar');
 assert.ok(step?.changed);
 assert.equal(step.proposal.items[0].packing,'كرتون ٦ علب × ٣ كيلو');
 for(const field of ['quantity','unit','unitPrice'])assert.equal(step.proposal.items[0][field],pBefore.items[0][field]);
 assert.deepEqual(proposal,pBefore,'revisions are copy-on-write');
 const view=reviewAiDocumentProposal(step.proposal,context,'ar');
 assert.deepEqual(view.blockers,[]);
 assert.match(view.text,/تعبئة الصنف: كرتون ٦ علب × ٣ كيلو/);
 assert.match(view.text,/600\.00 SAR/);
 kernel.artifact.proposal=step.proposal;
 const working=workspaceDocument(kernel,vault,'ar');
 assert.equal(working.rows[0].packing,'كرتون ٦ علب × ٣ كيلو');
 assert.equal(working.subtotal,'600.00');
 const preview=prepareAiPdfPreview(kernel,vault,'ar');
 assert.equal(preview.items[0].packing,'كرتون ٦ علب × ٣ كيلو');
 assert.equal(preview.appearance.showPacking,true,'an explicitly reviewed packing field must be visible on PDF');
 assert.equal(preview.items[0].quantity,'12');
 assert.equal(preview.items[0].unit,'CTN');
 assert.equal(preview.items[0].unitPrice,'50');
 assert.deepEqual(vault,before);
 assertAiDocumentCreateApproval(vault,step.proposal);
});

test('English line-specific packing and custom labeled packing on a newly added line',()=>{
 const {proposal,context}=fixture();
 const changed=reviseAiPendingDocumentDraft(proposal,'set packing item 1 to Outer carton: 6 bags of 3 kg',context,'en');
 assert.equal(changed.changed,true);
 assert.equal(changed.proposal.items[0].packing,'Outer carton: 6 bags of 3 kg');
 const added=reviseAiPendingDocumentDraft(changed.proposal,'add item: Mango sweets; quantity: 2; price: 9.50; unit: CTN; packing: 4 custom boxes / outer carton',context,'en');
 assert.equal(added.changed,true);
 assert.equal(added.proposal.items[1].packing,'4 custom boxes / outer carton');
 assert.match(reviewAiDocumentProposal(added.proposal,context,'en').text,/Line packing: 4 custom boxes/);
 assert.equal(added.proposal.items[1].quantity,'2');
});

test('invalid, missing, duplicate and out-of-range packing instructions are not staged',()=>{
 const {proposal,context}=fixture(),before=structuredClone(proposal);
 for(const prompt of [
   'set packing item 7 to 6 boxes',
   'set packing item 0 to 6 boxes',
   'set packing item 1 to '+('X'.repeat(121)),
   'add item: Other; quantity: 2; price: 3; packing: 5 boxes; packing: 9 boxes'
 ]){
   const result=reviseAiPendingDocumentDraft(proposal,prompt,context,'en');
   assert.ok(!result?.changed,prompt);
   assert.deepEqual(proposal,before);
 }
 const {vault}=fixture();
 assert.throws(()=>assertAiDocumentCreateApproval(vault,{...proposal,items:[{...proposal.items[0],packing:'X'.repeat(121)}]}),/packing/i);
 assert.throws(()=>assertAiDocumentCreateApproval(vault,{...proposal,items:[{...proposal.items[0],packing:'x\u0000y'}]}),/packing/i);
});

test('existing draft packing edit preserves identity and is previewed without a save',()=>{
 const {vault,customer,kernel,context}=fixture();
 const doc=createBlankDocument('proforma','PI-2026-PACK',vault.company);
 doc.status='draft';doc.workspaceId='default';doc.branchId='main';
 doc.customerSnapshot=customerSnapshotFrom(customer);
 doc.items=[{id:'existing-1',descriptionEn:'QA almonds',descriptionAr:'لوز',quantity:'3',unit:'CTN',unitPrice:'70',packing:'Old box',unitCost:'',origin:'',hsCode:''}];
 vault.documents=[doc];
 const update={capability:'document.updateDraft',documentId:doc.id,addItems:[],itemEdits:[],termsPatch:{},label:'QA review',rationale:''};
 const ctx={...context,activeDocument:{id:doc.id,number:doc.number,status:'draft',kind:'proforma',currency:'SAR',language:'bilingual',items:doc.items,terms:doc.terms}};
 const before=structuredClone(vault);
 const change=reviseAiPendingDocumentDraft(update,'غيّر تعبئة الصنف رقم 1 إلى كرتون داخل كرتون - ٢٤ علبة',ctx,'ar');
 assert.equal(change.changed,true);
 assert.deepEqual(change.proposal.itemEdits,[{itemId:'existing-1',packing:'كرتون داخل كرتون - ٢٤ علبة'}]);
 assert.match(reviewAiDocumentProposal(change.proposal,ctx,'ar').text,/كرتون داخل كرتون/);
 assertAiDocumentUpdateApproval(vault,change.proposal);
 stageKernelArtifact(kernel,change.proposal);
 const preview=prepareAiPdfPreview(kernel,vault,'ar');
 assert.equal(preview.items[0].packing,'كرتون داخل كرتون - ٢٤ علبة');
 assert.equal(preview.appearance.showPacking,true,'reviewed edits reveal packing even when the saved draft hid its column');
 assert.equal(preview.items[0].quantity,'3');
 assert.equal(preview.items[0].unitPrice,'70');
 assert.deepEqual(vault,before,'preview cannot persist edits');
 assert.throws(()=>assertAiDocumentUpdateApproval(vault,{...change.proposal,itemEdits:[{itemId:'existing-1',packing:'X'.repeat(121)}]}),/packing|oversized/i);
});

test('reviewed packing reaches existing guarded save path, not a direct side-effect',()=>{
 const source=readFileSync(new URL('../src/components/AiCopilot.tsx',import.meta.url),'utf8');
 assert.match(source,/if\(entry\.packing!==undefined\)line\.packing=entry\.packing/);
 assert.match(source,/packing:entry\.packing\|\|''/);
 assert.match(source,/edit\.packing!==undefined\?\{packing:edit\.packing\}/);
 assert.match(source,/proposal\.items\.some\(entry=>Boolean\(entry\.packing\?\.trim\(\)\)\)\)doc\.appearance=\{\.\.\.doc\.appearance,showPacking:true\}/);
 assert.match(source,/const explicitPacking=proposal\.addItems\.some/);
 assert.match(source,/assertAiDocumentCreateApproval\(vault,proposal\)/);
 assert.match(source,/assertAiDocumentUpdateApproval\(vault,proposal\)/);
 assert.doesNotMatch(source,/const packingCharge=/);
});

test('packing column stays hidden on untouched drafts, and saved document appearances are not changed',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault);
 const plain=prepareAiPdfPreview(kernel,vault,'en');
 assert.equal(plain.appearance.showPacking,false,'ordinary AI draft keeps historical hidden optional column');
 assert.deepEqual(vault,before);
 const doc=createBlankDocument('proforma','PI-2026-EXISTING',vault.company);
 doc.workspaceId='default';doc.branchId='main';doc.status='draft';
 doc.appearance.showPacking=false;
 doc.items=[{id:'some-item',descriptionEn:'Packed goods',descriptionAr:'',quantity:'2',unit:'CTN',unitPrice:'5',unitCost:'',origin:'',hsCode:'',packing:'6 boxes'}];
 vault.documents=[doc];
 const savedPdf=prepareAiPdfPreview(kernel,vault,'en',doc.id);
 assert.equal(savedPdf.items[0].packing,'6 boxes');
 assert.equal(savedPdf.appearance.showPacking,false,'saved document appearance remains user-controlled');
 assert.equal(vault.documents[0].appearance.showPacking,false);
});

test('in-chat document review shows per-line packing without changing the AI shell',()=>{
 const view=readFileSync(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
 assert.match(view,/row\.packing\?<div><dt>\{label\(ar,'Packing','التعبئة'\)\}<\/dt><dd>\{row\.packing\}/);
 assert.match(view,/className="lxw-review-item"/);
});

test('template only renders the packing column when its explicit appearance flag is true',()=>{
 const source=readFileSync(new URL('../src/templates/TemplateRenderer.tsx',import.meta.url),'utf8');
 assert.match(source,/const showPacking = doc\.appearance\.showPacking && doc\.items\.some/);
 assert.match(source,/<th>\{localized\(doc, 'Packing', 'التعبئة'\)\}/);
});
