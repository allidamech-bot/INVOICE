import test from 'node:test';
import assert from 'node:assert/strict';

test('treasury accounts, opening balances, transfers and voids preserve real ledger balances',async()=>{
  const t=await import('../dist/src/lib/treasury-ledger.js');
  const a=t.createTreasuryAccount({label:'Main Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'}),b=t.createTreasuryAccount({label:'Cash',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});
  const make=(type,amount,from='',to='')=>{const entry={...t.createTreasuryEntry(type,'USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount,fromAccountId:from,toAccountId:to};t.assertTreasuryEntry(entry,[a,b]);return entry;};
  const opening=make('opening-balance','500.00','',a.id),deposit=make('deposit','100.00','',a.id),transfer=make('transfer','50.00',a.id,b.id),withdrawal=make('withdrawal','25.00',b.id,'');
  assert.equal(t.treasuryAccountBalance(a.id,[opening,deposit,transfer,withdrawal]),'550.00');
  assert.equal(t.treasuryAccountBalance(b.id,[opening,deposit,transfer,withdrawal]),'25.00');
  const voided=t.voidTreasuryEntry(withdrawal,'Correction');assert.equal(t.treasuryAccountBalance(b.id,[opening,deposit,transfer,voided]),'50.00');assert.match(voided.voidReason,/Correction/);
});

test('linked customer and supplier payments are allocated exactly once in treasury projection',async()=>{
  const t=await import('../dist/src/lib/treasury-ledger.js');
  const account=t.createTreasuryAccount({label:'Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const payments=[{id:'p1',invoiceId:'i1',invoiceNumber:'INV-1',customerId:'c1',customerNameEn:'Atlas',customerNameAr:'',currency:'USD',amount:'100.00',date:'2026-01-01',method:'bank-transfer',reference:'COL',notes:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
  const entry={...t.createTreasuryEntry('collection','USD'),workspaceId:'default',branchId:'main',date:'2026-01-01',amount:'100.00',toAccountId:account.id,sourceType:'customer-payment',sourceId:'p1'};t.assertTreasuryEntry(entry,[account]);
  assert.equal(t.treasuryLinkedSourceUsed([entry],'customer-payment','p1'),true);
  const rows=t.treasuryProjection(payments,[],[],[entry],[],'USD');assert.equal(rows.filter(row=>row.source==='collection').length,1);assert.equal(rows[0].key,`treasury:${entry.id}`);assert.equal(t.treasuryAccountBalance(account.id,[entry]),'100.00');
});

test('dated FX lookup supports deterministic inverse conversion without changing saved rate direction',async()=>{
  const fx=await import('../dist/src/lib/fx-rates.js');
  const rate={id:'fx1',workspaceId:'default',date:'2026-10-01',fromCurrency:'USD',toCurrency:'SAR',rate:'3.75',sourceLabel:'Bank',notes:'',createdAt:'',updatedAt:'1'};
  const direct=fx.fxRateMatchForDate([rate],'USD','SAR','2026-10-01'),inverse=fx.fxRateMatchForDate([rate],'SAR','USD','2026-10-01');assert.equal(direct.inverse,false);assert.equal(inverse.inverse,true);assert.equal(fx.convertWithFxMatch('100.00',direct),'375.00');assert.equal(fx.convertWithFxMatch('375.00',inverse),'100.00');assert.equal(rate.fromCurrency,'USD');assert.equal(rate.toCurrency,'SAR');
});

test('v21 migration creates explicit definitions for previously referenced bank metadata without inventing balances',async()=>{
  const [{emptyVault},{migrateVault}]=await Promise.all([import('../dist/src/lib/defaults.js'),import('../dist/src/storage/vault.js')]);
  const legacy=structuredClone(emptyVault());legacy.schemaVersion=20;delete legacy.treasuryAccounts;legacy.treasuryEntries=[{id:'old1',workspaceId:'default',branchId:'main',type:'deposit',date:'2026-01-01',currency:'USD',amount:'10.00',fromAccountId:'',toAccountId:'primary',reference:'',notes:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
  const migrated=migrateVault(legacy);assert.equal(migrated.treasuryAccounts.length,1);assert.equal(migrated.treasuryAccounts[0].id,'primary');assert.equal(migrated.treasuryEntries[0].sourceType,'manual');assert.equal(migrated.treasuryEntries[0].voidedAt,'');
});
