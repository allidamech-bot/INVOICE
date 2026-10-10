import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {nextDocumentNumber} from '../dist/src/lib/documents.js';
import {
  adaptiveCloudSettleMs,
  CLOUD_SAVE_SETTLE_MS,
  CLOUD_EDIT_ACTIVITY_SETTLE_MS,
  CLOUD_MEDIUM_SAVE_SETTLE_MS,
  CLOUD_MEDIUM_EDIT_SETTLE_MS,
  CLOUD_LARGE_SAVE_SETTLE_MS,
  CLOUD_LARGE_EDIT_SETTLE_MS
} from '../dist/src/cloud/coalescing.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
const localStyles=html=>[...html.matchAll(/<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"?]+\.css)(?:\?[^\"]*)?"[^>]*\/>/g)].map(match=>match[1]);

test('v320 owns the active application visual cascade while v337 is the final document reliability owner',async()=>{
  const html=await read('index.html');
  const links=localStyles(html);
  assert.ok(links.includes('tailadmin-finance-v320.css'));
  assert.ok(links.includes('tailadmin-shell-v320.css'));
  assert.ok(links.includes('tailadmin-dashboard-v320.css'));
  assert.ok(links.includes('tailadmin-documents-v320.css'));
  assert.ok(links.includes('tailadmin-editor-core-v320.css'));
  assert.ok(links.includes('tailadmin-auth-v320.css'));
  assert.ok(links.includes('tailadmin-overlays-v320.css'));
  assert.ok(links.includes('v331-draft-scroll-recovery.css'));
  assert.equal(links.at(-1),'tailadmin-reliability-bridge-v320.css');
  const retired=/^(?:fintech-|premium-fintech|precision-black|luminous-noir|visual-(?:experience|audit|hardening|closeout|deep-audit)|.*canonical-v314)/;
  assert.deepEqual(links.filter(name=>retired.test(name)),[]);
});

test('account sign-out suspends the protected session before leaving its UID storage scope',async()=>{
  const source=await read('src/app/index.tsx');
  const start=source.indexOf('async function suspendPreviousAccountStorage');
  const end=source.indexOf('async function resolveRequiredAccountSession',start);
  assert.ok(start>=0&&end>start,'account storage suspension function missing');
  const body=source.slice(start,end);
  const suspend=body.indexOf('await suspendSession()');
  const clearUid=body.indexOf('setActiveAccountUid(null)');
  const publicScope=body.indexOf('await activateAccountStorage(null)');
  assert.ok(suspend>=0&&clearUid>suspend&&publicScope>clearUid,'sign-out must destroy the usable protected session before switching storage scope');
});

test('v318 cloud publication quiet windows remain adaptive while local durability stays independent',()=>{
  assert.equal(CLOUD_SAVE_SETTLE_MS,1_200);
  assert.equal(CLOUD_EDIT_ACTIVITY_SETTLE_MS,15_000);
  assert.equal(CLOUD_MEDIUM_SAVE_SETTLE_MS,2_500);
  assert.equal(CLOUD_MEDIUM_EDIT_SETTLE_MS,30_000);
  assert.equal(CLOUD_LARGE_SAVE_SETTLE_MS,5_000);
  assert.equal(CLOUD_LARGE_EDIT_SETTLE_MS,60_000);
  assert.equal(adaptiveCloudSettleMs(10_000,false),1_200);
  assert.equal(adaptiveCloudSettleMs(10_000,true),15_000);
  assert.equal(adaptiveCloudSettleMs(2_000_000,false),2_500);
  assert.equal(adaptiveCloudSettleMs(2_000_000,true),30_000);
  assert.equal(adaptiveCloudSettleMs(6_000_000,false),5_000);
  assert.equal(adaptiveCloudSettleMs(6_000_000,true),60_000);
});

test('quotation and invoice live number reservations remain independent under current prefixes',()=>{
  const vault=emptyVault();
  const quotation1=nextDocumentNumber(vault,'proforma');
  const invoice1=nextDocumentNumber(vault,'invoice');
  const quotation2=nextDocumentNumber(vault,'proforma');
  const invoice2=nextDocumentNumber(vault,'invoice');
  assert.match(quotation1.number,/^QUO-\d{4}-0001$/);
  assert.match(quotation2.number,/^QUO-\d{4}-0002$/);
  assert.match(invoice1.number,/^INV-\d{4}-0001$/);
  assert.match(invoice2.number,/^INV-\d{4}-0002$/);
});

test('revision history preserves audit metadata without multiplying attachment payloads',async()=>{
  const source=await read('src/lib/document-lifecycle.ts');
  assert.match(source,/function attachmentAuditMetadata/);
  assert.match(source,/dataUrl:''/);
  assert.match(source,/snapshot:cloneDocumentForRevision\(doc,false\)/);
  assert.match(source,/cloneDocumentForRevision\(doc,true\)/);
  assert.match(source,/Preserve the current live[\s\S]*supporting files across revision discard\/restore/);
});

test('production bundles application CSS and retains the supported standalone document owners',async()=>{
 const html=await read('dist/index.html'),sw=await read('dist/sw.js'),links=localStyles(html);
 assert.deepEqual(links,['app.bundle.css','v331-draft-scroll-recovery.css','v332-critical-documents-deep-closeout.css','v482-mobile-ux-repair.css']);
 assert.ok(html.includes('v331-draft-scroll-recovery.css?v=365-1'));
 assert.ok(html.includes('document-entry-v302.js?v=361'));
 assert.ok(html.includes('data-lourex-v331-draft-recovery="true"'));
 assert.match(sw,/const CACHE = 'lourex-invoice-v\d+'/);
 assert.ok(sw.includes('styles/app.bundle.css'));
});

test('document entry promotes current reliable stylesheet versions without reviving retired owners',async()=>{
 const runtime=await read('public/document-entry-v302.js');
 for(const token of ['.ta-create-menu button[role="menuitem"]','function promoteTailAdminOwners','ensureRuntimeReliability()','v331-draft-scroll-recovery.css?v=365-1','v332-critical-documents-deep-closeout.css?v=332-1'])assert.ok(runtime.includes(token),token);
 for(const name of ['attachment-gallery-v304.css','release-hardening-v306.css'])assert.ok(!runtime.includes(name),'retired stylesheet must stay off runtime: '+name);
 const a=runtime.indexOf('promoteTailAdminOwners();'),b=runtime.indexOf('promoteDraftRecovery();',a),c=runtime.indexOf('promoteCriticalDocuments();',b);
 assert.ok(a>=0&&b>a&&c>b,'runtime promotion ordering cannot regress');
});

test('iPhone runtime preserves local-first data while retiring WebKit service-worker churn',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/getRegistrations\(\)[\s\S]*unregister\(\)/);
  assert.match(source,/key\.startsWith\('lourex-invoice-'\)/);
  assert.match(source,/if\(!iosWebKit\)startCloudFreshnessWatcher\(\)/);
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase/);
});

test('AI presentation is styled through the safe shared app CSS rather than injected inline styles',async()=>{
 const [nudge,css,html]=await Promise.all([read('src/components/LourexAdvisorNudge.tsx'),read('src/styles/tailadmin-ai-v320.css'),read('index.html')]);
 assert.doesNotMatch(nudge,/<style[\s>]/i);
 assert.doesNotMatch(nudge,/data-lourex-ai-core/);
 assert.ok(css.includes('.lourex-ai-launcher')&&css.includes('@media screen'));
 assert.ok(html.includes('tailadmin-ai-v320.css'));
});

test('Vercel Git deployments remain fully manual',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  assert.equal(config.git?.deploymentEnabled,false);
});
