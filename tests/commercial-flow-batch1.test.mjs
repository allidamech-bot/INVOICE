import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Batch 1 commercial tracking stays separate from document accounting lifecycle',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  assert.match(source,/CommercialTrackingStatus='draft'\|'internal-ready'\|'sent'\|'accepted'\|'rejected'\|'expired'\|'converted'/);
  assert.doesNotMatch(source,/\bdoc\.(?:status|lifecycleStatus)\s*=(?!=)/);
  assert.match(source,/linkedInvoiceForCommercialDocument/);
  assert.match(source,/status:'converted',source:'conversion'/);
});

test('Batch 1 never invents Viewed before a secure customer portal exists',async()=>{
  const {validatedCommercialTrackingEvent,effectiveCommercialStatus}=await import('../dist/src/lib/commercial-flow.js');
  const doc={id:'quote-1',kind:'proforma',role:'standard',status:'final',lifecycleStatus:'active',dueDate:'2027-01-01'};
  const vault={documents:[doc],documentEvents:[]};
  assert.deepEqual(effectiveCommercialStatus(doc,vault.documents,null,'2026-10-10'),{status:'internal-ready',source:'document'});
  for(const kind of ['viewed','commented']){
    assert.throws(()=>validatedCommercialTrackingEvent(vault,doc.id,kind,'','2026-10-10'),/secure customer link/i);
  }
  assert.equal(effectiveCommercialStatus(doc,vault.documents,{documentId:doc.id,status:'',viewedAt:'2026-10-10'},'2026-10-10').status,'internal-ready');
});

test('Batch 1 status precedence protects accepted and rejected quotes from automatic expiry',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  const accepted=source.indexOf("tracked?.status==='accepted'");
  const rejected=source.indexOf("tracked?.status==='rejected'");
  const expired=source.indexOf("expiresAt<today");
  assert.ok(accepted>0&&rejected>accepted&&expired>rejected,'manual terminal decisions must win before expiry derivation');
});

test('Batch 1 commercial flow uses existing conversion and credit links instead of synthetic relationships',async()=>{
  const source=await read('src/lib/commercial-flow.ts');
  assert.match(source,/candidate\.convertedFromId===doc\.id/);
  assert.match(source,/candidate\.role==='credit-note'&&candidate\.creditForId===child\.id/);
  assert.match(source,/commercialEvidence/);
  assert.match(source,/event\.relatedDocumentId/);
});

test('Documents workspace receives real lifecycle evidence and renders Commercial Flow',async()=>{
  const [app,documents,panel]=await Promise.all([
    read('src/app/App.tsx'),read('src/components/DocumentsPage.tsx'),read('src/components/CommercialFlowPanel.tsx')
  ]);
  assert.match(app,/documentEvents=\{vault\.documentEvents\}/);
  assert.match(documents,/CommercialFlowPanel/);
  assert.match(documents,/events=\{this\.props\.documentEvents\}/);
  assert.match(panel,/buildCommercialFlowSnapshot/);
});

test('Commercial tracking persists through the registered encrypted vault mutation bridge',async()=>{
  const panel=await read('src/components/CommercialFlowPanel.tsx');
  const bridge=await read('src/storage/vault-mutation-bridge.ts');
  const runtime=await read('src/app/index.tsx');
  assert.match(panel,/mutateVaultSafely/);
  assert.match(panel,/validatedCommercialTrackingEvent\(vault,document\.id,kind,payload\)/);
  assert.match(panel,/documentEvents:\[\.\.\.vault\.documentEvents,event\]/);
  assert.match(bridge,/registerVaultMutationBridge/);
  assert.match(runtime,/registerVaultMutationBridge\(async mutation=>/);
  assert.match(runtime,/saveVault\(key,next\)/);
  assert.match(runtime,/instance\.vaultWriteTail=operation/);
  assert.match(runtime,/instance\.scheduleCloudSync\(\)/);
});

test('Commercial tracking events use the encrypted event ledger without changing schema or lifecycle event labels',async()=>{
  const [flow,defaults,lifecyclePanel]=await Promise.all([
    read('src/lib/commercial-flow.ts'),read('src/lib/defaults.ts'),read('src/components/DocumentLifecyclePanel.tsx')
  ]);
  assert.match(flow,/COMMERCIAL_MARKER='@lourex:commercial:v1:'/);
  assert.match(flow,/type:'created'/);
  const {APP_SCHEMA_VERSION}=await import('../dist/src/lib/defaults.js');assert.ok(APP_SCHEMA_VERSION>=15,'later schema migrations must preserve commercial ledger compatibility');
  assert.match(defaults,/no schema bump is required/);
  assert.match(lifecyclePanel,/\.filter\(isLifecycleDocumentEvent\)/);
});

test('Commercial tracking transition validation uses the latest vault and blocks stale terminal mutations',async()=>{
  const { emptyVault, defaultCompany }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { validatedCommercialTrackingEvent, commercialTrackingFromEvents, effectiveCommercialStatus }=await import('../dist/src/lib/commercial-flow.js');

  const vault=emptyVault();
  const quote=createBlankDocument('proforma','QUO-2026-9001',defaultCompany());
  quote.status='final';
  quote.lifecycleStatus='active';
  quote.dueDate='2026-12-31';
  vault.documents=[quote];

  const sent=validatedCommercialTrackingEvent(vault,quote.id,'sent','', '2026-10-01');
  vault.documentEvents.push(sent);
  let tracking=commercialTrackingFromEvents(quote.id,vault.documentEvents);
  assert.equal(tracking.status,'sent');
  assert.equal(effectiveCommercialStatus(quote,vault.documents,tracking,'2026-10-01').status,'sent');

  assert.throws(()=>validatedCommercialTrackingEvent(vault,quote.id,'followup-scheduled','2026-09-30','2026-10-01'),/cannot be in the past/i);
  const followup=validatedCommercialTrackingEvent(vault,quote.id,'followup-scheduled','2026-10-15','2026-10-01');
  vault.documentEvents.push(followup);
  tracking=commercialTrackingFromEvents(quote.id,vault.documentEvents);
  assert.equal(tracking.followUpAt,'2026-10-15');

  const accepted=validatedCommercialTrackingEvent(vault,quote.id,'accepted','', '2026-10-01');
  vault.documentEvents.push(accepted);
  tracking=commercialTrackingFromEvents(quote.id,vault.documentEvents);
  assert.equal(tracking.status,'accepted');
  assert.equal(effectiveCommercialStatus(quote,vault.documents,tracking,'2027-01-01').status,'accepted');
  assert.throws(()=>validatedCommercialTrackingEvent(vault,quote.id,'rejected','changed mind','2026-10-01'),/already closed/i);
  assert.equal(quote.status,'final');
  assert.equal(quote.lifecycleStatus,'active');
});

test('Terminal commercial decisions remain monotonic after concurrent event merge',async()=>{
  const { defaultCompany }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { createCommercialTrackingEvent, commercialTrackingFromEvents }=await import('../dist/src/lib/commercial-flow.js');
  const quote=createBlankDocument('proforma','QUO-2026-9010',defaultCompany());quote.status='final';
  const accepted=createCommercialTrackingEvent(quote,'accepted');accepted.at='2026-10-01T10:00:00.000Z';accepted.id='event-a';
  const lateSent=createCommercialTrackingEvent(quote,'sent');lateSent.at='2026-10-01T11:00:00.000Z';lateSent.id='event-b';
  const competingRejected=createCommercialTrackingEvent(quote,'rejected','other device');competingRejected.at='2026-10-01T12:00:00.000Z';competingRejected.id='event-c';
  const lateFollowup=createCommercialTrackingEvent(quote,'followup-scheduled','2099-12-31');lateFollowup.at='2026-10-01T13:00:00.000Z';lateFollowup.id='event-d';
  let tracking=commercialTrackingFromEvents(quote.id,[lateFollowup,competingRejected,lateSent,accepted]);
  assert.equal(tracking.status,'accepted','a later merged Sent/Rejected event must not downgrade the first terminal decision');
  assert.equal(tracking.followUpAt,'','terminal decision must clear and block later follow-up scheduling');

  const rejected=createCommercialTrackingEvent(quote,'rejected','price');rejected.at='2026-10-01T09:00:00.000Z';rejected.id='event-0';
  tracking=commercialTrackingFromEvents(quote.id,[accepted,rejected]);
  assert.equal(tracking.status,'rejected','the earliest terminal ledger decision remains authoritative after merge');
  assert.equal(tracking.rejectionReason,'price');
});

test('Converted invoices inherit Converted commercial semantics while standalone invoices stay outside the panel',async()=>{
  const { defaultCompany }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { effectiveCommercialStatus }=await import('../dist/src/lib/commercial-flow.js');
  const company=defaultCompany();
  const quote=createBlankDocument('proforma','QUO-2026-9003',company);quote.status='final';
  const converted=createBlankDocument('invoice','INV-2026-9003',company);converted.status='final';converted.convertedFromId=quote.id;
  const standalone=createBlankDocument('invoice','INV-2026-9004',company);standalone.status='final';
  assert.equal(effectiveCommercialStatus(converted,[quote,converted],null,'2026-10-01').status,'converted');
  assert.equal(effectiveCommercialStatus(standalone,[standalone],null,'2026-10-01').status,'internal-ready');
  const panel=await read('src/components/CommercialFlowPanel.tsx');
  assert.match(panel,/if\(!isQuoteLikeDocument\(document\)&&!document\.convertedFromId\)return null/);
  assert.doesNotMatch(panel,/document\.kind!=='invoice'/);
});

test('Expired quotations cannot be marked sent through a non-UI mutation path',async()=>{
  const { emptyVault, defaultCompany }=await import('../dist/src/lib/defaults.js');
  const { createBlankDocument }=await import('../dist/src/lib/documents.js');
  const { validatedCommercialTrackingEvent }=await import('../dist/src/lib/commercial-flow.js');
  const vault=emptyVault();
  const quote=createBlankDocument('proforma','QUO-2026-9002',defaultCompany());
  quote.status='final';quote.lifecycleStatus='active';quote.dueDate='2026-09-30';
  vault.documents=[quote];
  assert.throws(()=>validatedCommercialTrackingEvent(vault,quote.id,'sent','','2026-10-01'),/quotation is expired/i);
});

test('Commercial flow visual layer loads before the final reliability bridge and protects mobile touch UX',async()=>{
  const html=await read('index.html');
  const commercial='./styles/commercial-flow-batch1.css?v=453-1';
  const bridge='./styles/tailadmin-reliability-bridge-v320.css?v=320-2';
  assert.ok(html.includes(commercial),'commercial flow stylesheet missing');
  assert.ok(html.indexOf(commercial)<html.indexOf(bridge),'commercial flow must load before reliability bridge');
  const css=await read('src/styles/commercial-flow-batch1.css');
  assert.match(css,/\.lx-commercial-actions \.btn\{min-height:44px\}/);
  assert.match(css,/\.lx-commercial-followup \.input\{[^}]*min-height:44px[^}]*font-size:16px/);
  assert.match(css,/\.lx-commercial-actions-primary\{display:grid;grid-template-columns:1fr\}/);
  assert.match(css,/@media \(max-width:900px\)/);
  assert.match(css,/\[dir="rtl"\]/);
  assert.match(css,/focus-visible/);
});

test('Batch 1 mobile browser QA is part of the blocking current business shard',async()=>{
  const [ci,runner,fixture]=await Promise.all([
    read('scripts/verify-local.mjs'),read('tests/visual/run-commercial-flow-batch1.cjs'),read('tests/visual/commercial-flow-batch1.html')
  ]);
  assert.match(ci,/tests\/visual\/run-commercial-flow-batch1\.cjs/);
  assert.match(runner,/viewport:\{width:390,height:844\}/);
  assert.match(runner,/Mark Sent/);
  assert.match(runner,/تسجيل الرفض/);
  assert.match(runner,/status,'final'/);
  assert.match(runner,/lifecycle,'active'/);
  assert.match(fixture,/registerVaultMutationBridge/);
  assert.match(fixture,/DocumentsPage/);
});