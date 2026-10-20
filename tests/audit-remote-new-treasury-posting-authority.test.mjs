import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const vault=emptyVault();
  const bank=createTreasuryAccount({label:'Bank USD',kind:'bank',currency:'USD',
    workspaceId:'default',branchId:'main'});
  const cash=createTreasuryAccount({label:'Petty Cash',kind:'cash',currency:'USD',
    workspaceId:'default',branchId:'main'});
  const base={...vault,treasuryAccounts:[bank,cash]};
  const remoteDeposit={...createTreasuryEntry('deposit','USD'),id:'remote-new-bank-deposit',
    workspaceId:'default',branchId:'main',date:'2026-10-20',amount:'125.00',
    toAccountId:bank.id};
  return {base,bank,cash,remoteDeposit};
}
const expense=(base)=>({...base,expenses:[{...createExpense('USD'),
  id:'unrelated-bank-sync-expense',description:'Rent',amount:'10.00'}]});

test('remote new cash deposits cannot bypass the inactive bank account restriction',()=>{
  const {base,bank,remoteDeposit}=setup();
  const inactive={...base,treasuryAccounts:base.treasuryAccounts.map(account=>
    account.id===bank.id?{...account,active:false}:account)};
  const before=JSON.stringify(inactive);
  assert.throws(()=>mergeVaultIntent(inactive,expense(inactive),
    {...inactive,treasuryEntries:[remoteDeposit]}),/unavailable|active account/i);
  assert.equal(JSON.stringify(inactive),before);
});

test('remote bank entries cannot cross the workspace boundary or arrive already reconciled',()=>{
  const {base,remoteDeposit}=setup();
  const foreign={...remoteDeposit,workspaceId:'foreign',branchId:'foreign'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,treasuryEntries:[foreign]}),/workspace changed|scope/i);
  const reconciled={...remoteDeposit,reconciledAt:'2026-10-20T09:00:00.000Z'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,treasuryEntries:[reconciled]}),/active and unreconciled/i);
});

test('new remote treasury money and new duplicate movement IDs cannot bypass strict posting grammar',()=>{
  const {base,remoteDeposit}=setup();
  const malformed={...remoteDeposit,amount:'1,2.00'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,treasuryEntries:[malformed]}),/invalid monetary grouping/i);
  const repeated={...remoteDeposit,amount:'130.00'};
  assert.throws(()=>mergeVaultIntent(base,expense(base),
    {...base,treasuryEntries:[remoteDeposit,repeated]}),
    /new treasury entry IDs must be unique/i);
});

test('new legitimate remote bank deposit and transfer sync with unrelated local expense',()=>{
  const {base,bank,cash,remoteDeposit}=setup();
  const transfer={...createTreasuryEntry('transfer','USD'),
    id:'remote-new-transfer',workspaceId:'default',branchId:'main',date:'2026-10-20',
    amount:'25.00',fromAccountId:bank.id,toAccountId:cash.id};
  const merged=mergeVaultIntent(base,expense(base),
    {...base,treasuryEntries:[remoteDeposit,transfer]});
  assert.equal(merged.treasuryEntries.length,2);
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'100.00');
  assert.equal(treasuryAccountBalance(cash.id,merged.treasuryEntries),'25.00');
  assert.equal(merged.expenses.length,1);
});

test('existing bank ledger money is never reinterpreted during cloud replay',()=>{
  const {base,bank,remoteDeposit}=setup();
  const historical={...base,treasuryEntries:[{...remoteDeposit,id:'historical-bank-entry',
    amount:'1,2.00'}]};
  const original=JSON.stringify(historical);
  const saved=mergeVaultIntent(historical,expense(historical),structuredClone(historical));
  assert.equal(saved.treasuryEntries[0].amount,'1,2.00');
  assert.equal(treasuryAccountBalance(bank.id,saved.treasuryEntries),'12.00');
  assert.equal(JSON.stringify(historical),original);
});
