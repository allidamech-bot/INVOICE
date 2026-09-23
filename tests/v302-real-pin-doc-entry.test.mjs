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
  assert.match(selector,/if \(!currentCloudUser\(\)\)/);
  assert.match(auth,/Create PIN · 4–12 digits/);
  assert.match(auth,/PIN required on every app start/);
  assert.match(auth,/changePin\(this\.accountSecret,pin\)/);
  assert.doesNotMatch(auth,/No separate access PIN is required/);
  assert.match(session,/let runtimePinAuthorized=false/);
  assert.match(session,/establishSession[\s\S]*runtimePinAuthorized=true/);
  assert.match(session,/getSessionKey[\s\S]*if\(!runtimePinAuthorized\)return null/);
  assert.match(session,/resumeAccountSession[\s\S]*runtimePinAuthorized=false[\s\S]*return false/);
});

test('v302 makes image and PDF attachments discoverable inside the document editor',async()=>{
  const [attachments,entry]=await Promise.all([
    read('src/components/DocumentAttachmentsSection.tsx'),
    read('public/document-entry-v302.js')
  ]);
  assert.match(attachments,/id="document-attachments"/);
  assert.match(attachments,/accept="image\/\*,application\/pdf,\.pdf"/);
  assert.match(attachments,/Add image \/ PDF/);
  assert.match(entry,/v302-attachments-shortcut/);
  assert.match(entry,/document-attachments/);
  assert.match(entry,/add\.click\(\)/);
});

test('v302 exposes quotation, invoice and purchase order as direct home actions',async()=>{
  const entry=await read('public/document-entry-v302.js');
  assert.match(entry,/directAction\('proforma',0,'New Quotation','عرض سعر جديد'/);
  assert.match(entry,/directAction\('invoice',1,'New Invoice','فاتورة جديدة'/);
  assert.match(entry,/directAction\('purchase-order',2,'Purchase Order','طلب شراء'/);
  assert.match(entry,/Supplier order & delivery terms/);
});

test('v302 loading surface owns the full dynamic viewport without white seams',async()=>{
  const [css,html]=await Promise.all([
    read('src/styles/security-documents-closeout-v302.css'),
    read('index.html')
  ]);
  assert.match(css,/#root>\.loading-screen[\s\S]*position:fixed!important[\s\S]*inset:0!important/);
  assert.match(css,/height:100dvh!important/);
  assert.match(css,/background:#061820!important/);
  assert.match(html,/security-documents-closeout-v302\.css\?v=302/);
  assert.match(html,/document-entry-v302\.js\?v=302/);
});

test('v302 installs a fresh PWA cache that contains the security and document-entry closeout assets',async()=>{
  const sw=await read('public/sw.js');
  assert.match(sw,/const CACHE = 'lourex-invoice-v302';/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/styles\/security-documents-closeout-v302\.css'\)/);
  assert.match(sw,/LOCAL_CORE\.push\('\.\/document-entry-v302\.js'\)/);
  assert.match(sw,/const CACHE = 'lourex-invoice-v301'; preserved as the immediate pre-v302 cache generation/);
});
