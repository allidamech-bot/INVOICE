/**
 * LOUREX AI release-blocking regression tests, synthetic fixtures only.
 * The tests are deliberately red on production baseline 87381cad.
 * NEVER run against a live vault, account, or financial dataset.
 * No application/source changes accompany this audit-only branch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {reviewAiDocumentProposal} from '../dist/src/lib/ai-document-review.js';
import {assertAiDocumentCreateApproval} from '../dist/src/lib/ai-document-approval-guard.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
import {documentItemFromSavedItem} from '../dist/src/lib/saved-items.js';
import {resolveAiCommercialLine} from '../dist/src/lib/ai-commercial-line.js';
import {groundedAiValidity} from '../dist/src/lib/ai-validity.js';
import {createAiToolRuntime,executeAiToolPlan} from '../dist/src/lib/ai-tool-orchestrator.js';

const item=(p={})=>({savedItemId:'',descriptionEn:'Test valve',descriptionAr:'صمام تجريبي',quantity:'2',unit:'PCS',unitPrice:'125',...p});
const proposal=(row,p={})=>({capability:'document.createDraft',kind:'proforma',
  customerId:'qa-buyer',customerDraft:null,currency:'USD',language:'bilingual',items:[row],
  incoterm:'',paymentTerms:'',deliveryTime:'',validity:'14 days',remarks:'',notes:'',
  label:'Synthetic quotation',rationale:'QA',...p});
const drafting=(products=[])=>({customers:[{id:'qa-buyer',name:'Synthetic Buyer'}],
  items:products,defaults:{currency:'USD',language:'en',validity:'7',incoterm:'',paymentTerms:'',deliveryTime:''},activeDocument:null});
const fixture=(row=item())=>{
  const vault=emptyVault();
  vault.customers=[{id:'qa-buyer',workspaceId:'default',branchId:'main',companyNameEn:'Synthetic Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
    vatTaxNumber:'',commercialRegistration:''}];
  const kernel=newConversationKernel({scope:'business',workspaceId:'default',branchId:'main',threadId:'synthetic-only'});
  stageKernelArtifact(kernel,proposal(row));
  return {vault,kernel};
};

test('AI-GATE-01: quotation intent cannot be overridden by Invoice in a customer name',()=>{
  const source=readFileSync('dist/src/lib/ai-intelligence-runtime.js','utf8');
  const start=source.indexOf('export function pendingDocumentDialogue(');
  const end=source.indexOf('export function intelligenceRequestMessage(',start);
  assert.ok(start>=0&&end>start,'Compiled document dialogue parser exists');
  const pending=new Function('currentConversationMode',
    source.slice(start,end).replaceAll('export function ','function ')+';return pendingDocumentDialogue;')
    (host=>host.mode);
  for(const sentence of [
    'Create a quote for Invoice Trading for 3 boxes',
    'اعمل عرض سعر للعميل Invoice Trading',
    'اعمل عرض سعر لشركة Invoice & Supply'
  ])assert.equal(pending([{role:'user',text:sentence}],'controller',false)?.kind,
    'proforma','Wrong document type for: '+sentence);
});

test('AI-GATE-02: a missing commercial unit blocks visible review',()=>{
  const review=reviewAiDocumentProposal(proposal(item({unit:''})),drafting(),'en');
  assert.ok(review.blockers.some(x=>/unit|وحدة/i.test(x)), 'The proposed line lacks its printable unit');
});

test('AI-GATE-03: SKU-only referenced row cannot pass with neither printable description nor unit',()=>{
  const ref=[{id:'sku-only',sku:'SKU-001',name:'SKU-001',descriptionEn:'',descriptionAr:'',
    unit:'',lastCurrency:'USD',lastUnitPrice:'125'}];
  const review=reviewAiDocumentProposal(proposal(item({savedItemId:'sku-only',
    descriptionEn:'',descriptionAr:'',unit:''})),drafting(ref),'en');
  assert.ok(review.blockers.length>0,'Reference SKU is not itself a printable commercial description');
});

test('AI-GATE-04: due date and requested 14-day validity agree in the actual PDF document',()=>{
  const {vault,kernel}=fixture(), before=structuredClone(vault);
  const pdf=prepareAiPdfPreview(kernel,vault,'en');
  assert.equal(pdf.terms.validity,'14 days');
  assert.equal((Date.parse(pdf.dueDate)-Date.parse(pdf.issueDate))/86400000,14);
  assert.deepEqual(vault,before,'Rendering preview must never save to the vault');
});

test('AI-GATE-05: PDF cannot be exported from a quote with an empty unit',()=>{
  const {vault,kernel}=fixture(item({unit:''}));
  assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/unit|complete|required|وحدة/i);
});

test('AI-GATE-06: review shows the edited description, not the old catalog name',()=>{
  const products=[{id:'saved-01',sku:'S-01',name:'Old product name',descriptionEn:'Old product name',
    descriptionAr:'',unit:'PCS',lastCurrency:'USD',lastUnitPrice:'125'}];
  const row=item({savedItemId:'saved-01',descriptionEn:'Customer-specific branded product'});
  const review=reviewAiDocumentProposal(proposal(row),drafting(products),'en');
  assert.ok(review.text.includes(row.descriptionEn),'Reviewer must see the line that will be saved');
});

test('AI-GATE-07: a saved catalog item retains reviewed custom descriptions during save',()=>{
  const source=readFileSync('src/components/AiCopilot.tsx','utf8');
  const first=source.indexOf('private documentLine=');
  const last=source.indexOf('private executeDocumentProposal=',first);
  assert.ok(first>=0&&last>first);
  const compiled=ts.transpileModule('export class TestHarness{\n'+source.slice(first,last)+
    '\n check(entry,vault,currency){return this.documentLine(entry,vault,currency)}\n}',{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={exports:{},documentItemFromSavedItem,resolveAiCommercialLine,aiProductArchived:()=>false,makeId:()=> 'qa-line'};
  vm.runInNewContext(compiled,sandbox);
  const saved={id:'saved-01',sku:'S-01',workspaceId:'default',descriptionEn:'Old English title',
    descriptionAr:'الوصف القديم',unit:'PCS',lastUnitPrice:'50',lastCurrency:'USD',
    inventoryTracking:'stock',hsCode:'',origin:'',packing:'',lastUnitCost:''};
  const row=item({savedItemId:'saved-01',descriptionEn:'Custom English title',
    descriptionAr:'الوصف العربي المخصص',unit:'BOX',quantity:'3',unitPrice:'99'});
  const output=new sandbox.exports.TestHarness().check(row,{savedItems:[saved]},'USD');
  for(const field of ['descriptionEn','descriptionAr','unit','quantity','unitPrice'])
    assert.equal(output[field],row[field],'Saved document silently changed approved '+field);
});

test('AI-GATE-08: natural requests use the deterministic PDF route',()=>{
  const src=readFileSync('src/lib/ai-intelligence-runtime.ts','utf8');
  const begin=src.indexOf('const pdfRequested=');
  const end=src.indexOf("if(currentConversationMode(host)==='controller'&&pdfRequested",begin);
  assert.ok(begin>=0&&end>begin);
  const recognize=new Function('message',src.slice(begin,end)+';return pdfRequested;');
  for(const phrase of ['بدي ملف PDF','اطبع لي PDF','نزّل لي PDF','I need a PDF','أعطني ملف PDF'])
    assert.equal(recognize(phrase),true,'Spoken PDF route skipped: '+phrase);
});

test('AI-GATE-09: approving a quote with missing unit is rejected at atomic-save boundary',()=>{
  const {vault}=fixture();
  assert.throws(()=>assertAiDocumentCreateApproval(vault,proposal(item({unit:''}))),
    /unit|وحدة/i,'Final approval must enforce the same rules as review and PDF');
});

test('AI-GATE-10: inventory responses never masquerade as complete when limited to 30 rows',()=>{
  const vault=emptyVault();
  vault.savedItems=Array.from({length:75},(_,i)=>({
    id:'item-'+(i+1),workspaceId:'default',sku:'QA-'+(i+1),
    descriptionEn:'Synthetic product '+(i+1),descriptionAr:'',unit:'PCS',
    lastCurrency:'USD',lastUnitPrice:'1',inventoryTracking:'stock',archived:false,tags:[]}));
  const runtime=createAiToolRuntime(vault,{conversationMode:'controller',
    assistantRuntime:{scope:'business',workspaceId:'default',branchId:'main'}});
  const result=executeAiToolPlan(runtime,{version:1,goal:'Read entire synthetic inventory',
    calls:[{id:'read',tool:'inventory.getStatus',args:{},reason:'Read all'}]});
  assert.equal(result.results[0]?.ok,true);
  const data=result.results[0].data;
  if(Array.isArray(data))assert.equal(data.length,75,'An unqualified array must not drop stock rows');
  else {
    assert.ok(data&&typeof data==='object'&&!data.truncated,'Lossy text preview is not inventory evidence');
    const rows=data.rows||data.items||data.balances||[];
    assert.ok(Array.isArray(rows));
    assert.equal(data.total,75,'Declare full matching row count');
    assert.equal(data.shown,rows.length,'Declare shown row count');
    assert.equal(Boolean(data.incomplete),rows.length<75,'Clearly signal incomplete result');
  }
});

test('AI-GATE-11: existing cross-company customer/product write protection remains effective',()=>{
  const {vault}=fixture();
  vault.savedItems=[{id:'other-product',workspaceId:'other-company',descriptionEn:'Other product',
    descriptionAr:'',unit:'PCS',lastCurrency:'USD',lastUnitPrice:'1',tags:[],archived:false}];
  assert.throws(()=>assertAiDocumentCreateApproval(vault,proposal(
    item({savedItemId:'other-product',unitPrice:'1'}))),/active company|unavailable/i);
});


test('AI-GATE-12: explicit Arabic 14-day validity grounds an English AI term, but unrelated delivery time does not',()=>{
  assert.equal(groundedAiValidity('14 days','الصلاحية 14 يوم','7'), '14 days');
  assert.equal(groundedAiValidity('14 days','صلاحية العرض 14 يوم','7'), '14 days');
  assert.equal(groundedAiValidity('14 days','مدة التسليم 14 يوم','7'), '7');
  assert.equal(groundedAiValidity('14 days','الصلاحية 30 يوم','7'), '7');
});
