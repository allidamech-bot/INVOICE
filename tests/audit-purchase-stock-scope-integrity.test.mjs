import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,reversePurchase} from '../dist/src/lib/operations.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

function fixture(){
  const base=emptyVault(),now=new Date().toISOString();
  const supplier={...createSupplier(),id:'purchase-scope-supplier',nameEn:'Scope Supplier',workspaceId:'default'};
  const item={id:'purchase-scope-product',sku:'PUR-SCOPE-001',descriptionEn:'Warehouse merchandise',
    descriptionAr:'',unit:'Carton',lastUnitCost:'9.00',lastCostCurrency:'USD',
    createdAt:now,updatedAt:now,workspaceId:'default'};
  base.suppliers=[supplier];base.savedItems=[item];
  const draft=createPurchase([],[supplier],'USD');
  draft.id='purchase-scope-001';
  draft.workspaceId='default';draft.branchId='main';
  draft.items=[{...createPurchaseItem(item),id:'purchase-scope-line',quantity:'4',unitCost:'9.00'}];
  const posted=postPurchase(draft,[item],[]);
  const receipt={...posted.movements[0],id:'purchase-scope-receipt',
    workspaceId:'default',branchId:'main'};
  const purchase={...posted.purchase,workspaceId:'default',branchId:'main'};
  const intended={...base,purchases:[purchase],inventoryMovements:[receipt]};
  const reversal=reversePurchase(purchase,'Supplier stock returned',[receipt],[item]);
  const reversed={...purchase,...reversal.purchase};
  const reverseMovement={...reversal.movements[0],id:'purchase-scope-reversal',
    workspaceId:'default',branchId:'main'};
  return{base,purchase,receipt,intended,reversed,reverseMovement};
}
const unrelatedSave=base=>({...base,appSettings:{...base.appSettings,uiLanguage:'ar'}});

test('local purchase receipt cannot credit a different company inventory ledger',()=>{
  const {base,intended,receipt}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,{...intended,inventoryMovements:[{
    ...receipt,workspaceId:'other-company'}]},base),
    /purchase (stock|inventory).*company|purchase (stock|inventory).*workspace/i);
  assert.equal(JSON.stringify(base),before);
});

test('remote purchase receipt cannot claim another branch during unrelated local save',()=>{
  const {base,intended,receipt}=fixture(),before=JSON.stringify(base);
  assert.throws(()=>mergeVaultIntent(base,unrelatedSave(base),{
    ...intended,inventoryMovements:[{...receipt,branchId:'other-branch'}]}),
    /purchase (stock|inventory).*branch/i);
  assert.equal(JSON.stringify(base),before);
});

test('new purchase reversal cannot draw stock from another company or branch',()=>{
  const {base,intended,reversed,reverseMovement}=fixture();
  for(const changed of [{workspaceId:'other-company'},{branchId:'other-branch'}]){
    const wrong={...intended,purchases:[reversed],inventoryMovements:[
      ...intended.inventoryMovements,{...reverseMovement,...changed}]};
    assert.throws(()=>mergeVaultIntent(intended,wrong,intended),
      /purchase (stock|inventory).*(company|branch)/i);
  }
  assert.equal(base.purchases.length,0);
});

test('new purchase stock cannot credit the company using an item from another company',()=>{
  const {base,intended}=fixture();
  const foreign={...base,savedItems:[{...base.savedItems[0],workspaceId:'other-company'}]};
  const wanted={...intended,savedItems:foreign.savedItems};
  assert.throws(()=>mergeVaultIntent(foreign,wanted,foreign),
    /purchase (stock|inventory).*item.*company/i);
});

test('normal posted purchase and its later reversal preserve quantity, identity and currency',()=>{
  const {base,intended,reversed,reverseMovement}=fixture();
  const posted=mergeVaultIntent(base,intended,base);
  assert.equal(posted.inventoryMovements.filter(m=>m.type==='purchase').length,1);
  const reversedVault=mergeVaultIntent(posted,{
    ...posted,purchases:[reversed],inventoryMovements:[...posted.inventoryMovements,reverseMovement]},posted);
  assert.equal(reversedVault.purchases[0].status,'reversed');
  assert.deepEqual(reversedVault.inventoryMovements.map(m=>m.quantity),['4','-4']);
  assert.equal(reversedVault.inventoryMovements[1].workspaceId,'default');
  assert.equal(reversedVault.inventoryMovements[1].branchId,'main');
});

test('concurrent purchase receipt replay remains explicitly rejected; unchanged history stays untouched',()=>{
  const {base,intended}=fixture();
  // Unlike invoice-issued stock (which has a deterministic source proof), generic
  // purchase movement IDs are independent records. Existing concurrency authority
  // intentionally rejects even an identical same-ID fresh movement before merging.
  assert.throws(()=>mergeVaultIntent(base,intended,structuredClone(intended)),
    /Concurrent inventory movement already exists/);
  const before=JSON.stringify(intended);
  const unrelated=mergeVaultIntent(intended,unrelatedSave(intended),structuredClone(intended));
  assert.equal(unrelated.inventoryMovements.length,1);
  assert.equal(JSON.stringify(intended),before);
});

test('new purchase receipt in another company requires an explicitly matching scope',()=>{
  const {base,intended,receipt}=fixture();
  const catalog={...base,suppliers:[{...base.suppliers[0],workspaceId:'other-company'}],
    savedItems:[{...base.savedItems[0],workspaceId:'other-company'}]};
  const purchase={...intended.purchases[0],workspaceId:'other-company',branchId:'regional'};
  const intent=(movement)=>({...catalog,purchases:[purchase],inventoryMovements:[movement]});
  assert.throws(()=>mergeVaultIntent(catalog,intent({
    ...receipt,workspaceId:undefined,branchId:undefined}),catalog),
    /Purchase stock company or branch/i,'an unstamped default-branch receipt cannot credit another company');
  const saved=mergeVaultIntent(catalog,intent({
    ...receipt,workspaceId:'other-company',branchId:'regional'}),catalog);
  assert.equal(saved.inventoryMovements.length,1);
  assert.equal(saved.inventoryMovements[0].workspaceId,'other-company');
  assert.equal(saved.inventoryMovements[0].branchId,'regional');
});
