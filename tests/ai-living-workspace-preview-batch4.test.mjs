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
const approvalRuntime=read('src/lib/ai-intelligence-runtime.ts').split('async function runIntelligenceApproval(')[1]?.split('export function installIntelligenceRuntime(')[0]||'';

test('document preview computes exact per-line amounts without inventing prices',()=>{
  assert.equal(lineTotal('12','25.00'),'300.00');
  assert.equal(lineTotal('4','45.00'),'180.00');
  assert.equal(lineTotal('1.5','10.20'),'15.30');
  // The general-purpose money engine treats blank input as zero; the preview
  // explicitly refuses to show that as a verified amount (see component guard).
  assert.equal(lineTotal('','10.00'),'0.00');
  assert.match(component,/!quantity\|\|!price\|\|!isNonNegativeDecimalInput\(quantity\)\|\|!isNonNegativeDecimalInput\(price\)/);
  assert.match(component,/try\{return lineTotal\(quantity,price\);\}catch\{return '—';\}/);
  assert.match(component,/doc\.rows\.some\(row=>amount\(row\.quantity,row\.unitPrice\)==='—'\)/,'incomplete row must invalidate displayed subtotal');
});

test('preview preserves real scoped document content, including all lines and terms',()=>{
  const vault=emptyVault(),scope={scope:'business',workspaceId:vault.appSettings.activeWorkspaceId||'default',branchId:vault.appSettings.activeBranchId||'main',threadId:'financial-preview'};
  vault.customers=[{id:'c1',workspaceId:'default',companyNameEn:'Test Buyer',companyNameAr:'عميل تجريبي',preferredCurrency:'USD',paymentTerms:'',email:''}];
  const kernel=newConversationKernel(scope);
  const proposal={
    capability:'document.createDraft',kind:'proforma',currency:'USD',language:'bilingual',
    customerId:'c1',customerDraft:null,
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
  assert.match(component,/<PricingGrid key=\{doc\.id\+':edit'\}/,'editable grid still exists only in edit view');
  assert.match(styles,/\.lxw-review-banner\{/);
  assert.match(styles,/\.lxw-review-amount\{color:#b4e4d1/);
  assert.match(styles,/\.lxw-review-subtotal\{/);
  assert.match(styles,/\.lxw-review-warnings\{/);
  assert.match(styles,/@media\(max-width:430px\)/);
});

test('inline document approval is only visible after explicit review',()=>{
  assert.match(component,/function InlineDocumentApproval/);
  assert.match(component,/\{decline\}\{reviewed&&confirm\?confirm:null\}/,'decline stays available, confirmation requires review');
  assert.match(component,/__workspaceReviewedProposal===host\.state\.proposal/);
  assert.match(styles,/@keyframes lxwActionAppear/);
});

test('the approval executor rejects unreviewed business actions, not just the visible button',()=>{
  assert.match(approvalRuntime,/kernel\.scope\.scope==='business'&&proposal\.capability!=='workspace\.navigate'&&!approvalWasReviewed\(host,proposal\)/);
  assert.match(read('src/lib/ai-intelligence-runtime.ts'),/active\?\.capability==='tool\.plan'&&Array\.isArray\(active\.steps\)&&active\.steps\.includes\(proposal\)/,'only actual steps of the visible plan may be reviewed');
  assert.match(approvalRuntime,/throw new Error\('Review and acknowledge this exact action before approval\.'\)/);
  assert.match(component,/host\.setState\(\{__workspaceReviewedProposal:proposal\}\);setReviewedProposal\(proposal\)/,
    'non-document write suggestions must register the same acknowledgement as financial reviews');
  assert.match(component,/__workspaceReviewedProposal:host\.state\.proposal/,
    'document review must acknowledge the exact current proposal');
});

test('approval rechecks live account, scope, mode, proposal and actor after async persistence',()=>{
  const commit=approvalRuntime.indexOf('await persistKernel(host); // Crash after commit');
  const resume=approvalRuntime.indexOf('const live=await resumeVaultSession();',commit);
  const checkScope=approvalRuntime.indexOf('kernelScopeKey(scopeFor(host,live.vault))!==kernelScopeKey(kernel.scope)',resume);
  const checkMode=approvalRuntime.indexOf("currentConversationMode(host)!=='controller'",resume);
  const checkProposal=approvalRuntime.indexOf('!approvalIsCurrent(host,proposal)',resume);
  const checkActor=approvalRuntime.indexOf('assertFoundationApproval(live.vault,proposal);',resume);
  const execute=approvalRuntime.indexOf('const result=await apply();',resume);
  assert.ok(commit>=0&&commit<resume&&resume<checkScope&&checkScope<checkMode&&checkMode<checkProposal&&checkProposal<checkActor&&checkActor<execute,
    'all post-await authorization checks must complete before apply()');
  assert.match(approvalRuntime,/The action review changed during approval\. Nothing was applied\./);
});

test('ordinary navigation and edit suggestions are compact without bypassing the original callbacks',()=>{
  assert.match(component,/function InlineGeneralProposal/);
  assert.match(component,/const isNavigation=proposal\.capability==='workspace\.navigate'/);
  assert.match(component,/reviewedProposal===proposal/);
  assert.match(component,/react\.cloneElement\(primary,\{className:'lxw-inline-open'\}/);
  assert.match(component,/children\.filter\(\(child:any\)=>child!==actions\)/);
  assert.match(component,/const safeContent=content\.filter\(\(child:any\)=>child!==proposalNode\)/);
  assert.match(component,/mode==='controller'&&generalProposal\?<InlineGeneralProposal/);
  assert.match(styles,/\.lxw-inline-general-detail\{/);
  assert.match(styles,/\.lxw-inline-general\{/);
});

test('declining a suggestion animates out safely without delaying reduced-motion users',()=>{
  assert.match(component,/function useInlineDecline/);
  assert.match(component,/host\.state\.proposal===proposal/);
  assert.match(component,/window\.setTimeout\(\(\)=>\{/);
  assert.match(component,/\},160\)/);
  assert.match(component,/if\(reduced\)\{timer\.current=-1;button\.props\?\.onClick\?\.\(\);return;\}/);
  assert.match(component,/data-exiting=\{dismissal\.exiting\?'true':'false'\}/);
  assert.match(styles,/\.lxw-inline-approval\[data-exiting='true'\]/);
  assert.match(styles,/prefers-reduced-motion:reduce/);
});

test('grouped artifact navigation retains all twelve original functional views',()=>{
  const groups=component.split('const viewGroups=[')[1]?.split('  const activeGroup=')[0]||'';
  const ids=[...groups.matchAll(/\['([^']+)','[^']+','[^']+'\]/g)].map(match=>match[1]);
  assert.deepEqual(ids.sort(),[
    'preview','edit','customer','product','files','revisions',
    'commercial','missions','evidence','knowledge','reliability','diagnostics',
  ].sort());
  assert.match(component,/className="lxw-view-groups"/);
  assert.match(component,/className="lxw-view-options"/);
  assert.doesNotMatch(component,/className="lxw-tabs"/);
  assert.match(styles,/\.lxw-view-groups button\{/);
  assert.match(styles,/\.lxw-view-options button\{min-height:44px/);
  assert.match(styles,/@media\(max-width:430px\)/);
});
