import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lineTotal } from '../dist/src/lib/money.js';
import { newConversationKernel, stageKernelArtifact } from '../dist/src/lib/ai-conversation-kernel.js';
import { workspaceDocument } from '../dist/src/lib/ai-workspace-model.js';
import { emptyVault } from '../dist/src/lib/defaults.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const component=read('src/components/AiConversationWorkspace.tsx');
const styles=read('src/styles/ai-conversation-workspace.css');

test('document preview computes exact per-line amounts without inventing prices',()=>{
  assert.equal(lineTotal('12','25.00'),'300.00');
  assert.equal(lineTotal('4','45.00'),'180.00');
  assert.equal(lineTotal('1.5','10.20'),'15.30');
  // The general-purpose money engine treats blank input as zero; the preview
  // explicitly refuses to show that as a verified amount (see component guard).
  assert.equal(lineTotal('','10.00'),'0.00');
  assert.match(component,/if\(!quantity\|\|!price\)return '—'/);
  assert.match(component,/try\{return lineTotal\(quantity,price\);\}catch\{return '—';\}/);
});

test('preview preserves real scoped document content, including all lines and terms',()=>{
  const vault=emptyVault(),scope={scope:'business',workspaceId:vault.appSettings.activeWorkspaceId||'default',branchId:vault.appSettings.activeBranchId||'main',threadId:'financial-preview'};
  const kernel=newConversationKernel(scope);
  const proposal={
    capability:'document.createDraft',kind:'proforma',currency:'USD',language:'bilingual',
    customerId:'',customerDraft:{companyNameEn:'Test Buyer',companyNameAr:''},
    items:[{savedItemId:'',descriptionEn:'Product A',descriptionAr:'صنف أ',quantity:'12',unit:'CTN',unitPrice:'25.00'},
           {savedItemId:'',descriptionEn:'Product B',descriptionAr:'صنف ب',quantity:'4',unit:'CTN',unitPrice:'45.00'}],
    label:'Example draft',rationale:'Unit test',incoterm:'FOB',paymentTerms:'Advance',deliveryTime:'',validity:'',remarks:'',notes:'',
  };
  stageKernelArtifact(kernel,proposal);
  const doc=workspaceDocument(kernel,vault,'ar');
  assert.ok(doc);
  assert.equal(doc.rows.length,2);
  assert.equal(doc.subtotal,'480.00');
  assert.equal(doc.currency,'USD');
  assert.ok(doc.terms.some(t=>t.label==='incoterm'&&t.value==='FOB'));
  assert.match(component,/doc\.rows\.map\(\(row,i\)=>\{/,'render every line, not a truncated preview');
  assert.match(component,/doc\.diff\.map\(\(row,i\)=>/,'show all reviewed changes');
  assert.match(component,/doc\.blockers\.map\(\(value,i\)=>/,'show approval blockers');
});

test('financial review is a single specialized view, not a second giant grid',()=>{
  assert.match(component,/function QuotePreviewSummary/);
  assert.match(component,/tab==='preview'\?<QuotePreviewSummary doc=\{doc\} ar=\{ar\}/);
  assert.match(component,/tab==='edit'\?[^]*<PricingGrid key=\{doc\.id\+':edit'\}/);
  assert.match(styles,/\.lxw-review-banner\{/);
  assert.match(styles,/\.lxw-review-amount\{color:#b4e4d1/);
  assert.match(styles,/\.lxw-review-subtotal\{/);
  assert.match(styles,/\.lxw-review-warnings\{/);
  assert.match(styles,/@media\(max-width:430px\)/);
});

test('inline document approval is only visible after explicit review',()=>{
  assert.match(component,/function InlineDocumentApproval/);
  assert.match(component,/reviewed&&originalButtons\.length/);
  assert.match(component,/__workspaceReviewedProposal===host\.state\.proposal/);
  assert.match(styles,/@keyframes lxwActionAppear/);
});
