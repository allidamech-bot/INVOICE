import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {treasuryProjection} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const key='collection:bank-reconciliation-source';
const payment={id:'bank-reconciliation-source',date:'2026-10-01',
  createdAt:'2026-10-01T08:00:00.000Z',amount:'35.00',currency:'USD',method:'bank-transfer',
  customerNameEn:'Customer',customerNameAr:'',invoiceNumber:'INV-100',reference:'B-100'};
const event=(id,action,at='2026-10-20T09:00:00.000Z')=>({
  id,workspaceId:'default',branchId:'main',movementKey:key,
  createdAt:at,updatedAt:at,reconciledAt:action==='undo'?'':at,note:'',
  action
});
const remoteLocalExpense=(base)=>({...base,expenses:[{
  ...createExpense('USD'),id:'new-accounting-expense',
  description:'Office internet',amount:'5.00'
}]});
const status=(vault,asOf='')=>treasuryProjection([payment],[],[],[],
  vault.treasuryReconciliations,'USD',asOf)[0].reconciled;

test('two fresh reconciliation actions sharing one ID cannot silently collapse into one audit event',()=>{
  const base=emptyVault(),before=JSON.stringify(base);
  const first=event('reused-new-reconciliation-id','reconcile','2026-10-20T08:00:00.000Z');
  const second=event(first.id,'undo','2026-10-20T09:00:00.000Z');
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[first,second]},base),
    /new treasury reconciliation.*(unique|duplicate)/i);
  assert.equal(JSON.stringify(base),before);
  assert.throws(()=>mergeVaultIntent(base,remoteLocalExpense(base),
    {...base,treasuryReconciliations:[first,second]}),
    /new treasury reconciliation.*(unique|duplicate)/i,
    'a remote duplicate also cannot be accepted during an unrelated local save');
});

test('newly synced reconciliation records cannot forge an action, key or timestamp',()=>{
  const base=emptyVault(),before=JSON.stringify(base),good=event('remote-new-event','reconcile');
  for(const changed of [
    {...good,action:'credited'},
    {...good,movementKey:'  '},
    {...good,createdAt:'not-a-date'},
    {...good,reconciledAt:''},
    {...good,id:''}
  ]){
    assert.throws(()=>mergeVaultIntent(base,remoteLocalExpense(base),
      {...base,treasuryReconciliations:[changed]}),
      /treasury reconciliation.*(invalid|unique)/i);
    assert.equal(JSON.stringify(base),before);
  }
});

test('valid concurrent reconciliation and Undo events retain both timestamps and as-of state',()=>{
  const base=emptyVault();
  const reconcile=event('first-reconciliation','reconcile','2026-10-10T09:00:00.000Z');
  const undo=event('second-undo','undo','2026-10-20T09:00:00.000Z');
  const merged=mergeVaultIntent(base,
    {...base,treasuryReconciliations:[reconcile]},
    {...base,treasuryReconciliations:[undo]});
  assert.equal(merged.treasuryReconciliations.length,2);
  assert.equal(status(merged,'2026-10-15'),true);
  assert.equal(status(merged,'2026-10-21'),false);
  assert.equal(status(merged),false);
});

test('unchanged legacy reconciliation events remain byte-for-byte preserved',()=>{
  const old={...event('old-history-event','reconcile','2026-10-01T09:00:00.000Z')};
  delete old.action;
  old.createdAt='2026-10-01T09:00:00.000Z';
  const base={...emptyVault(),treasuryReconciliations:[old]};
  const original=JSON.stringify(base);
  const merged=mergeVaultIntent(base,remoteLocalExpense(base),structuredClone(base));
  assert.equal(merged.treasuryReconciliations[0].action,undefined);
  assert.equal(status(merged),true);
  assert.equal(merged.expenses.length,1);
  assert.equal(JSON.stringify(base),original);
});
