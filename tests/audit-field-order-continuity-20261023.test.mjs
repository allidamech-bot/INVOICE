import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem} from '../dist/src/lib/operations.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {savedItemFromDocumentItem} from '../dist/src/lib/saved-items.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {readPlainBackup} from '../dist/src/lib/backup.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';

const scope={workspaceId:'default',branchId:'main'};
const reordered=value=>Array.isArray(value)?value.map(reordered):value&&typeof value==='object'
 ?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reordered(item)])):value;
function fixture(){
 const v=emptyVault(),supplier={...createSupplier(),...scope,id:'qa-audit-supplier',nameEn:'Synthetic supplier'};
 const purchase={...createPurchase([],[supplier],'USD'),...scope,id:'qa-audit-purchase'};
 purchase.items=[{...createPurchaseItem(),id:'qa-line-one',descriptionEn:'Service one',quantity:'1',unitCost:'10'},
  {...createPurchaseItem(),id:'qa-line-two',descriptionEn:'Service two',quantity:'2',unitCost:'20'}];
 const doc=createBlankDocument('invoice','QA-ITEM',v.company);
 const product={...savedItemFromDocumentItem(doc.items[0],'USD'),...scope,id:'qa-audit-product'};
 const customer={...scope,id:'qa-audit-customer',companyNameEn:'Synthetic customer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:'',preferredCurrency:'USD',paymentTermsPresetId:'',creditLimit:'',createdAt:'2026-10-01T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z'};
 return{...v,suppliers:[supplier],purchases:[purchase],customers:[customer],savedItems:[product]};
}
const readBackup=async payload=>{const text=JSON.stringify({format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,payload});return readPlainBackup({size:Buffer.byteLength(text),text:async()=>text});};
for(const collection of ['customers','suppliers','purchases','savedItems'])test(`same ${collection} values with reordered JSON keys do not create an audit update`,()=>{
 const base=fixture(),intended=structuredClone(base);intended[collection]=reordered(intended[collection]);
 const before=JSON.stringify(base),result=appendAuditEventsForVaultDiff(base,intended);
 assert.deepEqual(result.documentEvents,[]);assert.equal(JSON.stringify(base),before);
});
test('nested purchase-item key order is ignored while line order and monetary changes remain auditable',()=>{
 const base=fixture(),same=structuredClone(base);same.purchases[0].items=reordered(same.purchases[0].items);
 assert.equal(appendAuditEventsForVaultDiff(base,same).documentEvents.length,0);
 for(const mutate of [v=>v.purchases[0].items.reverse(),v=>v.purchases[0].items[0].unitCost='11']){
  const changed=structuredClone(base);mutate(changed);const result=appendAuditEventsForVaultDiff(base,changed);
  assert.equal(result.documentEvents.length,1);assert.equal(result.documentEvents[0].auditEntityType,'purchase');
  assert.equal(result.documentEvents[0].auditAction,'updated');
 }
});
test('reordered records still detect real edits without changing existing timestamp/usage exclusions',()=>{
 const base=fixture(),same=reordered(base);same.suppliers[0].updatedAt='2099-01-01T00:00:00.000Z';
 same.savedItems[0].usageCount=20;same.savedItems[0].lastUsedAt='2099-01-01T00:00:00.000Z';
 assert.equal(appendAuditEventsForVaultDiff(base,same).documentEvents.length,0);
 same.suppliers[0].nameEn='Corrected supplier';const result=appendAuditEventsForVaultDiff(base,same);
 assert.equal(result.documentEvents.length,1);assert.equal(result.documentEvents[0].auditEntityId,'qa-audit-supplier');
 assert.equal(result.documentEvents[0].auditEntityLabel,'Corrected supplier');
});

async function persistence(){
 const full=fixture();let stored={uid:'qa-audit-account',localRevision:1,payload:structuredClone(full)},reject=false;
 const context={exports:{},Error,Promise,structuredClone,scopeVault,applyWorkspaceScope,overlayWorkspaceScope,mergeVaultIntent,appendAuditEventsForVaultDiff,synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
  currentCloudUser:()=>({uid:'qa-audit-account'}),activeAccountStorageUid:()=> 'qa-audit-account',
  getPlainWorkspace:async()=>structuredClone(stored),updatePlainWorkspaceIfUnchanged:async(uid,revision,payload)=>{
   if(reject||uid!==stored.uid||revision!==stored.localRevision)return null;
   stored={uid,localRevision:revision+1,payload:structuredClone(payload)};return stored;
  }};
 const source=await readFile('src/app/App.tsx','utf8'),parsed=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const cls=parsed.statements.find(ts.isClassDeclaration),member=cls.members.find(node=>node.name?.getText(parsed)==='persist');assert.ok(member);
 vm.runInNewContext(ts.transpileModule('class Harness{'+member.getText(parsed)+'}\nexports.Harness=Harness;',{
  compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
 }).outputText,context);
 const h=new context.exports.Harness();h.state={vault:structuredClone(full),cloudUser:{uid:stored.uid},unlocked:true};
 h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);h.waitForProtectedDataOperation=async()=>{};
 h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};h.scheduleCloudSync=()=>{};
 return{h,get:()=>stored,reject:()=>{reject=true;}};
}
test('actual App.persist replays reordered backup data without phantom events and retains one real update after reload',async()=>{
 const p=await persistence(),reopened=await readBackup(reordered(p.get().payload));
 await p.h.persist(reopened);assert.equal(p.get().payload.documentEvents.length,0);
 const changed=structuredClone(p.h.requireVault());changed.suppliers[0].nameEn='Accepted correction';
 await p.h.persist(changed);const accepted=structuredClone(p.get().payload.documentEvents);
 assert.equal(accepted.length,1);assert.equal(accepted[0].auditAction,'updated');
 assert.equal(accepted[0].auditEntityId,'qa-audit-supplier');
 const restored=await readBackup(reordered(p.get().payload));
 assert.deepEqual(restored.documentEvents,accepted,'backup retains event identity, time, actor, action and scope');
 await p.h.persist(restored);await p.h.persist(reordered(p.h.requireVault()));
 assert.deepEqual(p.get().payload.documentEvents,accepted,'unchanged retries do not invent extra edits');
});
test('failed actual persistence cannot leave a successful audit event in storage or current UI state',async()=>{
 const p=await persistence(),before=JSON.stringify(p.get()),uiBefore=JSON.stringify(p.h.state.vault);
 const changed=reordered(p.h.requireVault());changed.suppliers[0].nameEn='Rejected correction';p.reject();
 await assert.rejects(p.h.persist(changed),/Another tab updated/);
 assert.equal(JSON.stringify(p.get()),before);assert.equal(JSON.stringify(p.h.state.vault),uiBefore);
});
