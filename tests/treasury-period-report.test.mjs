import test from 'node:test';
import assert from 'node:assert/strict';
import {treasuryPeriodReport,treasuryReportCsv} from '../dist/src/lib/treasury-report.js';
const at='2026-10-01T00:00:00.000Z';
const account=(id,currency='USD',patch={})=>({id,label:id,kind:'bank',currency,active:true,workspaceId:'default',branchId:'main',createdAt:at,updatedAt:at,...patch});
const entry=(id,date,amount,toAccountId,patch={})=>({id,date,amount,toAccountId,fromAccountId:'',type:'deposit',currency:'USD',sourceType:'manual',sourceId:'',reference:id,notes:'',createdAt:at,updatedAt:at,voidedAt:'',reconciledAt:'',workspaceId:'default',branchId:'main',...patch});
const fixture=()=>({workspaceId:'default',branchId:'main',from:'2026-10-01',to:'2026-10-31',accounts:[account('bank'),account('cash','USD',{active:false}),account('euro','EUR'),account('foreign','USD',{branchId:'other'})],entries:[entry('open','2026-09-01','100.00','bank',{type:'opening-balance'}),entry('negative','2026-09-01','20.00','',{fromAccountId:'cash',type:'opening-balance'}),entry('old-void','2026-09-10','30.00','bank',{voidedAt:'2026-10-12T01:00:00.000Z',voidReason:'Correction'}),entry('deposit','2026-10-10','50.00','bank'),entry('transfer','2026-10-11','10.00','cash',{fromAccountId:'bank',type:'transfer'}),entry('future','2026-11-01','999.00','bank'),entry('euro','2026-10-10','7.00','euro',{currency:'EUR'}),entry('foreign','2026-10-10','999.00','foreign',{branchId:'other'})],payments:[{id:'unallocated',date:'2026-10-12',amount:'999.00',currency:'USD',customerNameEn:'Unallocated',createdAt:at}],supplierPayments:[],expenses:[],reconciliations:[{id:'r',movementKey:'treasury:deposit',action:'reconcile',createdAt:'2026-10-15T00:00:00.000Z',reconciledAt:'2026-10-15T00:00:00.000Z'},{id:'u',movementKey:'treasury:deposit',action:'undo',createdAt:'2026-11-01T00:00:00.000Z',reconciledAt:''}]});
test('period account balances explain late voids, transfers and negative openings without unallocated cash',()=>{const input=fixture(),before=JSON.stringify(input),report=treasuryPeriodReport(input);assert.equal(JSON.stringify(input),before);assert.equal(report.accounts.length,3);const bank=report.accounts.find(a=>a.id==='bank'),cash=report.accounts.find(a=>a.id==='cash');assert.deepEqual([bank.opening,bank.change,bank.closing],['130.00','10.00','140.00']);assert.deepEqual([cash.opening,cash.change,cash.closing],['-20.00','10.00','-10.00']);assert.deepEqual(bank.movements.map(m=>[m.reference,m.amount,m.status]),[['deposit','50.00','reconciled'],['transfer','-10.00','open'],['old-void','-30.00','void']]);assert.equal(report.unallocated.length,1);assert.equal(report.unallocated[0].amount,'999.00');});
test('currency/account filters do not blend currencies or unallocated sources',()=>{assert.deepEqual(treasuryPeriodReport({...fixture(),currency:'EUR'}).accounts.map(a=>a.id),['euro']);const r=treasuryPeriodReport({...fixture(),accountId:'cash'});assert.equal(r.accounts.length,1);assert.equal(r.unallocated.length,0);assert.throws(()=>treasuryPeriodReport({...fixture(),accountId:'foreign'}),/account/i);});
test('as-of status precedes later Undo and void; same-day void effects net zero',()=>{const f=fixture();f.entries.push(entry('same','2026-10-10','2.00','bank',{voidedAt:'2026-10-10T01:00:00.000Z'}));let r=treasuryPeriodReport(f);assert.equal(r.accounts[0].closing,'140.00');assert.equal(r.accounts[0].movements.filter(m=>m.reference==='same').length,2);r=treasuryPeriodReport({...f,to:'2026-10-11'});assert.equal(r.accounts[0].closing,'170.00');assert.equal(r.accounts[0].movements.find(m=>m.reference==='deposit').status,'open');});
test('invalid dates fail before generating an output',()=>{for(const patch of [{from:''},{from:'2026-02-30'},{from:'2026-11-01'},{to:'bad'}])assert.throws(()=>treasuryPeriodReport({...fixture(),...patch}),/period/i);});
test('linked collections appear once and other scopes never leak',()=>{const f=fixture();f.entries.push(entry('linked','2026-10-12','999.00','bank',{type:'collection',sourceType:'customer-payment',sourceId:'unallocated'}));f.payments.push({...f.payments[0],id:'foreign-payment',branchId:'other'});const r=treasuryPeriodReport(f);assert.equal(r.unallocated.length,0);assert.equal(r.accounts[0].closing,'1139.00');});
test('CSV retains exact negative balances and escapes user text as text',()=>{const f=fixture();f.accounts[0].label='=SUM(1,2)';f.entries[3].reference='-1+2';const csv=treasuryReportCsv(treasuryPeriodReport(f));assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=SUM(1,2)"'));assert.ok(csv.includes("'-1+2"));assert.ok(csv.includes(',-30.00,'));assert.ok(csv.includes(',-20.00,'));});
test('legacy unallocated currency uses company default and keeps supplier/expense rows separate',()=>{const f=fixture();f.defaultCurrency='EUR';f.payments[0].currency='';f.supplierPayments=[{id:'supplier',date:'2026-10-12',currency:'EUR',amount:'6.00',supplierNameEn:'Supplier',reference:'SUP',createdAt:at}];f.expenses=[{id:'expense',date:'2026-10-12',currency:'EUR',amount:'3.00',description:'Expense',reference:'EXP',createdAt:at}];const r=treasuryPeriodReport({...f,currency:'EUR'});assert.equal(r.unallocated.length,3);assert.ok(r.unallocated.every(x=>x.currency==='EUR'));assert.equal(r.accounts[0].closing,'7.00');});
test('unallocated CSV money is normalized and cannot execute malformed historical amounts',()=>{const f=fixture();f.payments[0].amount='1,25';assert.equal(treasuryPeriodReport(f).unallocated[0].amount,'1.25');f.payments[0].amount='=1+1';assert.throws(()=>treasuryPeriodReport(f),/amount|monetary/i);});

test('historical mismatched EUR entry cannot silently contaminate USD cash balances',()=>{
  const f=fixture();const before=JSON.stringify(f);
  f.entries.push(entry('bad-usd-bank','2026-10-20','25.00','bank',{currency:'EUR'}));
  const immutable=JSON.stringify(f);
  assert.throws(()=>treasuryPeriodReport(f),/currency|عملة/i);
  assert.equal(JSON.stringify(f),immutable,'read-only validation never alters source');
  assert.notEqual(before,immutable);
});

test('currency mismatches before report from-date also block an incorrect opening balance',()=>{
  const f=fixture();
  f.entries.push(entry('bad-opening','2026-09-09','19.00','bank',{currency:'EUR'}));
  assert.throws(()=>treasuryPeriodReport(f),/currency|عملة/i);
});

test('only related on-or-before-date entries are guarded; matching EUR accounts remain independent',()=>{
  const f=fixture();
  f.entries.push(entry('euros-correct','2026-10-15','3.00','euro',{currency:'EUR'}));
  f.entries.push(entry('future-invalid','2026-11-25','250.00','bank',{currency:'EUR'}));
  const report=treasuryPeriodReport(f);
  assert.equal(report.accounts.find(a=>a.id==='bank').closing,'140.00');
  assert.equal(report.accounts.find(a=>a.id==='euro').closing,'10.00');
  const filtered=treasuryPeriodReport({...f,currency:'EUR'});
  assert.deepEqual(filtered.accounts.map(a=>a.id),['euro']);
  assert.equal(filtered.accounts[0].closing,'10.00');
});

test('cross-currency transfer to a same-currency account is refused in report even for legacy stored rows',()=>{
  const f=fixture();
  f.entries.push(entry('bad-transfer','2026-10-17','5.00','euro',{
    fromAccountId:'bank',type:'transfer',currency:'USD'
  }));
  assert.throws(()=>treasuryPeriodReport(f),/currency|عملة/i);
});

test('previously voided legacy currency error does not block a later clean period',()=>{
  const f=fixture();
  f.entries.push(entry('old-mismatch-voided','2026-08-10','19.00','bank',{
    currency:'EUR',voidedAt:'2026-09-12T00:00:00.000Z'
  }));
  assert.equal(treasuryPeriodReport(f).accounts.find(a=>a.id==='bank').closing,'140.00');
  f.entries[f.entries.length-1].voidedAt='2026-10-12T00:00:00.000Z';
  assert.throws(()=>treasuryPeriodReport(f),/currency|عملة/i,
    'void inside selected period is a displayed movement and must remain guarded');
});
