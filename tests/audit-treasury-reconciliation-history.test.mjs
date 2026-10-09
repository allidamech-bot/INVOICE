import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createTreasuryReconciliation,treasuryProjection} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const movement={id:'hist-customer-payment',date:'2026-10-01',createdAt:'2026-10-01T09:00:00.000Z',amount:'125.00',currency:'USD',method:'bank-transfer',customerNameEn:'Test'};
const entry={id:'hist-bank-entry',date:'2026-10-01',createdAt:'2026-10-01T10:00:00.000Z',updatedAt:'2026-10-02T10:00:00.000Z',amount:'125.00',currency:'USD',reference:'REF',type:'collection',fromAccountId:'',toAccountId:'bank-1',sourceType:'customer-payment',sourceId:movement.id,reconciledAt:'2026-10-02T10:00:00.000Z',voidedAt:'',voidReason:''};
const event=(id,key,at,action)=>({id,workspaceId:'default',branchId:'main',movementKey:key,createdAt:at,updatedAt:at,reconciledAt:action==='undo'?'':at,note:'',action});
const get=(asOf,entries=[],events=[],payments=[movement])=>treasuryProjection(payments,[],[],entries,events,'USD',asOf)[0];

test('Treasury Undo after cutoff retains historical legacy reconciledAt but clears current state',()=>{
  const undo=event('undo-20','treasury:hist-bank-entry','2026-10-20T09:00:00.000Z','undo');
  assert.equal(get('2026-10-09',[entry],[undo]).reconciled,true);
  assert.equal(get('2026-10-21',[entry],[undo]).reconciled,false);
  assert.equal(get('',[entry],[undo]).reconciled,false);
});

test('unallocated collection reconciliation, undo and redo retain the correct as-of state',()=>{
  const key='collection:hist-customer-payment';
  const first=event('reconcile-03',key,'2026-10-03T08:00:00.000Z','reconcile');
  const undo=event('undo-20',key,'2026-10-20T08:00:00.000Z','undo');
  const redo=event('redo-22',key,'2026-10-22T08:00:00.000Z','reconcile');
  assert.equal(get('2026-10-02',[],[first,undo,redo]).reconciled,false);
  assert.equal(get('2026-10-09',[],[redo,first,undo]).reconciled,true,'order is chronological, not array order');
  assert.equal(get('2026-10-21',[],[first,redo,undo]).reconciled,false);
  assert.equal(get('2026-10-23',[],[first,undo,redo]).reconciled,true);
  assert.equal(get('',[],[first,undo,redo]).reconciled,true);
});

test('same-millisecond reconciliation events resolve consistently after cloud merge reordering',()=>{
  const at='2026-10-09T12:00:00.000Z',key='collection:hist-customer-payment';
  const reconcile=event('event-a',key,at,'reconcile');
  const undo=event('event-z',key,at,'undo');
  for(const events of [[undo,reconcile],[reconcile,undo]]){
    assert.equal(get('2026-10-08',[],events).reconciled,false);
    assert.equal(get('2026-10-09',[],events).reconciled,false,
      'same-time conflicts must not depend on event array insertion order');
  }
});

test('a reconciliation effective after cutoff cannot alter an earlier report even with an older creation timestamp',()=>{
  const next=event('scheduled-event','collection:hist-customer-payment','2026-10-02T12:00:00.000Z','reconcile');
  next.reconciledAt='2026-10-20T12:00:00.000Z';
  assert.equal(get('2026-10-09',[],[next]).reconciled,false);
  assert.equal(get('2026-10-21',[],[next]).reconciled,true);
});

test('a late-effective reconciliation is ordered after an earlier Undo, irrespective of entry creation',()=>{
  const key='collection:hist-customer-payment';
  const late=event('event-recorded-early',key,'2026-10-02T09:00:00.000Z','reconcile');
  late.reconciledAt='2026-10-20T09:00:00.000Z';
  const undo=event('event-undo-10',key,'2026-10-10T09:00:00.000Z','undo');
  for(const events of [[late,undo],[undo,late]]){
    assert.equal(get('2026-10-09',[],events).reconciled,false);
    assert.equal(get('2026-10-11',[],events).reconciled,false);
    const restored=get('2026-10-21',[],events);
    assert.equal(restored.reconciled,true);
    assert.equal(restored.reconciledAt,'2026-10-20T09:00:00.000Z');
  }
});

test('legacy reconciliation records without action remain compatible',()=>{
  const record={...event('legacy','collection:hist-customer-payment','2026-10-02T08:00:00.000Z','reconcile')};
  delete record.action;
  assert.equal(get('2026-10-09',[],[record]).reconciled,true);
});

test('Undo writes a new event rather than rewriting prior reconciliations',()=>{
  const row=createTreasuryReconciliation('collection:hist-customer-payment','',false);
  assert.equal(row.action,'undo');
  assert.equal(row.reconciledAt,'');
  assert.ok(row.createdAt);
});

test('vault synchronization cannot delete or rewrite reconciliation history',()=>{
  const base=emptyVault();
  const original=event('audit-event','collection:hist-customer-payment','2026-10-02T08:00:00.000Z','reconcile');
  base.treasuryReconciliations=[original];
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[]},base),/history cannot be deleted/);
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[{...original,action:'undo',reconciledAt:''}]},base),/immutable/);
  assert.throws(()=>mergeVaultIntent(base,base,{...base,treasuryReconciliations:[]}),/history cannot be deleted/,
    'a stale cloud copy must not silently remove an original reconciliation');
  assert.throws(()=>mergeVaultIntent(base,base,{...base,treasuryReconciliations:[{...original,note:'rewritten elsewhere'}]}),/immutable/,
    'a remote rewrite must not erase an immutable reconciliation in a merge');

  const next=event('undo-event','collection:hist-customer-payment','2026-10-20T08:00:00.000Z','undo');
  const merged=mergeVaultIntent(base,{...base,treasuryReconciliations:[original,next]},base);
  assert.deepEqual(merged.treasuryReconciliations.map(x=>x.id),['audit-event','undo-event']);
});

test('Cash & Bank UI uses append-only events even for direct ledger entries',async()=>{
  const source=await readFile(new URL('../src/components/TreasuryLedgerPage.tsx',import.meta.url),'utf8');
  const section=source.slice(source.indexOf('const toggleReconciled='),source.indexOf('const voidEntry='));
  assert.match(section,/treasuryReconciliations:\[\.\.\.vault\.treasuryReconciliations,/);
  assert.doesNotMatch(section,/treasuryReconciliations\.filter\(/);
  assert.doesNotMatch(section,/markTreasuryEntryReconciled\(/);
});
