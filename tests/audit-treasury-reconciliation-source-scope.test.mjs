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

function ambiguousHistoricalBankFixture(){
  const {base,account,deposit,event}=fixture();
  const regional=createTreasuryAccount({label:'QA Regional Bank',kind:'bank',
    currency:'USD',workspaceId:'default',branchId:'regional'});
  const repeated={...deposit,toAccountId:regional.id,branchId:'regional',
    amount:'75.00',reference:'different-bank-history'};
  const snapshot={...base,treasuryAccounts:[account,regional],
    treasuryEntries:[deposit,repeated]};
  return {snapshot,deposit,repeated,event};
}

test('new reconciliation of a duplicated historical bank movement is rejected for both branch orders',()=>{
  const {snapshot,deposit,repeated,event}=ambiguousHistoricalBankFixture();
  for(const rows of [[deposit,repeated],[repeated,deposit]]){
    const base={...snapshot,treasuryEntries:rows};
    const original=JSON.stringify(base);
    for(const scope of [{workspaceId:'default',branchId:'main'},
      {workspaceId:'default',branchId:'regional'}]){
      const incoming={...event(),...scope,id:'fresh-reconciliation-for-ambiguous-bank'};
      assert.throws(()=>mergeVaultIntent(base,{...base,treasuryReconciliations:[incoming]},base),
        /treasury reconciliation movement key is ambiguous/i,
        'new event must not attach to either ledger row depending on array order');
      assert.equal(JSON.stringify(base),original,'rejected event never modifies historic money');
    }
  }
});

test('remote ambiguous reconciliation cannot be imported during unrelated local save',()=>{
  const {snapshot,event}=ambiguousHistoricalBankFixture();
  const incoming={...event(),id:'remote-ambiguous-bank-reconciliation'};
  const before=JSON.stringify(snapshot);
  assert.throws(()=>mergeVaultIntent(snapshot,unrelated(snapshot),
    {...snapshot,treasuryReconciliations:[incoming]}),
    /treasury reconciliation movement key is ambiguous/i);
  assert.equal(JSON.stringify(snapshot),before);
});

test('grandfathered reconciliation history remains unchanged while unique movement may reconcile',()=>{
  const {snapshot,deposit,event}=ambiguousHistoricalBankFixture();
  const old={...event(),id:'grandfathered-ambiguous-reconciliation'};
  const historical={...snapshot,treasuryReconciliations:[old]};
  const frozen=JSON.stringify(historical);
  const retained=mergeVaultIntent(historical,unrelated(historical),structuredClone(historical));
  assert.equal(retained.treasuryReconciliations[0].id,old.id);
  assert.equal(JSON.stringify(historical),frozen,'never migrate an old event or its linked rows');

  // A distinct source ID still supports normal reconcile/Undo operations.
  const unique={...deposit,id:'unique-bank-reconciliation-movement'};
  const base={...snapshot,treasuryEntries:[...snapshot.treasuryEntries,unique]};
  const incoming={...event('valid-unique-bank-event','treasury:'+unique.id)};
  const merged=mergeVaultIntent(base,{...base,treasuryReconciliations:[incoming]},base);
  assert.equal(merged.treasuryReconciliations.length,1);
  assert.equal(merged.treasuryReconciliations[0].movementKey,'treasury:'+unique.id);
});
