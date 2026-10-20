import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const bank={...createTreasuryAccount({label:'Receipts Bank',kind:'bank',currency:'USD',
    workspaceId:'default',branchId:'main'}),id:'historical-void-bank'};
  const at='2026-10-01T09:00:00.000Z';
  const cancelled='2026-10-12T10:00:00.000Z';
  const voided={...createTreasuryEntry('deposit','USD'),id:'historical-void-deposit',
    type:'deposit',workspaceId:'default',branchId:'main',
    date:'2026-10-01',amount:'95.00',toAccountId:bank.id,
    createdAt:at,updatedAt:cancelled,voidedAt:cancelled,
    voidReason:'Corrected cash allocation'};
  const base={...emptyVault(),treasuryAccounts:[bank]};
  return{base,bank,voided};
}
const saveOther=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('new already-voided deposit cannot reference a cash or bank account when no accounts exist',()=>{
  const {base,voided}=fixture(),empty={...base,treasuryAccounts:[]},before=JSON.stringify(empty);
  assert.throws(()=>mergeVaultIntent(empty,{...empty,treasuryEntries:[voided]},empty),
    /Voided treasury (source|destination) account.*(missing|unique)/i);
  assert.equal(JSON.stringify(empty),before);
});
test('remote already-voided bank entry cannot be accepted against an empty bank registry',()=>{
  const {base,voided}=fixture(),empty={...base,treasuryAccounts:[]};
  assert.throws(()=>mergeVaultIntent(empty,saveOther(empty),
    {...empty,treasuryEntries:[voided]}),
    /Voided treasury (source|destination) account.*(missing|unique)/i);
});
test('a new voided entry cannot silently choose one of two duplicate historical bank IDs',()=>{
  const {base,bank,voided}=fixture();
  const duplicate={...bank,label:'Different bank with same historical ID'};
  const legacy={...base,treasuryAccounts:[bank,duplicate]};
  assert.throws(()=>mergeVaultIntent(legacy,{...legacy,treasuryEntries:[voided]},legacy),
    /Voided treasury (source|destination) account.*(missing|unique)/i);
});
test('voided bank transfer must identify both real distinct accounts',()=>{
  const {base,bank,voided}=fixture(),cash={...createTreasuryAccount({
    label:'Cash drawer',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'
  }),id:'void-transfer-cash'};
  const initial={...base,treasuryAccounts:[bank,cash]};
  const transfer={...voided,id:'already-voided-transfer',type:'transfer',
    fromAccountId:bank.id,toAccountId:cash.id};
  const accepted=mergeVaultIntent(initial,{...initial,treasuryEntries:[transfer]},initial);
  assert.equal(accepted.treasuryEntries.length,1);
  assert.equal(treasuryAccountBalance(bank.id,accepted.treasuryEntries,'2026-10-05'),'-95.00');
  assert.equal(treasuryAccountBalance(cash.id,accepted.treasuryEntries,'2026-10-05'),'95.00');
  const wrong={...transfer,id:'missing-transfer-bank',fromAccountId:'missing-foreign-account'};
  assert.throws(()=>mergeVaultIntent(initial,{...initial,treasuryEntries:[wrong]},initial),
    /Voided treasury (source|destination) account.*(missing|unique)|Treasury source account was not found/i);
});
test('newly synced legitimate voided deposit can use a since-inactivated bank and preserves as-of audit',()=>{
  const {base,bank,voided}=fixture(),closed={...base,
    treasuryAccounts:[{...bank,active:false}]};
  const received=mergeVaultIntent(closed,saveOther(closed),
    {...closed,treasuryEntries:[voided]});
  assert.equal(received.treasuryEntries[0].id,voided.id);
  assert.equal(treasuryAccountBalance(bank.id,received.treasuryEntries,'2026-10-05'),'95.00');
  assert.equal(treasuryAccountBalance(bank.id,received.treasuryEntries,'2026-10-13'),'0.00');
});
test('unchanged legacy orphaned voided bank movements remain readable without retroactive rewrite',()=>{
  const {base,voided}=fixture(),legacy={...base,treasuryAccounts:[],
    treasuryEntries:[{...voided,id:'legacy-orphaned-voided-record'}]};
  const snapshot=JSON.stringify(legacy);
  const merged=mergeVaultIntent(legacy,saveOther(legacy),structuredClone(legacy));
  assert.equal(merged.treasuryEntries.length,1);
  assert.equal(merged.treasuryEntries[0].id,'legacy-orphaned-voided-record');
  assert.equal(JSON.stringify(legacy),snapshot);
});
