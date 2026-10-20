import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createExpense} from '../dist/src/lib/operations.js';
import {
  createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,voidTreasuryEntry
} from '../dist/src/lib/treasury-ledger.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function setup(){
  const vault=emptyVault();
  const bank=createTreasuryAccount({label:'USD Bank',kind:'bank',currency:'USD',
    workspaceId:'default',branchId:'main'});
  const original={...createTreasuryEntry('deposit','USD'),
    id:'new-remote-voided-deposit',workspaceId:'default',branchId:'main',
    date:'2026-10-01',createdAt:'2026-10-01T09:00:00.000Z',
    updatedAt:'2026-10-01T09:00:00.000Z',
    toAccountId:bank.id,amount:'140.00'};
  const voided={...original,voidedAt:'2026-10-15T10:00:00.000Z',
    updatedAt:'2026-10-15T10:00:00.000Z',voidReason:'Incorrect bank allocation'};
  return {base:{...vault,treasuryAccounts:[bank]},bank,original,voided};
}
const localExpense=(vault)=>({...vault,expenses:[{...createExpense('USD'),
  id:'unrelated-voided-treasury-expense',description:'Internet',amount:'5.00'}]});

test('a newly synced voided bank movement must preserve a valid cancellation timestamp and reason',()=>{
  const {base,voided}=setup(),snapshot=JSON.stringify(base);
  const invalid=[
    {...voided,voidReason:''},
    {...voided,voidedAt:'not-a-timestamp',updatedAt:'not-a-timestamp'},
    {...voided,createdAt:'2026-10-16T09:00:00.000Z'},
    {...voided,updatedAt:'2026-10-14T10:00:00.000Z'},
    {...voided,createdAt:'invalid-created-timestamp'},
  ];
  for(const entry of invalid){
    assert.throws(()=>mergeVaultIntent(base,localExpense(base),
      {...base,treasuryEntries:[entry]}),
      /new treasury entry cancellation audit metadata is invalid/i);
    assert.equal(JSON.stringify(base),snapshot);
  }
});

test('directly imported new voided treasury entry cannot bypass cancellation history checks',()=>{
  const {base,voided}=setup();
  assert.throws(()=>mergeVaultIntent(base,{...base,treasuryEntries:[
    {...voided,voidReason:'  '}
  ]},base),/new treasury entry cancellation audit metadata is invalid/i);
});

test('legitimate remotely posted and then voided bank entry stays visible at historical as-of dates',()=>{
  const {base,bank,voided}=setup();
  const merged=mergeVaultIntent(base,localExpense(base),
    {...base,treasuryEntries:[voided]});
  assert.equal(merged.treasuryEntries.length,1);
  assert.equal(merged.treasuryEntries[0].voidReason,'Incorrect bank allocation');
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-10-10'),'140.00',
    'a completed bank receipt remains part of its actual historical period');
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries,'2026-10-16'),'0.00');
  assert.equal(treasuryAccountBalance(bank.id,merged.treasuryEntries),'0.00');
  assert.equal(merged.expenses.length,1);
});

test('ordinary entry followed by a separate audited void and existing historic void remain valid',()=>{
  const {base,original,bank}=setup();
  const saved=mergeVaultIntent(base,{...base,treasuryEntries:[original]},base);
  const reasoned=voidTreasuryEntry(original,'Duplicate receipt');
  const cancelled=mergeVaultIntent(saved,{...saved,treasuryEntries:[reasoned]},saved);
  assert.equal(treasuryAccountBalance(bank.id,cancelled.treasuryEntries),'0.00');
  const unchanged=mergeVaultIntent(cancelled,localExpense(cancelled),structuredClone(cancelled));
  assert.equal(unchanged.treasuryEntries[0].voidedAt,reasoned.voidedAt);
  assert.equal(unchanged.treasuryEntries[0].voidReason,'Duplicate receipt');
  assert.equal(unchanged.expenses.length,1);
});

test('preexisting legacy voided rows are not rewritten or revalidated during independent changes',()=>{
  const {base,voided}=setup();
  const historical={...base,treasuryEntries:[{...voided,id:'legacy-voided-cash-entry',
    amount:'1,2.00',voidReason:''}]};
  const before=JSON.stringify(historical);
  const merged=mergeVaultIntent(historical,localExpense(historical),structuredClone(historical));
  assert.equal(merged.treasuryEntries[0].amount,'1,2.00');
  assert.equal(merged.treasuryEntries[0].voidReason,'');
  assert.equal(JSON.stringify(historical),before);
});
