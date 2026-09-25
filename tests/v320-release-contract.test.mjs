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

test('production build publishes the canonical bundle plus v337 document owner and current runtime/cache generation',async()=>{
  const html=await read('dist/index.html');
  const sw=await read('dist/sw.js');
  const links=localStyles(html);
  assert.deepEqual(links,['app.bundle.css','v331-draft-scroll-recovery.css']);
  assert.match(html,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(html,/data-lourex-v331-draft-recovery="true"/);
  assert.match(html,/home-final-closeout-v286\.js\?v=320/);
  assert.match(html,/document-entry-v302\.js\?v=337-3/);
  assert.doesNotMatch(html,/document-entry-v302\.js\?v=(?:302|311|314|320|337-2)/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v(?:33[7-9]|3[4-9]\d|[4-9]\d\d)'/);
  assert.match(sw,/tailadmin-finance-v320\.css\?v=320-3/);
  assert.match(sw,/tailadmin-reliability-bridge-v320\.css\?v=320-2/);
  assert.match(sw,/v331-draft-scroll-recovery\.css\?v=337-3/);
  assert.match(sw,/v337-template-layout-balance\.css\?v=337-3/);
});

test('document runtime recognizes the TailAdmin create menu and promotes current reliability layers beneath final semantics',async()=>{
  const runtime=await read('public/document-entry-v302.js');
  assert.match(runtime,/\.ta-create-menu button\[role="menuitem"\]/);
  assert.match(runtime,/function promoteTailAdminOwners/);
  assert.match(runtime,/ensureRuntimeReliability\(\)/);
  assert.match(runtime,/attachment-gallery-v304\.css\?v=304/);
  assert.match(runtime,/release-hardening-v306\.css\?v=306/);
  assert.match(runtime,/v331-draft-scroll-recovery\.css\?v=337-3/);
  const tail=runtime.indexOf('promoteTailAdminOwners();');
  const draft=runtime.indexOf('promoteDraftRecovery();');
  const semantic=runtime.indexOf('promoteCriticalDocuments();');
  assert.ok(tail>=0&&draft>tail&&semantic>draft);
});

test('iPhone runtime preserves local-first data while retiring WebKit service-worker churn',async()=>{
  const source=await read('src/app/index.tsx');
  assert.match(source,/getRegistrations\(\)[\s\S]*unregister\(\)/);
  assert.match(source,/key\.startsWith\('lourex-invoice-'\)/);
  assert.match(source,/if\(!iosWebKit\)startCloudFreshnessWatcher\(\)/);
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase/);
});

test('AI presentation no longer injects a legacy runtime stylesheet',async()=>{
  const nudge=await read('src/components/LourexAdvisorNudge.tsx');
  const css=await read('src/styles/tailadmin-ai-v320.css');
  assert.doesNotMatch(nudge,/<style[\s>]/i);
  assert.doesNotMatch(nudge,/data-lourex-ai-core/);
  assert.ok(css.includes('v320')||css.includes('TailAdmin'));
});

test('feature branches cannot deploy to Vercel production automatically',async()=>{
  const config=JSON.parse(await read('vercel.json'));
  assert.equal(config.git?.deploymentEnabled?.main,true);
  assert.equal(config.git?.deploymentEnabled?.['*'],false);
});
