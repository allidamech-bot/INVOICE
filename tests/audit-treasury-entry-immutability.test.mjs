import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,voidTreasuryEntry} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(amount='500.00'){
  const bank=createTreasuryAccount({label:'Audit Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const entry={...createTreasuryEntry('deposit','USD'),id:'original-bank-deposit',
    workspaceId:'default',branchId:'main',date:'2026-10-01',amount,toAccountId:bank.id,
    reference:'DEP-001',notes:'Original cash receipt'};
  return {bank,entry,vault:{...emptyVault(),treasuryAccounts:[bank],treasuryEntries:[entry]}};
}

test('authoritative vault rejects deleting or silently changing an existing cash/bank entry',()=>{
  const {bank,entry,vault}=fixture(),before=JSON.stringify(vault);
  const attempted=[
    [],
    [{...entry,amount:'5.00'}],
    [{...entry,amount:'800.00'}],
    [{...entry,date:'2026-10-02'}],
    [{...entry,reference:'rewritten-reference'}],
    [{...entry,toAccountId:'different-account'}],
    [{...entry,reconciledAt:'2026-10-02T12:00:00.000Z'}]
  ];
  for(const treasuryEntries of attempted){
    assert.throws(()=>mergeVaultIntent(vault,{...vault,treasuryEntries},vault),
      /treasury entry.*(history|immutable|void)/i,
      'a direct vault mutation must not bypass the explicit void/audit correction workflow');
    assert.equal(JSON.stringify(vault),before,'rejected financial mutations cannot modify saved input');
  }
  assert.equal(treasuryAccountBalance(bank.id,vault.treasuryEntries),'500.00');
});

test('valid one-way void preserves the original ledger identity and corrects its balance',()=>{
  const {bank,entry,vault}=fixture();
  const voided=voidTreasuryEntry(entry,'Duplicate bank receipt');
  const corrected=mergeVaultIntent(vault,{...vault,treasuryEntries:[voided]},vault);
  assert.equal(corrected.treasuryEntries.length,1);
  assert.equal(corrected.treasuryEntries[0].amount,'500.00');
  assert.equal(corrected.treasuryEntries[0].reference,'DEP-001');
  assert.equal(corrected.treasuryEntries[0].voidReason,'Duplicate bank receipt');
  assert.equal(treasuryAccountBalance(bank.id,corrected.treasuryEntries),'0.00');
  assert.equal(vault.treasuryEntries[0].voidedAt,'','the original input is never mutated');
  for(const changed of [
    {...voided,voidedAt:'',voidReason:''},
    {...voided,voidReason:'Rewritten reason'},
    {...voided,amount:'50.00'}
  ]){
    assert.throws(()=>mergeVaultIntent(corrected,{...corrected,treasuryEntries:[changed]},corrected),
      /treasury entry.*(history|immutable|void)/i);
  }
});

test('cloud merge retains saved treasury audit entries and honors a valid remote void',()=>{
  const {bank,entry,vault}=fixture();
  assert.throws(()=>mergeVaultIntent(vault,vault,{...vault,treasuryEntries:[]}),
    /treasury entry.*(history|immutable|void)/i,
    'an older device cannot silently accept remotely deleted financial ledger history');
  assert.throws(()=>mergeVaultIntent(vault,vault,{...vault,treasuryEntries:[{...entry,amount:'100.00'}]}),
    /treasury entry.*(history|immutable|void)/i,
    'an older device cannot silently accept remotely rewritten monetary amounts');
  const remoteVoid=voidTreasuryEntry(entry,'Reconciled bank correction');
  const merged=mergeVaultIntent(vault,vault,{...vault,treasuryEntries:[remoteVoid]});
  assert.equal(merged.treasuryEntries[0].voidReason,'Reconciled bank correction');
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'0.00');
});

test('new valid cash entries and unchanged historic amount strings remain accepted',()=>{
  const {bank,entry,vault}=fixture('1,2.00');
  const unchanged=mergeVaultIntent(vault,vault,vault);
  assert.equal(unchanged.treasuryEntries[0].amount,'1,2.00','do not normalize historical recorded values');
  const next={...createTreasuryEntry('deposit','USD'),id:'second-bank-deposit',
    workspaceId:'default',branchId:'main',date:'2026-10-02',amount:'25.00',toAccountId:bank.id};
  const appended=mergeVaultIntent(vault,{...vault,treasuryEntries:[entry,next]},vault);
  assert.equal(appended.treasuryEntries.length,2);
  assert.equal(appended.treasuryEntries[0].amount,'1,2.00');
  assert.equal(treasuryAccountBalance(bank.id,appended.treasuryEntries),'37.00');
});
