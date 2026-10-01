import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function clone(value){return structuredClone(value);}

async function modules(){
  const defaults=await import('../dist/src/lib/defaults.js');
  const workspaces=await import('../dist/src/lib/workspaces.js');
  return{defaults,workspaces};
}

function secondWorkspace(full){
  const now='2026-10-01T00:00:00.000Z';
  return{
    id:'workspace-b',name:'Beta Trading',company:{...clone(full.company),nameEn:'Beta Trading',nameAr:'بيتا'},
    numbering:{...clone(full.appSettings.numbering),proformaLast:77},smartDefaults:{...clone(full.appSettings.smartDefaults),currency:'EUR'},createdAt:now,updatedAt:now
  };
}

test('schema v20+ contains encrypted workspace and branch directory fields',async()=>{
  const [defaults,types,vault]=await Promise.all([read('src/lib/defaults.ts'),read('src/types.ts'),read('src/storage/vault.ts')]);
  const schemaVersion=Number(/export const APP_SCHEMA_VERSION\s*=\s*(\d+)/.exec(defaults)?.[1]??0);
  assert.ok(schemaVersion>=20,'Multi-company isolation requires schema v20 or newer.');
  assert.match(types,/interface WorkspaceRecord/);
  assert.match(types,/interface BranchRecord/);
  assert.match(types,/activeWorkspaceId: string/);
  assert.match(types,/activeBranchId: string/);
  assert.match(types,/workspaces: WorkspaceRecord\[\]/);
  assert.match(types,/branches: BranchRecord\[\]/);
  assert.match(vault,/migrated\.workspaces=/);
  assert.match(vault,/migrated\.branches=/);
});

test('scopeVault isolates company and branch records deterministically',async()=>{
  const {defaults,workspaces}=await modules();
  const full=defaults.emptyVault();
  const beta=secondWorkspace(full);full.workspaces.push(beta);
  full.branches.push({id:'branch-a2',workspaceId:'default',name:'Jeddah',code:'JED',city:'Jeddah',country:'Saudi Arabia',active:true,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
  full.branches.push({id:'branch-b',workspaceId:'workspace-b',name:'Europe',code:'EU',city:'',country:'',active:true,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
  full.customers=[{id:'ca',workspaceId:'default'},{id:'cb',workspaceId:'workspace-b'}];
  full.suppliers=[{id:'sa',workspaceId:'default'},{id:'sb',workspaceId:'workspace-b'}];
  full.savedItems=[{id:'ia',workspaceId:'default'},{id:'ib',workspaceId:'workspace-b'}];
  full.documents=[{id:'da',workspaceId:'default',branchId:'main'},{id:'da2',workspaceId:'default',branchId:'branch-a2'},{id:'db',workspaceId:'workspace-b',branchId:'branch-b'}];
  full.purchases=[{id:'pa',workspaceId:'default',branchId:'main'},{id:'pb',workspaceId:'workspace-b',branchId:'branch-b'}];
  const scoped=workspaces.scopeVault(full);
  assert.deepEqual(scoped.customers.map(x=>x.id),['ca']);
  assert.deepEqual(scoped.suppliers.map(x=>x.id),['sa']);
  assert.deepEqual(scoped.savedItems.map(x=>x.id),['ia']);
  assert.deepEqual(scoped.documents.map(x=>x.id),['da']);
  assert.deepEqual(scoped.purchases.map(x=>x.id),['pa']);
  const betaVault=workspaces.activateWorkspace(full,'workspace-b','branch-b');
  const betaScope=workspaces.scopeVault(betaVault);
  assert.deepEqual(betaScope.customers.map(x=>x.id),['cb']);
  assert.deepEqual(betaScope.documents.map(x=>x.id),['db']);
  assert.equal(betaScope.company.nameEn,'Beta Trading');
  assert.equal(betaScope.appSettings.numbering.proformaLast,77);
});

test('mergeScopedVault changes only active namespace and preserves hidden records byte-for-byte',async()=>{
  const {defaults,workspaces}=await modules();
  const full=defaults.emptyVault();
  const beta=secondWorkspace(full);full.workspaces.push(beta);
  full.branches.push({id:'branch-b',workspaceId:'workspace-b',name:'Europe',code:'EU',city:'',country:'',active:true,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
  full.customers=[{id:'ca',workspaceId:'default',companyNameEn:'Alpha'},{id:'cb',workspaceId:'workspace-b',companyNameEn:'Beta customer',sentinel:{keep:true}}];
  full.documents=[{id:'da',workspaceId:'default',branchId:'main',notes:'alpha'},{id:'db',workspaceId:'workspace-b',branchId:'branch-b',notes:'beta',sentinel:{keep:true}}];
  const betaCustomerBefore=JSON.stringify(full.customers[1]);
  const betaDocumentBefore=JSON.stringify(full.documents[1]);
  const scoped=workspaces.scopeVault(full);
  scoped.customers=[...scoped.customers,{id:'ca2',companyNameEn:'New Alpha'}];
  scoped.documents=[...scoped.documents,{id:'da2',notes:'new'}];
  const stamped=workspaces.applyWorkspaceScope(workspaces.scopeVault(full),scoped);
  const merged=workspaces.mergeScopedVault(full,stamped);
  assert.equal(JSON.stringify(merged.customers.find(x=>x.id==='cb')),betaCustomerBefore);
  assert.equal(JSON.stringify(merged.documents.find(x=>x.id==='db')),betaDocumentBefore);
  assert.equal(merged.customers.find(x=>x.id==='ca2').workspaceId,'default');
  assert.equal(merged.documents.find(x=>x.id==='da2').workspaceId,'default');
  assert.equal(merged.documents.find(x=>x.id==='da2').branchId,'main');
});

test('external mutation projection cannot see inactive workspace directory or asset pool',async()=>{
  const {defaults,workspaces}=await modules();const full=defaults.emptyVault();
  full.workspaces.push(secondWorkspace(full));
  full.branches.push({id:'branch-b',workspaceId:'workspace-b',name:'Europe',code:'EU',city:'',country:'',active:true,createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'});
  full.companyAssets=[{id:'secret-beta-logo',dataUrl:'data:image/png;base64,SECRET'}];
  const projected=workspaces.scopeVaultForExternalMutation(full);
  assert.equal(projected.workspaces.length,1);
  assert.equal(projected.workspaces[0].id,'default');
  assert.equal(projected.branches.length,1);
  assert.equal(projected.branches[0].id,'main');
  assert.equal(Object.prototype.hasOwnProperty.call(projected,'companyAssets'),false);
});

test('new workspace resets numbering and does not inherit legal/contact/bank identity',async()=>{
  const {defaults,workspaces}=await modules();const full=defaults.emptyVault();
  full.company={...full.company,addressEn:'Secret address',phone:'+90 555',email:'old@example.test',website:'old.example',vatNumber:'VAT-OLD',commercialRegistration:'CR-OLD',bank:{bankName:'Old Bank',accountName:'Old Co',iban:'TRSECRET',swift:'SECRET',currency:'USD'}};
  full.appSettings.numbering={...full.appSettings.numbering,proformaLast:91,invoiceLast:44,purchaseOrderLast:22};
  const next=workspaces.createWorkspace(full,'New Company');const created=next.workspaces.at(-1);
  assert.equal(created.numbering.proformaLast,0);assert.equal(created.numbering.invoiceLast,0);assert.equal(created.numbering.purchaseOrderLast,0);
  assert.equal(created.company.nameEn,'New Company');assert.equal(created.company.addressEn,'');assert.equal(created.company.phone,'');assert.equal(created.company.email,'');assert.equal(created.company.website,'');assert.equal(created.company.vatNumber,'');assert.equal(created.company.commercialRegistration,'');assert.equal(created.company.bank.iban,'');
  assert.equal(next.branches.at(-1).workspaceId,created.id);
});

test('application and AI bridge use scoped runtime while backups remain full-vault',async()=>{
  const [app,index,shell,settings]=await Promise.all([read('src/app/App.tsx'),read('src/app/index.tsx'),read('src/components/AppShell.tsx'),read('src/components/SettingsModal.tsx')]);
  assert.match(app,/return scopeVault\(this\.state\.vault\)/);
  assert.match(app,/const fullVault=this\.state\.vault/);
  assert.match(app,/overlayWorkspaceScope\(this\.state\.vault,current\)/);
  assert.match(index,/scopeVaultForExternalMutation\(latestFull\)/);
  assert.match(index,/mergeScopedVault\(latestFull/);
  assert.match(shell,/lx-workspace-switcher/);
  assert.match(shell,/ta-sheet-workspace/);
  assert.match(shell,/lourex-settings-tab','workspaces/);
  assert.match(settings,/tab:'company'\|'workspaces'/);
  assert.match(settings,/WorkspaceBranchSettings/);
});

test('notification center remains branch scoped and stale refreshes cannot overwrite mutations',async()=>{
  const notifications=await read('src/components/NotificationCenterLive.tsx');
  assert.match(notifications,/buildNotificationCenter\(scopeVault\(session\.vault\),todayIso\(\)\)/);
  assert.match(notifications,/buildNotificationCenter\(scopeVault\(next\),todayIso\(\)\)/);
  assert.match(notifications,/private mutationGeneration=0/);
  assert.match(notifications,/startedAtMutationGeneration!==this\.mutationGeneration/);
  assert.match(notifications,/optimisticSnapshot\(previous,item,action\)/);
  assert.match(notifications,/snapshot:previous/);
});

test('primary navigation freeze remains unchanged',async()=>{
  const shell=await read('src/components/AppShell.tsx');
  for(const screen of ['home','documents','customers','items','operations','receivables','reports'])assert.match(shell,new RegExp(`navItem\\('${screen}'`));
  assert.doesNotMatch(shell,/navItem\('workspaces'/);
  assert.match(shell,/className="ta-mobile-nav"/);
  assert.match(shell,/onClick=\{\(\)=>this\.navigate\('home'\)\}/);
  assert.match(shell,/onClick=\{\(\)=>this\.navigate\('documents'\)\}/);
  assert.match(shell,/className="ta-mobile-create"/);
  assert.match(shell,/onClick=\{\(\)=>this\.navigate\('customers'\)\}/);
  assert.match(shell,/aria-controls="ta-mobile-more"/);
  assert.match(shell,/onClick=\{this\.toggleMore\}/);
});