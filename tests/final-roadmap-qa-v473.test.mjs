import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {APP_SCHEMA_VERSION,emptyVault} from '../dist/src/lib/defaults.js';
import {migrateVault} from '../dist/src/storage/vault.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
import {createTreasuryAccount,createTreasuryEntry,markTreasuryEntryReconciled,treasuryAccountBalance,treasuryLinkedSourceUsed,voidTreasuryEntry} from '../dist/src/lib/treasury-ledger.js';
import {convertWithExchangeRate,createExchangeRate,latestExchangeRate} from '../dist/src/lib/fx-rates.js';
import {createInventoryTransfer} from '../dist/src/lib/stock-transfers.js';
import {scopeVault} from '../dist/src/lib/workspaces.js';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');
const now='2026-10-01T00:00:00.000Z';
function item(id='item-a'){return{id,workspaceId:'default',createdAt:now,updatedAt:now,sku:'SKU-A',descriptionEn:'Product A',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'20',lastCurrency:'USD',lastUnitCost:'10',lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,category:'',tags:[],favorite:false};}
function movement(id,branchId,quantity){return{id,itemId:'item-a',itemNameEn:'Product A',itemNameAr:'',sku:'SKU-A',date:'2026-10-01',type:'opening',quantity,unitCost:'10',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:now,workspaceId:'default',branchId};}

test('schema v21 migrates older vaults with explicit finance and location collections',()=>{
  const legacy=emptyVault();legacy.schemaVersion=20;
  delete legacy.treasuryAccounts;delete legacy.treasuryEntries;delete legacy.exchangeRates;delete legacy.inventoryTransfers;
  const migrated=migrateVault(legacy);
  assert.ok(APP_SCHEMA_VERSION>=21);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.deepEqual(migrated.treasuryAccounts,[]);
  assert.deepEqual(migrated.treasuryEntries,[]);
  assert.deepEqual(migrated.exchangeRates,[]);
  assert.deepEqual(migrated.inventoryTransfers,[]);
});

test('treasury balances are produced only from explicit ledger entries',()=>{
  const account=createTreasuryAccount({label:'USD Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const opening=createTreasuryEntry({type:'opening-balance',date:'2026-10-01',amount:'1000',currency:'USD',toAccountId:account.id,workspaceId:'default',branchId:'main'},[account]);
  const deposit=createTreasuryEntry({type:'deposit',date:'2026-10-01',amount:'250.25',currency:'USD',toAccountId:account.id,workspaceId:'default',branchId:'main'},[account]);
  const withdrawal=createTreasuryEntry({type:'withdrawal',date:'2026-10-01',amount:'40.10',currency:'USD',fromAccountId:account.id,workspaceId:'default',branchId:'main'},[account]);
  assert.equal(treasuryAccountBalance(account.id,[opening,deposit,withdrawal]),'1210.15');
  assert.equal(treasuryAccountBalance(account.id,[]),'0.00');
  const reconciled=markTreasuryEntryReconciled(deposit,true);assert.ok(reconciled.reconciledAt);
  const voided=voidTreasuryEntry(withdrawal,'Bank correction');assert.ok(voided.voidedAt);
  assert.equal(treasuryAccountBalance(account.id,[opening,deposit,voided]),'1250.25');
});

test('treasury preserves currency boundaries and linked source idempotence',()=>{
  const usd=createTreasuryAccount({label:'USD',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});
  const eur=createTreasuryAccount({label:'EUR',kind:'cash',currency:'EUR',workspaceId:'default',branchId:'main'});
  assert.throws(()=>createTreasuryEntry({type:'transfer',date:'2026-10-01',amount:'10',currency:'USD',fromAccountId:usd.id,toAccountId:eur.id,workspaceId:'default',branchId:'main'},[usd,eur]),/currency/i);
  const collection=createTreasuryEntry({type:'collection',date:'2026-10-01',amount:'90',currency:'USD',toAccountId:usd.id,sourceType:'customer-payment',sourceId:'payment-1',workspaceId:'default',branchId:'main'},[usd,eur]);
  assert.equal(treasuryLinkedSourceUsed([collection],'customer-payment','payment-1'),true);
});

test('dated FX rates require a source and use latest rate on-or-before the selected date',()=>{
  const r1=createExchangeRate({date:'2026-09-01',baseCurrency:'USD',quoteCurrency:'TRY',rate:'40',sourceLabel:'Bank bulletin',workspaceId:'default'});
  const r2=createExchangeRate({date:'2026-09-20',baseCurrency:'USD',quoteCurrency:'TRY',rate:'42',sourceLabel:'Bank bulletin',workspaceId:'default'});
  assert.throws(()=>createExchangeRate({date:'2026-09-20',baseCurrency:'USD',quoteCurrency:'EUR',rate:'0.9',sourceLabel:'',workspaceId:'default'}),/source/i);
  const match=latestExchangeRate([r1,r2],'USD','TRY','2026-09-15');assert.equal(match.record.id,r1.id);assert.equal(match.inverse,false);
  assert.equal(convertWithExchangeRate('100.00',match),'4000.00');
  const inverse=latestExchangeRate([r2],'TRY','USD','2026-10-01');assert.equal(inverse.inverse,true);assert.equal(convertWithExchangeRate('4200.00',inverse),'100.00');
  assert.equal(latestExchangeRate([r1],'USD','EUR','2026-10-01'),null);
});

test('stock transfers create exact paired from/to movements and enforce source availability',()=>{
  const branches=[{id:'main',workspaceId:'default',name:'Main',code:'MAIN',city:'',country:'',active:true,createdAt:now,updatedAt:now},{id:'jeddah',workspaceId:'default',name:'Jeddah',code:'JED',city:'',country:'',active:true,createdAt:now,updatedAt:now}];
  const stock=[movement('open-main','main','10')];
  const result=createInventoryTransfer({workspaceId:'default',fromBranchId:'main',toBranchId:'jeddah',item:item(),quantity:'4',date:'2026-10-01',note:'Rebalance'},branches,stock);
  assert.equal(result.movements.length,2);
  assert.equal(result.movements[0].type,'transfer-out');assert.equal(result.movements[0].quantity,'-4');assert.equal(result.movements[0].branchId,'main');
  assert.equal(result.movements[1].type,'transfer-in');assert.equal(result.movements[1].quantity,'4');assert.equal(result.movements[1].branchId,'jeddah');
  assert.equal(result.movements[0].transferId,result.transfer.id);assert.equal(result.movements[1].transferId,result.transfer.id);
  assert.equal(result.movements[0].fromBranchId,'main');assert.equal(result.movements[0].toBranchId,'jeddah');
  assert.throws(()=>createInventoryTransfer({workspaceId:'default',fromBranchId:'main',toBranchId:'jeddah',item:item(),quantity:'11',date:'2026-10-01'},branches,stock),/exceeds/i);
  assert.throws(()=>createInventoryTransfer({workspaceId:'default',fromBranchId:'main',toBranchId:'main',item:item(),quantity:'1',date:'2026-10-01'},branches,stock),/different/i);
});

test('new financial and stock domains obey company/branch workspace isolation and merge independently',()=>{
  const full=emptyVault();full.branches.push({id:'other',workspaceId:'default',name:'Other',code:'OTH',city:'',country:'',active:true,createdAt:now,updatedAt:now});
  const account=createTreasuryAccount({label:'Main USD',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});const other=createTreasuryAccount({label:'Other USD',kind:'cash',currency:'USD',workspaceId:'default',branchId:'other'});full.treasuryAccounts=[account,other];
  full.exchangeRates=[createExchangeRate({date:'2026-10-01',baseCurrency:'USD',quoteCurrency:'TRY',rate:'42',sourceLabel:'Bank',workspaceId:'default'})];
  const scoped=scopeVault(full);assert.deepEqual(scoped.treasuryAccounts.map(x=>x.id),[account.id]);assert.equal(scoped.exchangeRates.length,1);
  const base=emptyVault(),intended=structuredClone(base),latest=structuredClone(base);intended.treasuryAccounts=[account];latest.exchangeRates=[full.exchangeRates[0]];const merged=mergeVaultIntent(base,intended,latest);assert.equal(merged.treasuryAccounts.length,1);assert.equal(merged.exchangeRates.length,1);
});

test('UI placement preserves frozen primary navigation and exposes canonical finance/inventory screens',async()=>{
  const [finance,treasury,fx,products,locations,shell]=await Promise.all([read('src/components/FinanceWorkspace.tsx'),read('src/components/TreasuryPage.tsx'),read('src/components/FxPage.tsx'),read('src/components/ProductsInventoryWorkspace.tsx'),read('src/components/StockLocationsPage.tsx'),read('src/components/AppShell.tsx')]);
  assert.match(finance,/Cash & Bank/);assert.match(finance,/FX/);assert.match(treasury,/Real treasury ledger/);assert.match(treasury,/Reconciliation/);assert.match(fx,/Dated exchange-rate register/);assert.match(fx,/No silent conversion/);assert.match(products,/Stock Locations/);assert.match(locations,/From \/ To traceability/);assert.match(locations,/Reserved stock/);
  assert.doesNotMatch(shell,/navItem\('treasury'|navItem\('fx'|navItem\('locations'/);
});

test('final administrative consolidation remains in Data Center / Settings without primary-nav inflation',async()=>{
  const [settings,dataCenter,shell]=await Promise.all([read('src/components/SettingsModal.tsx'),read('src/components/DataCenterPanel.tsx'),read('src/components/AppShell.tsx')]);
  assert.match(settings,/Data & Sync|Data Center/);assert.match(settings,/Company & Brand|Commercial & Tax Defaults|Security & Access/);assert.match(dataCenter,/Backup/);assert.match(dataCenter,/Restore/);assert.match(dataCenter,/Cloud Sync/);assert.match(dataCenter,/Diagnostics/);assert.match(dataCenter,/Activity Log/);
  for(const screen of ['home','documents','customers','items','operations','receivables','reports'])assert.match(shell,new RegExp(`navItem\\('${screen}'`));
  assert.doesNotMatch(shell,/navItem\('data-center'/);
});
