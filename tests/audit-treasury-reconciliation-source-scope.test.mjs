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
