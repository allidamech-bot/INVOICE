import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const base=emptyVault();
  const account={...createTreasuryAccount({
    label:'Operating USD Bank',kind:'bank',currency:'USD',
    workspaceId:'default',branchId:'main'
  }),id:'treasury-new-account-identity'};
  const competing={...account,label:'Different Cash Account',kind:'cash'};
  return{base,account,competing};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('two locally imported new cash/bank accounts cannot share one ID and silently overwrite',()=>{
  const {base,account,competing}=fixture(),original=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryAccounts:[account,competing]},base),
    /new treasury account ids must be unique/i);
  assert.equal(JSON.stringify(base),original);
});

test('two remotely added new accounts with one ID cannot be accepted by an unrelated local save',()=>{
  const {base,account,competing}=fixture(),original=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelated(base),
    {...base,treasuryAccounts:[competing,account]}),
    /new treasury account ids must be unique/i);
  assert.equal(JSON.stringify(base),original);
});

test('fresh account with a blank ID cannot be silently omitted or create untraceable money',()=>{
  const {base,account}=fixture();
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryAccounts:[{...account,id:''}]},base),
    /new treasury account ids must be unique/i);
});

test('two distinct accounts and separate balances persist without accidental consolidation',()=>{
  const {base,account,competing}=fixture();
  const second={...competing,id:'treasury-second-new-account'};
  const banked=mergeVaultIntent(base,{...base,treasuryAccounts:[account,second]},base);
  const firstEntry={...createTreasuryEntry('deposit','USD'),id:'bank-deposit-first',
    workspaceId:'default',branchId:'main',amount:'15.00',toAccountId:account.id};
  const secondEntry={...createTreasuryEntry('deposit','USD'),id:'cash-deposit-second',
    workspaceId:'default',branchId:'main',amount:'7.00',toAccountId:second.id};
  const credited=appendTreasuryEntry(appendTreasuryEntry(banked,firstEntry),secondEntry);
  assert.equal(credited.treasuryAccounts.length,2);
  assert.equal(treasuryAccountBalance(account.id,credited.treasuryEntries),'15.00');
  assert.equal(treasuryAccountBalance(second.id,credited.treasuryEntries),'7.00');
});

test('unchanged duplicate historical account identities are not rewritten during unrelated saves',()=>{
  const {base,account,competing}=fixture();
  const historic={...base,treasuryAccounts:[account,competing]};
  const snapshot=JSON.stringify(historic);
  const merged=mergeVaultIntent(historic,unrelated(historic),structuredClone(historic));
  assert.equal(merged.treasuryAccounts.length,2);
  assert.equal(JSON.stringify(historic),snapshot);
});

test('different two-device new accounts with the same ID remain a concurrency conflict',()=>{
  const {base,account,competing}=fixture();
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryAccounts:[account]},
    {...base,treasuryAccounts:[competing]}),/Treasury account changed on another device/i);
});
