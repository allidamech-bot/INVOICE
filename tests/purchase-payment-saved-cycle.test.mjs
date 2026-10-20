import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,reversePurchase,inventoryBalances} from '../dist/src/lib/operations.js';
import {createSupplierPayment,normalizeSupplierPayment,purchasePayableSummary,supplierPayablesByCurrency,supplierStatement,voidSupplierPayment} from '../dist/src/lib/payables.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
const reopen=value=>JSON.parse(JSON.stringify(value));

test('saved purchase settles once and reverses without losing stock or supplier payment history',()=>{
  const day=new Date().toISOString().slice(0,10);
  const supplier={...createSupplier(),id:'qa-purchase-cycle-supplier',nameEn:'Synthetic supplier'};
  const item={id:'qa-purchase-cycle-item',sku:'QA-CYCLE',descriptionEn:'Synthetic goods',
    descriptionAr:'',unit:'PCS',lastUnitCost:'4.00',lastCostCurrency:'USD',
    createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  let vault={...emptyVault(),suppliers:[supplier],savedItems:[item]};
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'qa-purchase-cycle',number:'PUR-QA-CYCLE',workspaceId:'default',branchId:'main',
    date:day,dueDate:day,freight:'10.00',duty:'5.00',otherCosts:'0.00'});
  purchase.items=[{...createPurchaseItem(item),id:'qa-purchase-line',quantity:'10',unitCost:'5.00'}];
  vault=reopen(mergeVaultIntent(vault,{...vault,purchases:[purchase]},vault));
  const draft=reopen(vault),posted=postPurchase(vault.purchases[0],vault.savedItems,vault.inventoryMovements);
  const intended={...vault,purchases:[posted.purchase],savedItems:posted.savedItems,inventoryMovements:posted.movements};
  vault=reopen(mergeVaultIntent(draft,intended,reopen(intended)));
  const stock=()=>inventoryBalances(vault.savedItems,vault.inventoryMovements)[0].quantity;
  const summary=()=>purchasePayableSummary(vault.purchases[0],vault.supplierPayments,day);
  assert.equal(vault.inventoryMovements.length,1);assert.equal(stock(),'10');
  assert.equal(vault.purchases[0].items[0].landedUnitCost,'6.5000');
  assert.equal(vault.inventoryMovements[0].unitCost,'6.5000');
  assert.equal(vault.savedItems[0].lastUnitCost,'6.5000');
  assert.throws(()=>postPurchase(purchase,vault.savedItems,vault.inventoryMovements),/already reflected/i);
  const postedPurchase=vault.purchases[0],originalReceipt=JSON.stringify(vault.inventoryMovements[0]);
  const payment=(state,id,amount)=>normalizeSupplierPayment(postedPurchase,supplier,state.supplierPayments,{
    ...createSupplierPayment(postedPurchase,supplier,state.supplierPayments),
    id,amount,date:day,reference:id,workspaceId:'default',branchId:'main'});
  const first=payment(vault,'qa-supplier-pay-1','20.00');
  vault=reopen(mergeVaultIntent(vault,{...vault,supplierPayments:[first]},vault));
  assert.equal(summary().total,'65.00');assert.equal(summary().paid,'20.00');
  assert.equal(summary().remaining,'45.00');assert.equal(summary().state,'partial');
  const partial=reopen(vault),second=payment(vault,'qa-supplier-pay-2','45.00');
  const before=JSON.stringify(partial);
  for(const wrong of [{...second,workspaceId:'foreign-company'},{...second,branchId:'foreign-branch'}])
    assert.throws(()=>mergeVaultIntent(partial,{...partial,supplierPayments:[first,wrong]},partial),/same company and branch as its purchase/i);
  assert.throws(()=>normalizeSupplierPayment(postedPurchase,supplier,partial.supplierPayments,{...second,supplierId:'foreign'}),/supplier does not match/i);
  assert.throws(()=>normalizeSupplierPayment(postedPurchase,supplier,partial.supplierPayments,{...second,purchaseId:'foreign'}),/purchase link is invalid/i);
  assert.equal(JSON.stringify(partial),before,'rejections cannot partially mutate the vault');
  const settled={...partial,supplierPayments:[first,second]};
  vault=reopen(mergeVaultIntent(partial,settled,reopen(settled)));
  vault=reopen(mergeVaultIntent(partial,reopen(vault),reopen(vault)));
  assert.equal(vault.supplierPayments.length,2);
  assert.equal(summary().paid,'65.00');assert.equal(summary().remaining,'0.00');assert.equal(summary().state,'paid');
  const report=supplierPayablesByCurrency(vault.purchases,vault.supplierPayments,day)[0];
  assert.equal(report.purchases,'65.00');assert.equal(report.paid,'65.00');assert.equal(report.remaining,'0.00');
  const statement=supplierStatement(supplier.id,vault.purchases,vault.supplierPayments,day)[0];
  assert.equal(statement.entries.length,3);assert.equal(statement.entries.at(-1).balance,'0.00');
  assert.throws(()=>createSupplierPayment(postedPurchase,supplier,vault.supplierPayments),/already fully paid/i);
  const secondVoid=voidSupplierPayment(vault.supplierPayments[1],'Synthetic second payment cancellation');
  vault=reopen(mergeVaultIntent(vault,{...vault,supplierPayments:[vault.supplierPayments[0],secondVoid]},vault));
  assert.equal(summary().paid,'20.00');assert.equal(summary().remaining,'45.00');
  const firstVoid=voidSupplierPayment(vault.supplierPayments[0],'Synthetic cancellation before return');
  vault=reopen(mergeVaultIntent(vault,{...vault,supplierPayments:[firstVoid,vault.supplierPayments[1]]},vault));
  const beforeReturn=reopen(vault);
  const reversed=reversePurchase(vault.purchases[0],'Synthetic goods return',vault.inventoryMovements,vault.savedItems);
  const returned={...vault,purchases:[reversed.purchase],savedItems:reversed.savedItems,
    inventoryMovements:[...vault.inventoryMovements,...reversed.movements]};
  vault=reopen(mergeVaultIntent(beforeReturn,returned,reopen(returned)));
  assert.equal(vault.inventoryMovements.length,2);assert.equal(stock(),'0');
  assert.equal(JSON.stringify(vault.inventoryMovements[0]),originalReceipt);
  assert.equal(vault.inventoryMovements[1].sourceId,purchase.id);
  assert.equal(vault.inventoryMovements[1].unitCost,vault.inventoryMovements[0].unitCost);
  assert.equal(vault.savedItems[0].lastUnitCost,'4.00');
  assert.equal(vault.supplierPayments.length,2);
  assert.ok(vault.supplierPayments.every(row=>row.purchaseId===purchase.id&&row.voidedAt&&row.voidReason));
  assert.equal(summary().state,'reversed');assert.equal(summary().remaining,'0.00');
  assert.throws(()=>reversePurchase(postedPurchase,'Duplicate return',vault.inventoryMovements,vault.savedItems),/already been reversed/i);
});
