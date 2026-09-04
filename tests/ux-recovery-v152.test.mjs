import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { documentDisplayValue } from '../dist/src/lib/document-language.js';
import { setUiLanguage } from '../dist/src/lib/i18n.js';

const read=path=>readFile(path,'utf8');

test('v152 keeps application and printable cascade boundaries explicit',async()=>{
  const [html,sw,css,reports]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('src/styles/ux-recovery-v152.css'),read('src/styles/reports-v135.css')
  ]);
  assert.ok(html.indexOf('ux-recovery-v152.css')<html.indexOf('document-premium-redesign-v141.css'));
  assert.ok(sw.includes('./styles/ux-recovery-v152.css'));
  assert.match(sw,/^const CACHE = 'lourex-invoice-v159';$/m);
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v156'"));
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v153'"));
  assert.ok(sw.includes("const CACHE = 'lourex-invoice-v152'"));
  assert.doesNotMatch(css,/\n\.invoice-page/);
  assert.ok(!reports.includes('.app-ui .main-nav'));
});

test('v152 mobile editor controls reserve layout space instead of covering content',async()=>{
  const [wrapper,core,css]=await Promise.all([
    read('src/components/EditorPage.tsx'),read('src/components/EditorPageCore.tsx'),read('src/styles/ux-recovery-v152.css')
  ]);
  assert.match(core,/data-editor-nav-slot/);
  assert.match(wrapper,/createPortal\(sectionNavigator,navSlot\)/);
  assert.match(css,/\.app-ui \.editor-section-navigator\{[\s\S]*?position:relative!important/);
  assert.match(css,/\.app-ui \.mobile-editor-actionbar\{[\s\S]*?position:relative!important/);
  assert.match(css,/padding:[^;]*env\(safe-area-inset-bottom\)/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('v152 keeps PDF and share actions awaitable visible and single-armed',async()=>{
  const [app,editor,documents,bridge]=await Promise.all([
    read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx'),read('src/components/DocumentsPage.tsx'),read('public/ios-print-bridge.js')
  ]);
  assert.match(app,/private requestPrint=async/);
  assert.match(editor,/await this\.props\.onPrint\(finalDoc,mode\)/);
  assert.match(editor,/disabled=\{this\.state\.issuing\}/);
  assert.match(documents,/private runOutput=async/);
  assert.match(documents,/Preparing…/);
  assert.doesNotMatch(bridge,/document\.addEventListener\('click',[\s\S]*issue-review/);
  assert.match(bridge,/pendingInlineOverlay\?\.isConnected&&pendingMode===nextMode/);
  assert.doesNotMatch(bridge,/if \(!isAppleTouch\) return/);
  assert.match(bridge,/if\(!pendingArmed\|\|document\.body\.classList\.contains\('printing-financial-report'\)\)/);
  assert.match(bridge,/navigator\.share\(\{ files: \[file\] \}\)/);
  assert.match(bridge,/window\.__LOUREX_OUTPUT_ERROR__/);
  assert.match(app,/__LOUREX_OUTPUT_ERROR__\?\.\(message\)/);
});

test('v152 cloud persistence is local-first coalesced retryable and automatically presented',async()=>{
  const [app,db,freshness,modal,i18n]=await Promise.all([
    read('src/app/App.tsx'),read('src/storage/db.ts'),read('src/cloud/freshness.ts'),read('src/components/CloudAccountModal.tsx'),read('src/lib/i18n.ts')
  ]);
  assert.match(app,/type CloudSyncState='local'\|'queued'\|'syncing'\|'synced'\|'offline'\|'error'/);
  assert.match(app,/private scheduleCloudSync=\(delay=220\)/);
  assert.match(app,/pushLocalVaultToCloud\(user\.uid,local\)/);
  assert.match(app,/Newer local changes are waiting to sync/);
  assert.match(app,/cloudRetryDelay=Math\.min\(60_000,this\.cloudRetryDelay\*2\)/);
  assert.match(app,/Setup saved locally — cloud backup queued/);
  assert.match(app,/private cloudHeaderLabel=/);
  const setup=app.slice(app.indexOf('private finishSetup='),app.indexOf('private unlock='));
  assert.doesNotMatch(setup,/await pushLocalVaultToCloud/);
  assert.match(db,/let dbPromise:Promise<IDBDatabase>\|null=null/);
  assert.match(freshness,/if\(pending\)window\.clearTimeout\(pending\)/);
  assert.match(modal,/Your LOUREX data is saved automatically to this account/);
  assert.doesNotMatch(modal,/Saved locally — waiting to sync|Sync Now|مزامنة الآن/);
  assert.match(i18n,/automaticSyncCopy/);
  assert.match(i18n,/automatic synchronization/);
});

test('v152 small encrypted vaults use one atomic cloud transaction',async()=>{
  const [cloud,vault]=await Promise.all([read('src/cloud/firebase.ts'),read('src/storage/vault.ts')]);
  assert.match(cloud,/commitSingleChunkIfUnchanged/);
  assert.match(cloud,/transaction\.set\(chunkRef/);
  assert.match(cloud,/if\(chunks\.length===1\)await commitSingleChunkIfUnchanged/);
  assert.match(cloud,/localSnapshot\?:EncryptedVaultRecord\|null/);
  assert.match(vault,/Promise<EncryptedVaultRecord>/);
  assert.match(vault,/return encrypted/);
});

test('v152 report dates retain native picking behind stable mobile labels',async()=>{
  const [page,css]=await Promise.all([read('src/components/ReportsPage.tsx'),read('src/styles/ux-recovery-v152.css')]);
  assert.match(page,/reports-date-value/);
  assert.match(page,/type="date"/);
  assert.match(page,/aria-label=\{t\('From date','تاريخ البداية'\)\}/);
  assert.match(page,/aria-label=\{t\('To date','تاريخ النهاية'\)\}/);
  assert.match(css,/reports-date-control input\[type="date"\][\s\S]*opacity:\.001/);
});

test('v152 preserves document-language isolation for every app/document language pair',()=>{
  for(const uiLanguage of ['en','ar']){
    setUiLanguage(uiLanguage);
    assert.equal(documentDisplayValue('English terms','en'),'English terms');
    assert.equal(documentDisplayValue('شروط عربية','en'),'');
    assert.equal(documentDisplayValue('شروط عربية','ar'),'شروط عربية');
    assert.equal(documentDisplayValue('English terms','ar'),'');
    assert.equal(documentDisplayValue('English العربية','bilingual'),'English العربية');
  }
});

test('v152 gives bilingual English and Arabic titles equivalent perceived weight',async()=>{
  const css=await read('src/styles/document-premium-redesign-v141.css');
  assert.match(css,/\.invoice-page\.lang-bilingual \.doc-title>em\{font-size:20px;line-height:1\.18;font-style:normal;font-weight:800/);
  assert.match(css,/\.invoice-page\.lang-bilingual\.template-minimal \.doc-title>em,[\s\S]*font-size:22px/);
});
