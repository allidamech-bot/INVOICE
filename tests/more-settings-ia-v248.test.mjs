import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('current More is a navigation hub that keeps Operations, Finance, Account and Settings distinct',async()=>{
 const shell=await read('src/components/AppShell.tsx');
 for(const token of ['ta-mobile-sheet','ta-sheet-account','ta-sheet-group','ta-sheet-link','Products & Inventory','Suppliers and purchase workflow','Receivables, collections and expenses','Period analysis and profitability','Identity, business profile and account access','Business, documents, security and data'])assert.ok(shell.includes(token),token);
 assert.ok(!shell.includes('Suppliers, purchases, expenses and inventory'),'retired mixed Operations wording must not reappear');
 assert.ok(shell.includes("this.requestSettingsScope('account')"));
 assert.ok(shell.includes("this.requestSettingsScope('settings')"));
});

test('v248 Account owns identity, legal registration and access only',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const account=settings.slice(settings.indexOf('private accountProfile'),settings.indexOf('private workspacePreferences'));
  for(const token of ['Company profile','Company logo','Identity & contact','Legal & registration','Account access','VAT Number','Tax Number','Commercial Registration'])assert.ok(account.includes(token),token);
  for(const misplaced of ['Default Payment Terms','Default Incoterm','Default Delivery Time','Auto Lock','Numbering'])assert.ok(!account.includes(misplaced),`Account must not own ${misplaced}`);
});

test('v248 Workspace owns interface language and workspace-wide currency only',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const workspace=settings.slice(settings.indexOf('private workspacePreferences'),settings.indexOf('private documentSettings'));
  assert.match(workspace,/Interface Language/);
  assert.match(workspace,/Default Currency/);
  assert.match(workspace,/Interface language applies immediately/);
  for(const misplaced of ['Bank Name','Default Document Language','Default Payment Terms','Default Incoterm','Default Delivery Time','Signature','Stamp'])assert.ok(!workspace.includes(misplaced),`Workspace must not own ${misplaced}`);
});

test('Documents settings own output artwork, validity and independent forward-only document numbering',async()=>{
 const settings=await read('src/components/SettingsModal.tsx');
 const begin=settings.indexOf('private documentSettings('),end=settings.indexOf('private securitySettings',begin);
 assert.ok(begin>=0&&end>begin,'document settings section exists');
 const docs=settings.slice(begin,end);
 for(const token of ['Document artwork','Signature','Stamp','Default Document Language','Default Validity','Default Footer Text','Default Notes','Numbering','Quotation Prefix','Invoice Prefix','proformaPrefix','invoicePrefix','Document sequences only move forward'])assert.ok(docs.includes(token),token);
 for(const misplaced of ['Default Payment Terms','Default Incoterm','Default Delivery Time','Bank Name','Tax presets'])assert.ok(!docs.includes(misplaced),'commercial settings must not move into Documents: '+misplaced);
});

test('v248 Commercial consolidates primary bank, alternate banks and trade defaults',async()=>{
  const commercial=await read('src/components/CommercialControlsSettings.tsx');
  for(const token of ['Primary receiving account','Bank accounts','Default bank account for new documents','Commercial defaults','Default Payment Terms','Default Incoterm','Default Delivery Time','Tax presets','Payment terms','Pricing policy'])assert.ok(commercial.includes(token),token);
  assert.match(commercial,/updatePrimaryBank/);
  assert.match(commercial,/defaultBankAccountId/);
});

test('v248 Security exposes the real runtime session controls',async()=>{
  const settings=await read('src/components/SettingsModal.tsx');
  const security=settings.slice(settings.indexOf('private securitySettings'),settings.indexOf('render():any'));
  assert.match(security,/Session protection/);
  assert.match(security,/Auto Lock/);
  assert.match(security,/autoLockMinutes/);
  assert.match(security,/After 5 minutes/);
  assert.match(security,/After 15 minutes/);
  assert.match(security,/After 30 minutes/);
  assert.match(security,/Lock Now/);
  assert.match(settings,/private lockNow=\(\)=>/);
  assert.match(settings,/this\.props\.onLock\(\)/);
  assert.match(security,/Restore from Cloud/);
  assert.match(security,/Device PIN/);
});

test('v248 publishes a fresh installed-app generation without adding a data migration',async()=>{
  const [patch,types]=await Promise.all([read('scripts/pwa-cache-v205.mjs'),read('src/types.ts')]);
  assert.match(patch,/lourex-invoice-v248: More and Settings information architecture refresh/);
  assert.match(types,/export interface CompanySettings/);
  assert.match(types,/export interface AppSettings/);
});
