import test from 'node:test';
import assert from 'node:assert/strict';

const treasury=()=>import('../dist/src/lib/treasury-ledger.js');
const defaults=()=>import('../dist/src/lib/defaults.js');
const vaultStorage=()=>import('../dist/src/storage/vault.js');

function accountInput(label='Main Bank',currency='USD'){
  return {label,kind:'bank',currency,workspaceId:'default',branchId:'main'};
}

test('Treasury uses explicit financial accounts and opening balances to calculate cash position',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance}=await treasury();
  const bank=createTreasuryAccount(accountInput());
  const cash=createTreasuryAccount({...accountInput('Cash Box'),kind:'cash'});
  const accounts=[bank,cash];
  const opening={...createTreasuryEntry('opening-balance','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'1000.00',toAccountId:bank.id};
  const transfer={...createTreasuryEntry('transfer','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'250.00',fromAccountId:bank.id,toAccountId:cash.id};
  const {assertTreasuryEntry}=await treasury();
  assert.doesNotThrow(()=>assertTreasuryEntry(opening,accounts));
  assert.doesNotThrow(()=>assertTreasuryEntry(transfer,accounts));
  assert.equal(treasuryAccountBalance(bank.id,[opening,transfer]),'750.00');
  assert.equal(treasuryAccountBalance(cash.id,[opening,transfer]),'250.00');
});

test('Treasury allocation preserves canonical customer/supplier payments and prevents duplicate live allocation',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,assertTreasuryEntry,treasuryLinkedSourceUsed}=await treasury();
  const bank=createTreasuryAccount(accountInput());
  const collection={...createTreasuryEntry('collection','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'100.00',toAccountId:bank.id,sourceType:'customer-payment',sourceId:'pay-1'};
  const supplier={...createTreasuryEntry('supplier-payment','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'30.00',fromAccountId:bank.id,sourceType:'supplier-payment',sourceId:'sp-1'};
  assert.doesNotThrow(()=>assertTreasuryEntry(collection,[bank]));
  assert.doesNotThrow(()=>assertTreasuryEntry(supplier,[bank]));
  assert.equal(treasuryLinkedSourceUsed([collection,supplier],'customer-payment','pay-1'),true);
  assert.equal(treasuryLinkedSourceUsed([collection,supplier],'supplier-payment','sp-1'),true);
  assert.equal(treasuryLinkedSourceUsed([{...collection,voidedAt:'2026-10-01T12:00:00.000Z'}],'customer-payment','pay-1'),false);
});

test('Treasury scope and source invariants prevent cross-workspace leakage or forged payment linkage',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,assertTreasuryEntry}=await treasury();
  const bank=createTreasuryAccount(accountInput());
  const blankScope={...createTreasuryEntry('deposit','USD'),amount:'10.00',toAccountId:bank.id};
  assert.throws(()=>assertTreasuryEntry(blankScope,[bank]),/scope/i);
  const wrongBranch={...blankScope,workspaceId:'default',branchId:'other'};
  assert.throws(()=>assertTreasuryEntry(wrongBranch,[bank]),/scope/i);
  const forgedManual={...blankScope,workspaceId:'default',branchId:'main',sourceType:'customer-payment',sourceId:'pay-1'};
  assert.throws(()=>assertTreasuryEntry(forgedManual,[bank]),/cannot claim/i);
});

test('Treasury corrections preserve history via void and reconciliation instead of deletion/editing semantics',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,voidTreasuryEntry,markTreasuryEntryReconciled,treasuryAccountBalance}=await treasury();
  const bank=createTreasuryAccount(accountInput());
  const deposit={...createTreasuryEntry('deposit','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'500.00',toAccountId:bank.id};
  const reconciled=markTreasuryEntryReconciled(deposit,true);
  assert.ok(reconciled.reconciledAt);
  const voided=voidTreasuryEntry(reconciled,'Bank correction');
  assert.ok(voided.voidedAt);
  assert.equal(voided.voidReason,'Bank correction');
  assert.equal(treasuryAccountBalance(bank.id,[voided]),'0.00');
  assert.throws(()=>voidTreasuryEntry(voided,'again'),/already voided/i);
  assert.throws(()=>markTreasuryEntryReconciled(voided,true),/voided/i);
});

test('Treasury rejects cross-currency transfers and account/currency mismatches',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,assertTreasuryEntry}=await treasury();
  const usd=createTreasuryAccount(accountInput('USD Bank','USD'));
  const eur=createTreasuryAccount(accountInput('EUR Bank','EUR'));
  const transfer={...createTreasuryEntry('transfer','USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount:'10.00',fromAccountId:usd.id,toAccountId:eur.id};
  assert.throws(()=>assertTreasuryEntry(transfer,[usd,eur]),/currency/i);
});

test('v20 migration adds empty Treasury accounts without inventing balances and preserves legacy ledger references safely',async()=>{
  const [{emptyVault},{migrateVault}]=await Promise.all([defaults(),vaultStorage()]);
  const legacy=structuredClone(emptyVault());
  legacy.schemaVersion=20;
  delete legacy.treasuryAccounts;
  delete legacy.treasuryEntries;
  delete legacy.treasuryReconciliations;
  const migrated=migrateVault(legacy);
  assert.deepEqual(migrated.treasuryAccounts,[]);
  assert.deepEqual(migrated.treasuryEntries,[]);
  assert.deepEqual(migrated.treasuryReconciliations,[]);

  const legacyWithMovement=structuredClone(emptyVault());
  legacyWithMovement.schemaVersion=20;
  delete legacyWithMovement.treasuryAccounts;
  legacyWithMovement.treasuryEntries=[{id:'legacy-deposit',workspaceId:'default',branchId:'main',type:'deposit',date:'2026-09-30',currency:'USD',amount:'50.00',fromAccountId:'',toAccountId:'primary',reference:'LEGACY',notes:'',createdAt:'2026-09-30T00:00:00.000Z',updatedAt:'2026-09-30T00:00:00.000Z'}];
  const normalized=migrateVault(legacyWithMovement);
  assert.ok(normalized.treasuryAccounts.some(account=>account.id==='primary'&&account.branchId==='main'));
  assert.equal(normalized.treasuryEntries[0].sourceType,'manual');
  assert.equal(normalized.treasuryEntries[0].voidedAt,'');
});

test('Treasury account metadata remains separate from company bank metadata',async()=>{
  const {emptyVault}=await defaults();
  const vault=emptyVault();
  vault.company.bank.bankName='Descriptive Bank';
  assert.equal(vault.treasuryAccounts.length,0);
  assert.equal(vault.treasuryEntries.length,0);
});