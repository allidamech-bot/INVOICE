import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {
  appendTreasuryEntry,createTreasuryAccount,createTreasuryEntry,
  createTreasuryReconciliation,treasuryAccountBalance,treasuryProjection
} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault();
  const account={...createTreasuryAccount({
    label:'Main Bank',kind:'bank',currency:'USD',
    workspaceId:'default',branchId:'main'
  }),id:'reconcile-bank-main'};
  const deposit={...createTreasuryEntry('deposit','USD'),
    id:'reconcile-bank-deposit',workspaceId:'default',branchId:'main',
    amount:'125.00',toAccountId:account.id};
  const base=appendTreasuryEntry({...vault,treasuryAccounts:[account]},deposit);
  const event=(id='scope-reconcile-1',key='treasury:reconcile-bank-deposit',reconciled=true)=>({
    ...createTreasuryReconciliation(key,'',reconciled),
    id,workspaceId:'default',branchId:'main'
  });
  return{base,account,deposit,event};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local bank reconciliation may not claim another company for a known bank entry',()=>{
  const{base,event}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[
    {...event(),workspaceId:'another-company'}]},base),
    /Treasury reconciliation.*(company|scope|branch)/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote bank reconciliation may not claim another branch during unrelated local save',()=>{
  const{base,event}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelated(base),{...base,treasuryReconciliations:[
    {...event(),branchId:'remote-branch'}]}),
    /Treasury reconciliation.*(company|scope|branch)/i);
  assert.equal(JSON.stringify(base),before);
});

test('expense reconciliation cannot claim another company when the expense scope is known',()=>{
  const{base,event}=fixture();
  const expense={...createExpense('USD'),id:'reconcile-expense-1',
    description:'Office service',amount:'12.00',workspaceId:'default',branchId:'main'};
  const initial={...base,expenses:[expense]};
  assert.throws(()=>mergeVaultIntent(initial,{...initial,treasuryReconciliations:[
    {...event('expense-reconcile','expense:reconcile-expense-1'),workspaceId:'another-company'}]},initial),
    /Treasury reconciliation.*(company|scope|branch)/i);
});

test('valid reconcile then Undo remains append-only and leaves bank balance unchanged',()=>{
  const{base,account,deposit,event}=fixture();
  const first=event();
  const recorded=mergeVaultIntent(base,{...base,treasuryReconciliations:[first]},base);
  let row=treasuryProjection([],[],[],recorded.treasuryEntries,recorded.treasuryReconciliations)
    .find(row=>row.key==='treasury:'+deposit.id);
  assert.equal(row?.reconciled,true);
  const undo={...event('scope-reconcile-undo',undefined,false),
    createdAt:new Date(Date.parse(first.createdAt)+1000).toISOString(),
    updatedAt:new Date(Date.parse(first.createdAt)+1000).toISOString()};
  const undone=mergeVaultIntent(recorded,{...recorded,treasuryReconciliations:[
    ...recorded.treasuryReconciliations,undo]},recorded);
  row=treasuryProjection([],[],[],undone.treasuryEntries,undone.treasuryReconciliations)
    .find(row=>row.key==='treasury:'+deposit.id);
  assert.equal(row?.reconciled,false);
  assert.equal(treasuryAccountBalance(account.id,undone.treasuryEntries),'125.00');
  assert.equal(undone.treasuryReconciliations.length,2);
});

test('unchanged historical bank reconciliation scope remains intact on unrelated save',()=>{
  const{base,event}=fixture();
  const saved={...base,treasuryReconciliations:[
    {...event('older-reconcile'),workspaceId:'older-workspace'}]};
  const before=JSON.stringify(saved);
  const after=mergeVaultIntent(saved,unrelated(saved),structuredClone(saved));
  assert.equal(after.treasuryReconciliations[0].workspaceId,'older-workspace');
  assert.equal(JSON.stringify(saved),before);
});


function ambiguousHistoricalExpenseFixture(){
  const {base,event}=fixture();
  const expense={...createExpense('USD'),id:'duplicated-legacy-expense-id',
    date:'2026-10-02',amount:'18.00',description:'Synthetic service',
    workspaceId:'default',branchId:'main'};
  const regional={...expense,branchId:'regional',
    description:'Different regional synthetic service',amount:'35.00'};
  const snapshot={...base,expenses:[expense,regional]};
  const scopedEvent=(id,branchId='main',key='expense:duplicated-legacy-expense-id')=>
    ({...event(id,key),branchId});
  return{snapshot,expense,regional,scopedEvent};
}

test('new reconciliation of repeated historical expense ID is rejected in either branch order',()=>{
  const {snapshot,expense,regional,scopedEvent}=ambiguousHistoricalExpenseFixture();
  for(const rows of [[expense,regional],[regional,expense]]){
    const base={...snapshot,expenses:rows},original=JSON.stringify(base);
    for(const branch of ['main','regional']){
      const incoming=scopedEvent('new-expense-event-'+branch,branch);
      assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[incoming]},base),
        /treasury reconciliation movement key is ambiguous/i);
      assert.equal(JSON.stringify(base),original,'rejection cannot mutate historical expense records');
    }
  }
});

test('remote ambiguous expense reconciliation is rejected during an unrelated local save',()=>{
  const {snapshot,scopedEvent}=ambiguousHistoricalExpenseFixture();
  const incoming=scopedEvent('remote-ambiguous-expense');
  const before=JSON.stringify(snapshot);
  assert.throws(()=>mergeVaultIntent(snapshot,unrelated(snapshot),
    {...snapshot,treasuryReconciliations:[incoming]}),
    /treasury reconciliation movement key is ambiguous/i);
  assert.equal(JSON.stringify(snapshot),before);
});

test('historical ambiguous reconciliation stays untouched; unique expense reconciliation remains valid',()=>{
  const {snapshot,expense,scopedEvent}=ambiguousHistoricalExpenseFixture();
  const old=scopedEvent('historical-ambiguous-expense-event');
  const historical={...snapshot,treasuryReconciliations:[old]};
  const original=JSON.stringify(historical);
  const retained=mergeVaultIntent(historical,unrelated(historical),structuredClone(historical));
  assert.equal(retained.treasuryReconciliations[0].id,old.id);
  assert.equal(JSON.stringify(historical),original);

  const unique={...expense,id:'unique-expense-for-reconciliation'};
  const base={...snapshot,expenses:[...snapshot.expenses,unique]};
  const incoming=scopedEvent('new-unique-expense-event','main','expense:'+unique.id);
  const accepted=mergeVaultIntent(base,{...base,treasuryReconciliations:[incoming]},base);
  assert.deepEqual(accepted.treasuryReconciliations.map(x=>x.id),[incoming.id]);
});
