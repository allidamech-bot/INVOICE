import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {
  createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,
  treasuryAccountDisplayBalance,appendTreasuryEntry
} from '../dist/src/lib/treasury-ledger.js';
import {treasuryPeriodReport} from '../dist/src/lib/treasury-report.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

// Alif synthetic cash/bank card QA. No Firebase, real bank records or
// production access. The ID-only legacy helper stays unchanged.
const scope={workspaceId:'default',branchId:'main'};
const account=(name='bank',currency='USD')=>({
  ...createTreasuryAccount({label:'QA '+name,kind:'bank',currency,...scope}),id:name
});
const entry=(id,accountId='bank',currency='USD',amount='40.00',changes={})=>({
  ...createTreasuryEntry('deposit',currency),id,...scope,
  date:'2026-10-10',amount,toAccountId:accountId,createdAt:'2026-10-10T09:00:00.000Z',
  updatedAt:'2026-10-10T09:00:00.000Z',...changes
});
const report=(accounts,entries)=>treasuryPeriodReport({
  ...scope,from:'2026-10-01',to:'2026-10-31',
  accounts,entries,payments:[],supplierPayments:[],expenses:[],
  reconciliations:[],defaultCurrency:'USD'
});

test('valid postings still show exact USD account position and preserve original ID-only helper',()=>{
  const bank=account(),entries=[entry('opening','bank','USD','100.00'),
    entry('payment','bank','USD','30.00',{type:'withdrawal',fromAccountId:'bank',toAccountId:''})];
  const frozen=JSON.stringify(entries);
  assert.deepEqual(treasuryAccountDisplayBalance(bank,entries),
    {balance:'70.00',needsReview:false});
  assert.equal(treasuryAccountBalance(bank.id,entries),'70.00');
  assert.equal(report([bank],entries).accounts[0].closing,'70.00');
  assert.equal(JSON.stringify(entries),frozen,'read-only guard cannot alter history');
});

test('foreign EUR historical entry cannot masquerade as dollars in the bank card',()=>{
  const bank=account(),entries=[entry('valid','bank','USD','100.00'),
    entry('legacy-eur','bank','EUR','80.00')],frozen=JSON.stringify(entries);
  assert.equal(treasuryAccountBalance(bank.id,entries),'180.00',
    'unscoped old helper proves pre-existing misleading display risk');
  assert.deepEqual(treasuryAccountDisplayBalance(bank,entries),
    {balance:null,needsReview:true});
  assert.throws(()=>report([bank],entries),/currency does not match/i,
    'existing report warning remains authoritative');
  assert.equal(JSON.stringify(entries),frozen);
});

test('historical entry for another company or branch sharing an ID is not counted',()=>{
  const bank=account(),valid=entry('valid','bank','USD','20.00');
  for(const changes of [{workspaceId:'other-company'},{branchId:'east'}]){
    const foreign=entry('foreign','bank','USD','90.00',changes);
    const before=JSON.stringify([valid,foreign]);
    assert.deepEqual(treasuryAccountDisplayBalance(bank,[valid,foreign]),
      {balance:null,needsReview:true});
    assert.equal(JSON.stringify([valid,foreign]),before);
  }
});

test('already voided mismatched historical entry does not poison current cash position',()=>{
  const bank=account(),valid=entry('valid','bank','USD','100.00'),
    cancelled=entry('voided','bank','EUR','45.00',{
      voidedAt:'2026-10-12T10:00:00.000Z',voidReason:'Synthetic correction'});
  assert.deepEqual(treasuryAccountDisplayBalance(bank,[valid,cancelled]),
    {balance:'100.00',needsReview:false});
  assert.equal(treasuryAccountBalance(bank.id,[valid,cancelled]),'100.00');
});

test('absent legacy scope falls back only to default/main, not another branch',()=>{
  const bank=account(),old=entry('legacy','bank','USD','25.00',{
    workspaceId:undefined,branchId:undefined});
  assert.deepEqual(treasuryAccountDisplayBalance(bank,[old]),
    {balance:'25.00',needsReview:false});
  assert.deepEqual(treasuryAccountDisplayBalance({...bank,branchId:'east'},[old]),
    {balance:null,needsReview:true});
});

test('historical amount errors never render a fabricated bank balance',()=>{
  const bank=account(),bad=entry('bad','bank','USD','invalid-financial-money');
  assert.deepEqual(treasuryAccountDisplayBalance(bank,[bad]),
    {balance:null,needsReview:true});
});

test('correct new bank entry still posts once and matches card and reporting ledger',()=>{
  const bank=account(),base={...emptyVault(),treasuryAccounts:[bank]};
  const good=entry('new-30','bank','USD','30.00');
  const recorded=appendTreasuryEntry(base,good);
  const merged=mergeVaultIntent(base,recorded,base);
  assert.deepEqual(treasuryAccountDisplayBalance(bank,merged.treasuryEntries),
    {balance:'30.00',needsReview:false});
  assert.equal(report([bank],merged.treasuryEntries).accounts[0].closing,'30.00');
  assert.equal(merged.treasuryEntries.length,1);
});

test('cash/bank UI uses checked account balances and renders review warning rather than false money',async()=>{
  const ui=await readFile(new URL('../src/components/TreasuryLedgerPage.tsx',import.meta.url),'utf8');
  assert.match(ui,/treasuryAccountDisplayBalance\(account,props\.treasuryEntries\)/);
  assert.match(ui,/verified\.needsReview\?'—'/);
  assert.match(ui,/Account ledger needs review/);
  assert.doesNotMatch(ui,/formatMoney\(treasuryAccountBalance\(/);
});
