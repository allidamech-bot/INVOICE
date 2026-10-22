import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {createDocumentEvent} from '../dist/src/lib/document-lifecycle.js';
import {scopeVault,applyWorkspaceScope,overlayWorkspaceScope} from '../dist/src/lib/workspaces.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {appendAuditEventsForVaultDiff} from '../dist/src/lib/audit-diff.js';
import {synchronizeActiveWorkspaceOnSave} from '../dist/src/storage/vault.js';
import {assertPlainCloudWorkspaceUploadable} from '../dist/src/cloud/plain-workspace.js';

function harness(source,names,context){
  const parsed=ts.createSourceFile('source.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const cls=parsed.statements.find(node=>ts.isClassDeclaration(node));assert.ok(cls);
  const members=cls.members.filter(node=>node.name&&names.includes(node.name.getText(parsed))).map(node=>node.getText(parsed));
  vm.runInNewContext(ts.transpileModule('class Harness{'+members.join('\n')+'}\nexports.Harness=Harness;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
  }).outputText,context);
  return new context.exports.Harness();
}

async function fixture(){
  const full=emptyVault(),invoice=createBlankDocument('invoice','INV-QA-RECEIPT',full.company);
  Object.assign(invoice,{id:'qa-invoice',status:'final',role:'standard',lifecycleStatus:'active',
    issueDate:'2026-10-01',workspaceId:'default',branchId:'main',
    customerSnapshot:{sourceCustomerId:'qa-customer',companyNameEn:'Synthetic customer',companyNameAr:'',
      contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.items=[{...invoice.items[0],descriptionEn:'Synthetic service',quantity:'1',unitPrice:'100',stockTreatment:'non-stock'}];
  const payment=normalizePaymentRecord(invoice,[],{id:'qa-receipt',invoiceId:invoice.id,amount:'40',currency:'USD',
    date:'2026-10-02',method:'bank-transfer',reference:'original-40',notes:'',
    createdAt:'2026-10-02T09:00:00.000Z',updatedAt:'2026-10-02T09:00:00.000Z'},[invoice]);
  full.branches.push({...full.branches[0],id:'east',name:'East'});
  const hiddenInvoice={...structuredClone(invoice),id:'qa-hidden-invoice',number:'INV-QA-HIDDEN',branchId:'east'};
  const hiddenPayment={...structuredClone(payment),id:'qa-hidden-receipt',invoiceId:hiddenInvoice.id,invoiceNumber:hiddenInvoice.number,branchId:'east'};
  full.documents=[invoice,hiddenInvoice];full.payments=[payment,hiddenPayment];
  let stored={uid:'qa-account',localRevision:1,payload:structuredClone(full)},writes=0,syncs=0,reject=false;
  const toasts=[];
  const context={exports:{},Error,Promise,structuredClone,t:en=>en,normalizePaymentRecord,createDocumentEvent,
    scopeVault,applyWorkspaceScope,overlayWorkspaceScope,mergeVaultIntent,appendAuditEventsForVaultDiff,
    synchronizeActiveWorkspaceOnSave,assertPlainCloudWorkspaceUploadable,
    currentCloudUser:()=>({uid:'qa-account'}),activeAccountStorageUid:()=> 'qa-account',
    getPlainWorkspace:async()=>structuredClone(stored),
    updatePlainWorkspaceIfUnchanged:async(uid,revision,payload)=>{
      if(reject||uid!==stored.uid||revision!==stored.localRevision)return null;
      writes++;stored={uid,localRevision:revision+1,payload:structuredClone(payload)};return stored;
    }};
  const h=harness(await readFile('src/app/App.tsx','utf8'),['persist','savePayment','deletePayment'],context);
  h.state={vault:structuredClone(full),cloudUser:{uid:'qa-account'},unlocked:true};
  h.requireVault=()=>scopeVault(h.state.vault);h.vaultWriteTail=Promise.resolve(null);h.waitForProtectedDataOperation=async()=>{};
  h.setState=(patch,done)=>{Object.assign(h.state,patch);done?.();};
  h.scheduleCloudSync=()=>syncs++;h.showToast=(message,tone)=>toasts.push({message,tone});
  return{h,invoice,payment,hiddenPayment,get:()=>stored,counts:()=>({writes,syncs}),toasts,reject:()=>{reject=true;}};
}

for(const field of ['amount','reference','date','notes'])for(const sameTimestamp of [false,true])
test(`stale receipt deletion rejects a completed ${field} change (same timestamp=${sameTimestamp})`,async()=>{
  const p=await fixture(),confirmed=structuredClone(p.payment),base=p.h.requireVault();
  const current={...p.payment,[field]:field==='amount'?'60.00':field==='date'?'2026-10-03':'Corrected receipt',
    updatedAt:sameTimestamp?p.payment.updatedAt:'2099-01-01T00:00:00.000Z'};
  await p.h.persist({...base,payments:[current]});
  const before=JSON.stringify(p.get()),counts=p.counts();
  await assert.rejects(p.h.deletePayment(confirmed),/payment.*changed|receipt.*changed/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);assert.equal(p.toasts.length,0);
});

test('already deleted receipt produces no second deletion event or success',async()=>{
  const p=await fixture(),base=p.h.requireVault();await p.h.persist({...base,payments:[]});
  const before=JSON.stringify(p.get()),counts=p.counts();
  await assert.rejects(p.h.deletePayment(p.payment),/payment.*not found|receipt.*not found|no longer exists/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);assert.equal(p.toasts.length,0);
});

test('existing merge guard prevents moving a receipt to another invoice',async()=>{
  const p=await fixture(),base=p.h.requireVault();
  const other={...structuredClone(p.invoice),id:'qa-other-invoice',number:'INV-QA-OTHER'};
  const current={...p.payment,invoiceId:other.id,invoiceNumber:other.number};
  const before=JSON.stringify(p.get()),counts=p.counts();
  await assert.rejects(p.h.persist({...base,documents:[...base.documents,other],payments:[current]}),/cannot change its source invoice/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),counts);assert.equal(p.toasts.length,0);
});

test('ordinary deletion restores the balance and records the actual receipt once',async()=>{
  const p=await fixture();await p.h.deletePayment(structuredClone(p.payment));
  const saved=p.get().payload;
  assert.ok(!saved.payments.some(row=>row.id===p.payment.id));
  assert.deepEqual(saved.payments.find(row=>row.id===p.hiddenPayment.id),p.hiddenPayment);
  const events=saved.documentEvents.filter(event=>event.type==='payment-deleted');
  assert.equal(events.length,1);assert.equal(events[0].amount,'40.00');assert.equal(events[0].note,'original-40');
  assert.equal(events[0].documentId,p.invoice.id);
  assert.equal(invoicePaymentSummary(p.invoice,saved.payments,'2026-10-23',saved.documents).remaining,'100.00');
  assert.deepEqual(p.counts(),{writes:1,syncs:1});assert.equal(p.toasts.length,1);assert.equal(p.toasts[0].tone,'success');
});

test('timestamp and canonical default-scope stamping alone permit receipt deletion',async()=>{
  const p=await fixture(),confirmed={...p.payment,updatedAt:'2001-01-01T00:00:00.000Z'};
  delete confirmed.workspaceId;delete confirmed.branchId;await p.h.deletePayment(confirmed);
  assert.ok(!p.get().payload.payments.some(row=>row.id===p.payment.id));
  assert.equal(p.get().payload.documentEvents.filter(event=>event.type==='payment-deleted').length,1);
});

test('receipt field order alone does not invalidate deletion confirmation',async()=>{
  const p=await fixture(),confirmed=Object.fromEntries(Object.entries(p.payment).reverse());
  await p.h.deletePayment(confirmed);
  assert.ok(!p.get().payload.payments.some(row=>row.id===p.payment.id));
  assert.deepEqual(p.counts(),{writes:1,syncs:1});
});

test('an existing orphan receipt can still be removed without inventing an invoice event',async()=>{
  const p=await fixture();
  p.h.state.vault.documents=p.h.state.vault.documents.filter(row=>row.id!==p.invoice.id);
  p.get().payload.documents=p.get().payload.documents.filter(row=>row.id!==p.invoice.id);
  await p.h.deletePayment(p.payment);
  const saved=p.get().payload;assert.ok(!saved.payments.some(row=>row.id===p.payment.id));
  assert.equal(saved.documentEvents.filter(event=>event.type==='payment-deleted').length,0);
  assert.deepEqual(saved.payments.find(row=>row.id===p.hiddenPayment.id),p.hiddenPayment);
  assert.deepEqual(p.counts(),{writes:1,syncs:1});
});

test('failed receipt deletion CAS reports no success or persisted audit event',async()=>{
  const p=await fixture(),before=JSON.stringify(p.get());p.reject();
  await assert.rejects(p.h.deletePayment(p.payment),/Another tab updated/i);
  assert.equal(JSON.stringify(p.get()),before);assert.deepEqual(p.counts(),{writes:0,syncs:0});assert.equal(p.toasts.length,0);
});

test('receipt changed by an earlier queued save remains protected by the existing merge guard',async()=>{
  const p=await fixture(),base=p.h.requireVault();
  const first=p.h.persist({...base,payments:[{...p.payment,amount:'60.00'}]});
  const second=assert.rejects(p.h.deletePayment(p.payment),/Payment changed on another device/i);
  await Promise.all([first,second]);const saved=p.get().payload;
  assert.equal(saved.payments.find(row=>row.id===p.payment.id).amount,'60.00');
  assert.equal(saved.documentEvents.filter(event=>event.type==='payment-deleted').length,0);
  assert.deepEqual(p.counts(),{writes:1,syncs:1});assert.equal(p.toasts.length,0);
});
