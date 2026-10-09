import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const read=path=>readFile(path,'utf8');
function functionSource(source,start,next){
  const first=source.indexOf(start);
  const last=source.indexOf(next,first+start.length);
  assert.ok(first>=0&&last>first,`Missing source function: ${start}`);
  return source.slice(first,last);
}

test('inventory planning excludes internal transfers and invalid or future-dated movements from historical stock',async()=>{
  const source=await read('src/lib/inventory-planning.ts');
  const fn=functionSource(source,'function movementKnownBy(','\nfunction issueVelocityByItem(');
  const compiled=ts.transpileModule(fn,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const balances=new Function('inventoryMovementAccountingIsValid','scaled','isIsoDate',compiled+';return balanceByItem;')(
    movement=>movement.valid!==false,
    quantity=>BigInt(Math.round(Number(quantity)*10000)),
    value=>/^\d{4}-\d{2}-\d{2}$/.test(value)
  );
  const rows=[
    {itemId:'sku1',quantity:'10',type:'opening',date:'2026-10-01',createdAt:'2026-10-01T09:00:00Z'},
    {itemId:'sku1',quantity:'4',type:'transfer',date:'2026-10-02',fromWarehouseId:'a',toWarehouseId:'b'},
    {itemId:'sku1',quantity:'2',type:'transfer',date:'2026-10-03',fromWarehouseId:'b',toWarehouseId:'c'},
    {itemId:'sku1',quantity:'-1',type:'issue',date:'2026-10-04',createdAt:'2026-10-04T12:00:00Z'},
    {itemId:'sku1',quantity:'100',type:'purchase',date:'2026-10-05',valid:false},
    {itemId:'sku1',quantity:'20',type:'purchase',date:'2026-10-05',createdAt:'2026-10-11T09:00:00Z'},
    {itemId:'sku1',quantity:'9',type:'purchase',date:'2026-10-15',createdAt:'2026-10-05T09:00:00Z'}
  ];
  assert.equal(balances(rows,'2026-10-09').get('sku1'),90000n,'as-of excludes transfers, invalid, later-posted and future-dated entries');
  assert.equal(balances(rows.slice(0,3),'2026-10-09').get('sku1'),100000n,'two internal transfers must not create stock');
  assert.equal(balances(rows,'2026-10-02').get('sku1'),100000n,'past cutoff remains historical');
  assert.equal(balances(rows,'2026-10-12').get('sku1'),290000n,'backdated purchases become visible only after actual posting');
});

test('warehouse transfer and archive recheck latest queued vault, not UI props',async()=>{
  const source=await read('src/components/WarehouseLocationsPage.tsx');
  const fn=functionSource(source,'  const archive=async(', '\n  return <section');
  assert.match(fn,/mutateVaultSafely\(vault=>\{/);
  assert.match(fn,/canArchiveWarehouse\(current\.id,vault\.savedItems,vault\.inventoryMovements,defaultId\)/);
  assert.match(fn,/warehouseItemQuantity\(item\.id,from,vault\.inventoryMovements,defaultId\)/);
  assert.match(fn,/required>available/);
  assert.match(fn,/activeLocation\(from\)\|\|!activeLocation\(to\)/);
  assert.doesNotMatch(fn,/warehouseItemQuantity\([^\n]*props\.inventoryMovements/);
});

test('supplier AI purchase monetary values are major units and distinguish landed costs',async()=>{
  const source=await read('src/lib/ai-tool-orchestrator.ts');
  assert.match(source,/import \{ inventoryBalances, purchaseTotals \} from '\.\/operations\.js'/);
  const fn=functionSource(source,'function readSupplierSummary(', '\nfunction costHistory(')
    .replace('runtime:AiToolRuntime,args:Record<string,unknown>):unknown','runtime,args)');
  const readSummary=new Function('findSupplier','supplierPayablesByCurrency','todayIso','supplierName','purchaseTotals',`${fn}; return readSupplierSummary;`)(
    runtime=>runtime.vault.suppliers[0],
    ()=>[],
    ()=>'2026-10-08',
    supplier=>supplier.name,
    purchase=>({subtotal:purchase.subtotal,landedTotal:purchase.landedTotal})
  );
  const vault={suppliers:[{id:'s1',name:'Sample',city:'',country:'',defaultCurrency:'USD',paymentTerms:''}],supplierPayments:[],
    purchases:[
      {id:'p1',number:'P-1',date:'2026-10-08',status:'posted',currency:'USD',subtotal:'100.00',landedTotal:'115.25',supplierSnapshot:{sourceSupplierId:'s1'}},
      {id:'p2',number:'P-2',date:'2026-10-07',status:'posted',currency:'EUR',subtotal:'40.00',landedTotal:'48.90',supplierSnapshot:{sourceSupplierId:'s1'}}
    ]};
  const result=readSummary({vault},{});
  assert.deepEqual(result.recentPurchases.map(row=>[row.currency,row.subtotal,row.landedTotal,row.total]),[
    ['USD','100.00','115.25','115.25'],['EUR','40.00','48.90','48.90']
  ]);
});

test('paid treasury allocations cannot be orphaned by payment edits or deletion',async()=>{
  const source=await read('src/storage/vault-merge.ts');
  const fn=functionSource(source,'function guardAllocatedPaymentChanges<','\nexport function mergeVaultIntent(')
    .replace('<T extends {id:string}>','')
    .replace("base:T[],intended:T[],entries:VaultPayload['treasuryEntries'],","base,intended,entries,")
    .replace("sourceType:'customer-payment'|'supplier-payment',label:string","sourceType,label")
    .replace('):void',')');
  const guard=new Function('sameRecord',`${fn}; return guardAllocatedPaymentChanges;`)(
    (a,b)=>JSON.stringify(a)===JSON.stringify(b)
  );
  const customer=[{id:'cp1',amount:'30.00'}];
  const supplier=[{id:'sp1',amount:'20.00'}];
  const linked=[
    {sourceType:'customer-payment',sourceId:'cp1',voidedAt:''},
    {sourceType:'supplier-payment',sourceId:'sp1',voidedAt:''}
  ];
  assert.throws(()=>guard(customer,[],linked,'customer-payment','Customer payment'),/active linked treasury/);
  assert.throws(()=>guard(customer,[{id:'cp1',amount:'45.00'}],linked,'customer-payment','Customer payment'),/active linked treasury/);
  assert.throws(()=>guard(supplier,[],linked,'supplier-payment','Supplier payment'),/active linked treasury/);
  assert.doesNotThrow(()=>guard(customer,[...customer],linked,'customer-payment','Customer payment'));
  assert.doesNotThrow(()=>guard(customer,[],linked.map(e=>({...e,voidedAt:'2026-10-08'})),'customer-payment','Customer payment'));
  assert.match(source,/guardAllocatedPaymentChanges\(base\.payments,intended\.payments,treasuryEntries,'customer-payment'/);
});
