import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

function savedItem(id='item-1'){return{id,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',sku:'SKU-1',descriptionEn:'Widget',descriptionAr:'قطعة',hsCode:'',origin:'Türkiye',packing:'Box',unit:'PCS',lastUnitPrice:'20.00',lastCurrency:'USD',lastUnitCost:'6.00',lastCostCurrency:'USD',usageCount:1,lastUsedAt:'2026-01-01T00:00:00.000Z',category:'Hardware',tags:[],favorite:false,archived:false};}
function customerSnapshot(){return{sourceCustomerId:'customer-1',companyNameEn:'Atlas',companyNameAr:'أطلس',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};}
function companySnapshot(){return{nameEn:'LOUREX',nameAr:'لوركس',logoDataUrl:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',website:'',vatNumber:'',taxNumber:'',commercialRegistration:'',bank:{bankName:'',accountName:'',iban:'',swift:'',currency:'USD'},signatureDataUrl:'',stampDataUrl:'',footerText:''};}
function invoice({id='inv-1',cost='6.00',issueDate='2026-06-15'}={}){return{id,kind:'invoice',role:'standard',status:'final',lifecycleStatus:'active',revision:1,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',bankAccountId:'',paymentTermPresetId:'',number:`INV-${id}`,issueDate,dueDate:'2026-07-15',currency:'USD',language:'en',customerSnapshot:customerSnapshot(),supplierSnapshot:null,companySnapshot:companySnapshot(),attachments:[],items:[{id:'line-1',descriptionEn:'Widget',descriptionAr:'قطعة',hsCode:'',origin:'Türkiye',packing:'Box',quantity:'10',unit:'PCS',unitPrice:'10.00',unitCost:cost}],terms:{incoterm:'',paymentTerms:'',packing:'',deliveryTime:'',portOfLoading:'',finalDestination:'',countryOfOrigin:'',validity:'',remarks:''},adjustments:{discountEnabled:false,discountMode:'fixed',discountValue:'0',shippingEnabled:false,shipping:'0',otherChargesEnabled:false,otherCharges:'0',taxEnabled:false,taxPercent:'0'},internalCosts:{shippingCost:'10.00',otherCost:'0.00'},appearance:{templateId:'executive',paletteMode:'auto',accentColor:'',latinFont:'auto',arabicFont:'auto',showBank:false,showSignature:false,showStamp:false,showHsCode:false,showOrigin:false,showPacking:false,watermark:{enabled:false,type:'text',pattern:'single',text:'',opacity:.1,color:'#000000',angle:0,size:12}},letter:null,notes:'',convertedFromId:'',createdAt:'2026-06-15T00:00:00.000Z',updatedAt:'2026-06-15T00:00:00.000Z'};}
function purchase(){return{id:'purchase-1',number:'PO-1',date:'2026-05-01',dueDate:'2026-05-31',supplierSnapshot:{sourceSupplierId:'supplier-1',nameEn:'Verified Supplier',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''},currency:'USD',items:[{id:'pl-1',savedItemId:'item-1',sku:'SKU-1',descriptionEn:'Widget',descriptionAr:'قطعة',quantity:'100',unit:'PCS',unitCost:'5.00',landedUnitCost:'6.00',previousUnitCost:'',previousCostCurrency:''}],freight:'0',duty:'0',otherCosts:'0',notes:'',status:'posted',postedAt:'2026-05-01T00:00:00.000Z',reversedAt:'',reverseReason:'',createdAt:'2026-05-01T00:00:00.000Z',updatedAt:'2026-05-01T00:00:00.000Z'};}

test('v21 migration creates real treasury/FX/warehouse ledgers without changing historical inventory total',async()=>{
  const [{emptyVault,APP_SCHEMA_VERSION},{migrateVault},{inventoryBalances}]=await Promise.all([import('../dist/src/lib/defaults.js'),import('../dist/src/storage/vault.js'),import('../dist/src/lib/operations.js')]);
  assert.ok(APP_SCHEMA_VERSION>=21);
  const legacy=structuredClone(emptyVault());legacy.schemaVersion=20;
  delete legacy.treasuryEntries;delete legacy.treasuryReconciliations;delete legacy.fxRates;delete legacy.warehouses;
  legacy.savedItems=[savedItem()];legacy.inventoryMovements=[{id:'stock-old',itemId:'item-1',itemNameEn:'Widget',itemNameAr:'قطعة',sku:'SKU-1',date:'2026-01-10',type:'opening',quantity:'25',unitCost:'5',currency:'USD',sourceId:'',sourceNumber:'',note:'',createdAt:'2026-01-10T00:00:00.000Z'}];
  const before=inventoryBalances(legacy.savedItems,legacy.inventoryMovements)[0].quantity;
  const migrated=migrateVault(legacy);
  const after=inventoryBalances(migrated.savedItems,migrated.inventoryMovements)[0].quantity;
  assert.equal(before,after);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);
  assert.deepEqual(migrated.treasuryEntries,[]);assert.deepEqual(migrated.treasuryReconciliations,[]);assert.deepEqual(migrated.fxRates,[]);
  assert.ok(migrated.warehouses.some(w=>w.id==='warehouse-main'&&w.branchId==='main'));
  assert.equal(migrated.inventoryMovements[0].toWarehouseId,'warehouse-main');
});

test('warehouse transfer moves location stock while remaining zero-net globally',async()=>{
  const [{createWarehouseTransfer,warehouseBalances},{inventoryBalances}]=await Promise.all([import('../dist/src/lib/warehouses.js'),import('../dist/src/lib/operations.js')]);
  const item=savedItem(),opening={id:'open',itemId:item.id,itemNameEn:'Widget',itemNameAr:'قطعة',sku:'SKU-1',date:'2026-01-01',type:'opening',quantity:'20',unitCost:'5',currency:'USD',sourceId:'',sourceNumber:'',note:'',toWarehouseId:'wh-a',fromWarehouseId:'',createdAt:'2026-01-01T00:00:00.000Z'};
  const transfer=createWarehouseTransfer(item,'wh-a','wh-b','7.5','2026-01-02','Move');
  const total=inventoryBalances([item],[opening,transfer])[0];
  assert.equal(total.quantity,'20');
  const warehouses=[{id:'wh-a',workspaceId:'default',branchId:'main',name:'A',code:'A',active:true,createdAt:'',updatedAt:''},{id:'wh-b',workspaceId:'default',branchId:'main',name:'B',code:'B',active:true,createdAt:'',updatedAt:''}];
  const balances=warehouseBalances([item],[opening,transfer],warehouses,'wh-a');
  assert.equal(balances.find(r=>r.warehouseId==='wh-a').quantity,'12.5');
  assert.equal(balances.find(r=>r.warehouseId==='wh-b').quantity,'7.5');
  assert.equal(transfer.type,'transfer');
});

test('treasury projection stays currency-separated, keeps transfers internal, and reconciles exact movement keys',async()=>{
  const {treasuryProjection,treasuryTotals}=await import('../dist/src/lib/treasury-ledger.js');
  const payments=[{id:'p1',invoiceId:'i1',invoiceNumber:'INV-1',customerId:'c1',customerNameEn:'Atlas',customerNameAr:'',currency:'USD',amount:'100.00',date:'2026-01-01',method:'bank-transfer',reference:'COL',notes:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
  const supplier=[{id:'sp1',purchaseId:'po1',purchaseNumber:'PO-1',supplierId:'s1',supplierNameEn:'Supplier',supplierNameAr:'',currency:'USD',amount:'30.00',date:'2026-01-02',method:'bank-transfer',reference:'PAY',notes:'',createdAt:'2026-01-02T00:00:00.000Z',updatedAt:'2026-01-02T00:00:00.000Z'}];
  const expenses=[{id:'e1',date:'2026-01-03',category:'General',description:'Rent',amount:'10.00',currency:'EUR',supplierId:'',reference:'',notes:'',createdAt:'2026-01-03T00:00:00.000Z',updatedAt:'2026-01-03T00:00:00.000Z'}];
  const entries=[{id:'t1',workspaceId:'default',branchId:'main',type:'transfer',date:'2026-01-04',currency:'USD',amount:'25.00',fromAccountId:'a',toAccountId:'b',reference:'MOVE',notes:'',createdAt:'2026-01-04T00:00:00.000Z',updatedAt:'2026-01-04T00:00:00.000Z'}];
  const reconciliations=[{id:'r1',workspaceId:'default',branchId:'main',movementKey:'collection:p1',reconciledAt:'2026-01-05T00:00:00.000Z',note:'',createdAt:'',updatedAt:''}];
  const rows=treasuryProjection(payments,supplier,expenses,entries,reconciliations,'USD');
  assert.equal(rows.find(r=>r.key==='collection:p1').reconciled,true);
  const usd=treasuryTotals(rows,'USD');assert.equal(usd.inflow,'100.00');assert.equal(usd.outflow,'30.00');assert.equal(usd.net,'70.00');assert.equal(usd.internalTransfers,'25.00');
  const eur=treasuryTotals(rows,'EUR');assert.equal(eur.outflow,'10.00');assert.equal(eur.net,'-10.00');
  assert.ok(!('balance' in usd),'movement totals must not invent a bank balance');
});

test('dated FX rates require a source and use the latest rate on or before the requested date',async()=>{
  const {assertFxRate,fxRateForDate,convertWithFxRate}=await import('../dist/src/lib/fx-rates.js');
  const rates=[{id:'r1',workspaceId:'default',date:'2026-01-01',fromCurrency:'USD',toCurrency:'SAR',rate:'3.70',sourceLabel:'Bank A',notes:'',createdAt:'',updatedAt:'1'},{id:'r2',workspaceId:'default',date:'2026-02-01',fromCurrency:'USD',toCurrency:'SAR',rate:'3.75',sourceLabel:'Bank A',notes:'',createdAt:'',updatedAt:'2'}];
  assert.doesNotThrow(()=>assertFxRate(rates[0]));
  assert.throws(()=>assertFxRate({...rates[0],sourceLabel:''}),/source/i);
  assert.equal(fxRateForDate(rates,'USD','SAR','2026-01-15').id,'r1');
  assert.equal(fxRateForDate(rates,'USD','SAR','2026-02-20').id,'r2');
  assert.equal(convertWithFxRate('100.00',rates[1]),'375.00');
  assert.equal(fxRateForDate(rates,'USD','SAR','2025-12-31'),undefined);
});

test('profitability dimensions preserve missing-cost withholding and evidence-based supplier attribution',async()=>{
  const {productProfitabilityRows,invoiceProfitabilityRows,supplierProfitabilityRows,categoryProfitabilityRows}=await import('../dist/src/lib/profitability-dimensions.js');
  const item=savedItem(),complete=invoice(),missing=invoice({id:'inv-missing',cost:''});
  const supplier={id:'supplier-1',createdAt:'',updatedAt:'',nameEn:'Verified Supplier',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'',notes:''};
  const pRows=productProfitabilityRows([complete],[item]);assert.equal(pRows.length,1);assert.equal(pRows[0].profitComplete,true);
  const iRows=invoiceProfitabilityRows([missing]);assert.equal(iRows[0].profitComplete,false);assert.equal(iRows[0].grossProfit,'');
  const sRows=supplierProfitabilityRows([complete],[item],[purchase()],[supplier]);assert.equal(sRows[0].label,'Verified Supplier');
  const unattributed=supplierProfitabilityRows([complete],[item],[],[supplier]);assert.equal(unattributed[0].label,'Unattributed');assert.match(unattributed[0].note,/No qualifying posted purchase evidence/);
  const cRows=categoryProfitabilityRows([complete],[item]);assert.equal(cRows[0].label,'Hardware');
});

test('roadmap placement and deterministic safeguards are wired in canonical workspaces',async()=>{
  const [finance,reports,products,warehouse,styles,index,types]=await Promise.all([read('src/components/FinanceWorkspace.tsx'),read('src/components/ReportsPage.tsx'),read('src/components/ProductsInventoryWorkspace.tsx'),read('src/components/WarehouseLocationsPage.tsx'),read('src/styles/roadmap-hardening-final.css'),read('index.html'),read('src/types.ts')]);
  assert.match(finance,/TreasuryLedgerPage/);assert.match(finance,/FxRatesPage/);assert.doesNotMatch(finance,/ProfitabilityCenter/);
  assert.match(reports,/ProfitabilityReports/);assert.match(reports,/TaxVatCenter/);
  assert.match(products,/WarehouseLocationsPage/);assert.doesNotMatch(products,/StockLocationsPage/);
  assert.match(warehouse,/decimalToScaled\(quantity,4\)/);assert.doesNotMatch(warehouse,/Number\(quantity/);
  assert.match(types,/TreasuryLedgerRecord/);assert.match(types,/FxRateRecord/);assert.match(types,/WarehouseRecord/);assert.match(types,/\| 'transfer'/);
  assert.match(index,/roadmap-hardening-final\.css/);assert.match(styles,/min-height:44px/);assert.match(styles,/html\[dir="rtl"\]/);assert.match(styles,/prefers-reduced-motion/);
});
