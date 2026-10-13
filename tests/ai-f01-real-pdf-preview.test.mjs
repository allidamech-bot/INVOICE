import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault,customerSnapshotFrom} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {newConversationKernel,stageKernelArtifact} from '../dist/src/lib/ai-conversation-kernel.js';
import {prepareAiPdfPreview} from '../dist/src/lib/ai-pdf-preview.js';
import {workspaceDocument} from '../dist/src/lib/ai-workspace-model.js';

const scope={scope:'business',workspaceId:'default',branchId:'main',threadId:'f01'};
function fixture(){
 const vault=emptyVault();
 const customer={id:'cust-f01',workspaceId:'default',companyNameEn:'PDF QA Buyer',companyNameAr:'عميل الفحص',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 vault.customers=[customer];
 const proposal={capability:'document.createDraft',kind:'proforma',customerId:customer.id,customerDraft:null,currency:'USD',language:'bilingual',items:[
  {savedItemId:'',descriptionEn:'Product A',descriptionAr:'صنف أ',quantity:'10',unit:'CTN',unitPrice:'20'},
  {savedItemId:'',descriptionEn:'Product B',descriptionAr:'صنف ب',quantity:'5',unit:'CTN',unitPrice:'30'},
  {savedItemId:'',descriptionEn:'Product C',descriptionAr:'صنف ج',quantity:'2',unit:'CTN',unitPrice:'40'}
 ],incoterm:'CIF',paymentTerms:'30 days',deliveryTime:'15 days',validity:'14 days',remarks:'Arabic sticker',notes:'',label:'Quotation PDF QA',rationale:'Explicit test request'};
 const kernel=newConversationKernel(scope);stageKernelArtifact(kernel,proposal);
 return{vault,kernel,customer};
}
test('F01 builds real LOUREX renderer input from unsaved quote without writing vault or reserving invoice numbers',()=>{
 const {vault,kernel}=fixture(),before=structuredClone(vault),working=workspaceDocument(kernel,vault,'en');
 const pdfDoc=prepareAiPdfPreview(kernel,vault,'en');
 assert.equal(pdfDoc.status,'draft');
 assert.equal(pdfDoc.number,'UNSAVED-PREVIEW');
 assert.equal(pdfDoc.kind,'proforma');
 assert.equal(pdfDoc.currency,'USD');
 assert.equal(pdfDoc.items.length,3);
 assert.deepEqual(pdfDoc.items.map(r=>r.unitPrice),['20','30','40']);
 assert.equal(working.subtotal,'430.00');
 assert.equal(pdfDoc.terms.incoterm,'CIF');
 assert.equal(pdfDoc.customerSnapshot.companyNameEn,'PDF QA Buyer');
 assert.equal(pdfDoc.appearance.watermark.enabled,true);
 assert.equal(pdfDoc.adjustments.taxEnabled,false);
 assert.equal(pdfDoc.adjustments.shippingEnabled,false);
 assert.deepEqual(vault,before);
 assert.equal(vault.documents.length,0);
 assert.equal(vault.documentEvents.length,0);
});
test('F01 working edits update PDF snapshot only, preserving stable lines and original document state',()=>{
 const {vault,kernel}=fixture();
 const artifact=kernel.artifact;
 const current={...artifact.proposal,items:artifact.proposal.items.map((row,index)=>index===2?{...row,quantity:'26'}:row)};
 artifact.proposal=current;artifact.revision+=1;
 const doc=prepareAiPdfPreview(kernel,vault,'ar');
 assert.equal(doc.items[2].quantity,'26');
 assert.equal(workspaceDocument(kernel,vault,'en').subtotal,'1390.00');
 assert.equal(vault.documents.length,0);
});
test('F01 saved draft PDF reads snapshot but cannot issue, update, or void saved record',()=>{
 const {vault,kernel,customer}=fixture();
 const persisted=createBlankDocument('invoice','INV-F01-001',vault.company);
 persisted.status='draft';persisted.workspaceId='default';persisted.branchId='main';
 persisted.customerSnapshot=customerSnapshotFrom(customer);
 persisted.items=[{id:'row-1',descriptionEn:'Product C',descriptionAr:'صنف ج',quantity:'2',unit:'CTN',unitPrice:'40',unitCost:'',origin:'',packing:'',hsCode:''}];
 vault.documents=[persisted];const before=structuredClone(vault);
 const doc=prepareAiPdfPreview(kernel,vault,'en',persisted.id);
 assert.equal(doc.number,persisted.number);
 assert.equal(doc.status,'draft');
 assert.deepEqual(vault,before);
 doc.status='final';doc.items[0].unitPrice='1000';
 assert.equal(vault.documents[0].status,'draft');
 assert.equal(vault.documents[0].items[0].unitPrice,'40');
});
test('F01 incomplete price, wrong company, and Advisor refuse PDF preparation',()=>{
 const {vault,kernel}=fixture();
 kernel.artifact.proposal.items[0].unitPrice='';
 assert.throws(()=>prepareAiPdfPreview(kernel,vault,'ar'),/Complete|required|price|ال/);
 kernel.artifact.proposal.items[0].unitPrice='20';
 kernel.scope.scope='personal';assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/business/);
 kernel.scope.scope='business';kernel.mode='advisor';
 assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/Only Controller/);
 kernel.mode='controller';kernel.scope.branchId='foreign';
 assert.throws(()=>prepareAiPdfPreview(kernel,vault,'en'),/company or branch/);
});
test('F01 canonical bridge creates actual File from A4 page canvases without print or approval',async()=>{
 const bridge=await readFile(new URL('../public/ios-print-bridge.js',import.meta.url),'utf8');
 const ui=await readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8');
 const app=await readFile(new URL('../src/app/App.tsx',import.meta.url),'utf8');
 assert.match(bridge,/window\.__LOUREX_BUILD_CHAT_PDF__ = async \(root,filename\)/);
 assert.match(bridge,/return renderPdfPages\(pages,filename\)/);
 assert.match(bridge,/const renderPdfPages = async \(sourcePages,filename\)/);
 assert.match(bridge,/pdf\.output\('blob'\)/);
 assert.match(bridge,/pdf\.addImage\(canvas\.toDataURL/);
 assert.match(bridge,/await addSharpMedia\(pdf,sharpMedia\)/);
 assert.match(bridge,/new File\(\[blob\]/);
 assert.match(bridge,/data-pagination-ready/);
 assert.match(ui,/prepareAiPdfPreview\(kernel,vault/);
 assert.match(ui,/__LOUREX_BUILD_CHAT_PDF__/);
 assert.match(ui,/import\('\.\.\/templates\/TemplateRenderer\.js'\)/);
 assert.match(ui,/<PdfRenderer document=\{pdfSource\.document\}/);
 assert.match(ui,/href=\{pdfResult\.url\} download=\{pdfResult\.name\}/);
 assert.match(ui,/<iframe title=\{label\(ar,'LOUREX PDF file preview'/);
 assert.match(ui,/normalizeAiConversationMode\(kernel\.mode\)!=='controller'\)return/);
 const css=await readFile(new URL('../src/styles/a4-mobile-print-v73.css',import.meta.url),'utf8');
 const vercel=await readFile(new URL('../vercel.json',import.meta.url),'utf8');
 assert.ok(vercel.includes("frame-src 'self' blob: https://*.firebaseapp.com"));
 assert.match(vercel,/object-src 'none'/);
 assert.match(ui,/className="lxw-ai-pdf-render-target"/);
 assert.doesNotMatch(ui,/className="print-portal lxw-ai-pdf-render-target"/);
 assert.match(css,/\.lxw-ai-pdf-render-target \.invoice-page/);
 assert.match(css,/width:210mm!important/);
 assert.match(bridge,/document\.querySelectorAll\('\.print-portal \.invoice-page'\)/);
 assert.doesNotMatch(app,/__LOUREX_BUILD_CHAT_PDF__/,'App must not call the chat-only PDF builder during save/print/issue');
});
