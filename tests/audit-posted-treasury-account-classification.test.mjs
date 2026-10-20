import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {
  createTreasuryAccount,createTreasuryEntry,appendTreasuryEntry,
  treasuryAccountBalance,voidTreasuryEntry
} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const vault=emptyVault();
  const account={...createTreasuryAccount({
    label:'Operating Bank',kind:'bank',currency:'USD',bankAccountId:'primary',
    workspaceId:'default',branchId:'main'
  }),id:'posted-identity-bank'};
  const deposited={...createTreasuryEntry('deposit','USD'),
    id:'posted-bank-deposit',workspaceId:'default',branchId:'main',
    amount:'80.00',toAccountId:account.id};
  const base=appendTreasuryEntry({...vault,treasuryAccounts:[account]},deposited);
  return{base,account,deposited};
}
const unrelated=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('posted bank account must not be reclassified as cash during a local vault save',()=>{
  const{base,account}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryAccounts:[
    {...account,kind:'cash'}]},base),
    /posted treasury account.*(type|kind|classification|immutable)/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote device cannot replace linked bank metadata on a bank account carrying posted funds',()=>{
  const{base,account}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelated(base),
    {...base,treasuryAccounts:[{...account,bankAccountId:'other-bank'}]}),
    /posted treasury account.*(bank|immutable)/i);
  assert.equal(JSON.stringify(base),before);
});

test('a voided bank entry still protects the historical account classification',()=>{
  const{base,account,deposited}=fixture();
  const cancelled={...base,treasuryEntries:[voidTreasuryEntry(deposited,'Wrong opening deposit')]};
  assert.equal(treasuryAccountBalance(account.id,cancelled.treasuryEntries),'0.00');
  assert.throws(()=>mergeVaultIntent(cancelled,{...cancelled,treasuryAccounts:[
    {...account,kind:'cash'}]},cancelled),
    /posted treasury account.*(type|kind|classification|immutable)/i);
});

test('safe account label and active status changes preserve recorded cash and bank balance',()=>{
  const{base,account}=fixture();
  const wanted={...base,treasuryAccounts:[{...account,label:'Updated Bank Label',active:false}]};
  const saved=mergeVaultIntent(base,wanted,base);
  assert.equal(saved.treasuryAccounts[0].label,'Updated Bank Label');
  assert.equal(saved.treasuryAccounts[0].active,false);
  assert.equal(treasuryAccountBalance(account.id,saved.treasuryEntries),'80.00');
});

test('unused account may be reclassified before the first ledger entry is posted',()=>{
  const{base,account}=fixture();
  const unused={...base,treasuryEntries:[]};
  const next=mergeVaultIntent(unused,{...unused,treasuryAccounts:[
    {...account,kind:'cash',bankAccountId:''}]},unused);
  assert.equal(next.treasuryAccounts[0].kind,'cash');
});

test('unchanged historical account metadata remains readable without migration',()=>{
  const{base,account}=fixture();
  const legacy={...base,treasuryAccounts:[{...account,kind:'cash',bankAccountId:'old-id'}]};
  const before=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,unrelated(legacy),structuredClone(legacy));
  assert.equal(merged.treasuryAccounts[0].bankAccountId,'old-id');
  assert.equal(JSON.stringify(legacy),before);
});
