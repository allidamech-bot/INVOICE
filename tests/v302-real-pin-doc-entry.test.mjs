import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v302 requires a user PIN after account authentication and on every new runtime',async()=>{
  const [auth,session,selector]=await Promise.all([
    read('src/components/AuthScreens.tsx'),
    read('src/storage/session.ts'),
    read('src/app/AuthScreenSelector.tsx')
  ]);
  assert.match(selector,/const cloudUser=currentCloudUser\(\)/);
  assert.match(selector,/if \(!cloudUser\) \{[\s\S]*<AccountEntryScreen/);
  assert.match(selector,/if \(props\.mode === 'unlock'\) \{[\s\S]*<UnlockScreen/);
  assert.ok(selector.indexOf('if (!cloudUser)')<selector.indexOf("if (props.mode === 'unlock')"),'account gateway must gate PIN unlock');
  assert.match(selector,/return <SetupScreen/);
  assert.match(auth,/Create PIN · 4–12 digits/);
  assert.match(auth,/Create PIN · 4–12 digits/);
  assert.match(auth,/changePin\(this\.accountSecret,pin\)/);
  assert.doesNotMatch(auth,/No separate access PIN is required/);
  assert.match(session,/let runtimePinAuthorized=false/);
  assert.match(session,/establishSession[\s\S]*runtimePinAuthorized=true/);
  assert.match(session,/getSessionKey[\s\S]*if\(!runtimePinAuthorized\)return null/);
  assert.match(session,/resumeAccountSession[\s\S]*runtimePinAuthorized=false[\s\S]*return false/);
});

test('editor provides accessible multi-file image, PDF and supplier document uploads without legacy injection',async()=>{
  const [attachments,entry,core,types]=await Promise.all([
    read('src/components/DocumentAttachmentsSection.tsx'),
    read('public/document-entry-v302.js'),
    read('src/components/EditorPageCore.tsx'),
    read('src/types.ts')
  ]);
  assert.match(attachments,/id="document-attachments"/);
  assert.match(attachments,/className="attachment-add-button"/);
  assert.match(attachments,/onClick=\{\(\)=>this\.input\?\.click\(\)\}/);
  assert.match(attachments,/type="file" accept="[^"]*application\/pdf/);
  assert.match(attachments,/multiple onChange=\{this\.add\}/);
  assert.match(attachments,/MAX_FILE_BYTES/);
  assert.match(attachments,/MAX_TOTAL_BYTES/);
  assert.match(attachments,/MAX_FILES/);
  assert.match(core,/<DocumentAttachmentsSection document=\{d\} onChange=\{next=>this\.mutate\(\(\)=>next\)\}/);
  assert.match(types,/attachments\?: DocumentAttachment\[\]/);
  assert.match(entry,/function removeLegacyInjectedControls\(\)/);
  assert.match(entry,/\.v302-direct-document-actions,\.v302-attachments-shortcut/);
  assert.doesNotMatch(entry,/function injectAttachmentsShortcut/);
});

test('native creation menus expose quotation, invoice and purchase order with dedicated document kinds',async()=>{
  const [shell,entry,kinds]=await Promise.all([
    read('src/components/AppShell.tsx'),
    read('public/document-entry-v302.js'),
    read('src/lib/document-kinds.ts')
  ]);
  for(const kind of ['proforma','invoice','purchase-order']){
    assert.ok(shell.includes("onClick={()=>this.createDocument('"+kind+"')}"),kind+' must have a real click action');
  }
  assert.match(shell,/private createDocument=\(kind:DocumentKind\)=>\{/);
  assert.match(shell,/this\.props\.onNew\(kind\)/);
  assert.match(shell,/aria-label=\{t\('New Document','مستند جديد'\)\}/);
  assert.match(entry,/const menuKinds=\[[^\]]*'purchase-order'/);
  assert.match(entry,/function normalizeCreateMenuKinds\(\)/);
  assert.match(entry,/function rememberNativeDocumentKind\(event\)/);
  assert.match(kinds,/kind:'purchase-order'[\s\S]*titleEn:'PURCHASE ORDER'/);
  assert.match(kinds,/kind:'proforma'[\s\S]*titleEn:'QUOTATION'/);
  assert.match(kinds,/kind:'invoice'[\s\S]*titleEn:'COMMERCIAL INVOICE'/);
});

test('current boot owns full dynamic viewport and theme palette before React mounts',async()=>{
  const [css,html,sw]=await Promise.all([
    read('src/styles/security-documents-closeout-v302.css'),
    read('index.html'),
    read('public/sw.js')
  ]);
  assert.match(html,/id="lourex-boot-style"/);
  assert.match(html,/html\[data-lourex-booting="true"\]/);
  assert.match(html,/height:100dvh!important/);
  assert.match(html,/#lourex-boot\.loading-screen\{position:fixed;inset:-2px;z-index:2147483000/);
  assert.match(html,/background:var\(--boot-bg,#0a1826\)/);
  assert.match(html,/data-ui-theme="dark"/);
  assert.match(html,/data-ui-theme="light"/);
  assert.match(css,/#root>\.loading-screen,[\s\S]*#lourex-boot\.loading-screen/);
  assert.match(css,/min-height:calc\(100dvh \+ 224px\)!important/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/security-documents-closeout-v302\.css'\)/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/document-entry-v302\.js'\)/);
});

test('v302 installs a fresh PWA cache that contains the security and document-entry closeout assets',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/const CACHE = 'lourex-invoice-v302';/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/security-documents-closeout-v302\.css'\)/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/document-entry-v302\.js'\)/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v301'; preserved as the immediate pre-v302 cache generation/);
});
