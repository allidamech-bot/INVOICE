import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const bank=createTreasuryAccount({label:'Active USD Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const cash=createTreasuryAccount({label:'Active USD Cash',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});
  return {...emptyVault(),treasuryAccounts:[bank,cash]};
}
function deposit(vault,amount='250.00'){
  return {...createTreasuryEntry('deposit','USD'),workspaceId:'default',branchId:'main',
    amount,toAccountId:vault.treasuryAccounts[0].id};
}
function attempt(vault,entry){return mergeVaultIntent(vault,{...vault,treasuryEntries:[entry]},vault);}

test('new manually entered cash movements must use the same active-account protection in the vault as in the UI',()=>{
  const base=fixture(),entry=deposit(base);
  const inactive={...base,treasuryAccounts:base.treasuryAccounts.map((account,index)=>
    index===0?{...account,active:false}:account)};
  assert.throws(()=>appendTreasuryEntry(inactive,entry),/unavailable|active account/i);
  const before=JSON.stringify(inactive);
  assert.throws(()=>attempt(inactive,entry),/unavailable|active account/i,
    'direct/AI/offline new deposit must not post to an inactive bank');
  assert.equal(JSON.stringify(inactive),before,'rejected postings cannot mutate source data');
});

test('new manual treasury postings must not bypass the active workspace/branch boundary',()=>{
  const base=fixture();
  const foreignAccount=createTreasuryAccount({label:'Other Workspace Bank',kind:'bank',currency:'USD',
    workspaceId:'another-workspace',branchId:'another-branch'});
  const foreign={...deposit(base),workspaceId:'another-workspace',branchId:'another-branch',toAccountId:foreignAccount.id};
  const current={...base,treasuryAccounts:[...base.treasuryAccounts,foreignAccount]};
  assert.throws(()=>appendTreasuryEntry(current,foreign),/workspace changed/i);
  assert.throws(()=>attempt(current,foreign),/workspace changed/i,
    'a foreign entry/account pair may be internally consistent but cannot be posted from this workspace');
});

test('new manual entries cannot arrive as already reconciled or silently collapse duplicate new IDs',()=>{
  const base=fixture(),entry=deposit(base);
  const fakeReconciled={...entry,reconciledAt:'2026-10-20T10:00:00.000Z'};
  assert.throws(()=>appendTreasuryEntry(base,fakeReconciled),/unreconciled/i);
  assert.throws(()=>attempt(base,fakeReconciled),/unreconciled/i,
    'new reconciliation events must follow the explicit audit workflow');
  const duplicate={...entry,amount:'300.00'};
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryEntries:[entry,duplicate]},base),
    /treasury.*(duplicate|already exists|unique)/i,
    'two different new ledger records cannot share the same ID and silently become only the last one');
});

test('valid new manual deposits and transfers remain operational and historical entries retain their amount spelling',()=>{
  const base=fixture(),entry=deposit(base);
  const saved=attempt(base,entry);
  assert.equal(treasuryAccountBalance(base.treasuryAccounts[0].id,saved.treasuryEntries),'250.00');
  const transfer={...createTreasuryEntry('transfer','USD'),workspaceId:'default',branchId:'main',
    amount:'75.00',fromAccountId:base.treasuryAccounts[0].id,toAccountId:base.treasuryAccounts[1].id};
  const moved=mergeVaultIntent(saved,{...saved,treasuryEntries:[entry,transfer]},saved);
  assert.equal(treasuryAccountBalance(base.treasuryAccounts[0].id,moved.treasuryEntries),'175.00');
  assert.equal(treasuryAccountBalance(base.treasuryAccounts[1].id,moved.treasuryEntries),'75.00');
  const historic={...base,treasuryEntries:[{...entry,id:'legacy-cash',amount:'1,2.00'}]};
  const unchanged=mergeVaultIntent(historic,historic,historic);
  assert.equal(unchanged.treasuryEntries[0].amount,'1,2.00');
});
