import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createSupplier,createPurchase,createPurchaseItem,postPurchase,createManualInventoryMovement,reverseManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {createWarehouse,createWarehouseTransfer,defaultWarehouseId,warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {calculateProfitability} from '../dist/src/lib/profitability.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const reopen=value=>JSON.parse(JSON.stringify(value));

test('received stock transfers, sells and reverses a count adjustment without location or cost drift',()=>{
  const now=new Date().toISOString(),day=now.slice(0,10);
  const supplier={...createSupplier(),id:'qa-stock-cycle-supplier',nameEn:'Synthetic stock supplier'};
  const item={id:'qa-stock-cycle-item',sku:'QA-STOCK-CYCLE',descriptionEn:'Synthetic stock',
    descriptionAr:'',unit:'PCS',lastUnitCost:'5.00',lastCostCurrency:'USD',
    lastUnitPrice:'10.00',lastCurrency:'USD',usageCount:0,lastUsedAt:now,
    createdAt:now,updatedAt:now,workspaceId:'default',branchId:'main'};
  const source=defaultWarehouseId('main');
  const destination=createWarehouse('default','main','Synthetic overflow','QA-OVERFLOW');
  const foreign=createWarehouse('foreign-company','foreign-branch','Synthetic foreign','QA-FOREIGN');
  let vault=emptyVault();
  vault={...vault,suppliers:[supplier],savedItems:[item],warehouses:[...vault.warehouses,destination,foreign]};
  const save=next=>{vault=reopen(mergeVaultIntent(vault,next,vault));};
  const location=id=>warehouseItemQuantity(item.id,id,vault.inventoryMovements,source);
  const total=()=>inventoryBalances(vault.savedItems,vault.inventoryMovements)[0].quantity;
  const purchase=createPurchase([],[supplier],'USD');
  Object.assign(purchase,{id:'qa-stock-cycle-purchase',number:'PUR-QA-STOCK',date:day,
    workspaceId:'default',branchId:'main',freight:'15.00',duty:'0.00',otherCosts:'0.00'});
  purchase.items=[{...createPurchaseItem(item),id:'qa-stock-purchase-line',quantity:'10',unitCost:'5.00'}];
  save({...vault,purchases:[purchase]});
  const received=postPurchase(vault.purchases[0],vault.savedItems,vault.inventoryMovements);
  save({...vault,purchases:[received.purchase],savedItems:received.savedItems,inventoryMovements:received.movements});
  assert.equal(location(source),100000n);assert.equal(location(destination.id),0n);
  assert.equal(vault.savedItems[0].lastUnitCost,'6.5000');
  const transfer=createWarehouseTransfer(vault.savedItems[0],source,destination.id,'4',day,'Synthetic warehouse relocation');
  const baseline=JSON.stringify(vault);
  for(const invalid of [{...transfer,fromWarehouseId:'missing-source'},{...transfer,toWarehouseId:foreign.id}]){
    assert.throws(()=>mergeVaultIntent(vault,{...vault,inventoryMovements:[...vault.inventoryMovements,invalid]},vault),
      /warehouse|source|location/i);
    assert.equal(JSON.stringify(vault),baseline);
  }
  save({...vault,inventoryMovements:[...vault.inventoryMovements,transfer]});
  assert.equal(location(source),60000n);assert.equal(location(destination.id),40000n);
  assert.equal(total(),'10');
  let invoice=createBlankDocument('invoice','INV-QA-STOCK-CYCLE',vault.company);
  Object.assign(invoice,{id:'qa-stock-cycle-invoice',workspaceId:'default',branchId:'main',currency:'USD',
    issueDate:day,dueDate:day,status:'draft',customerSnapshot:{sourceCustomerId:'qa-stock-buyer',
      companyNameEn:'Synthetic stock buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',
      city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.items=[{...invoice.items[0],id:'qa-stock-invoice-line',descriptionEn:item.descriptionEn,
    quantity:'3',unit:'PCS',unitPrice:'10.00',unitCost:'6.5000',savedItemId:item.id,
    skuSnapshot:item.sku,stockTreatment:'tracked'}];
  save({...vault,documents:[invoice]});
  invoice={...vault.documents[0],status:'final'};
  const issued=postIssuedInvoiceStock({...vault,documents:[invoice]},invoice);
  save(issued.vault);
  assert.equal(location(source),30000n);assert.equal(location(destination.id),40000n);assert.equal(total(),'7');
  const issue=vault.inventoryMovements.find(row=>row.sourceId===invoice.id);
  assert.equal(issue.quantity,'-3.0000');assert.equal(issue.unitCost,'6.5000');assert.equal(issue.fromWarehouseId,source);
  assert.equal(calculateProfitability(invoice).totalCost,'19.50');
  const beforeReplay=JSON.stringify(vault);
  assert.equal(postIssuedInvoiceStock(vault,invoice).created,false);
  vault=reopen(mergeVaultIntent(vault,reopen(vault),reopen(vault)));
  assert.equal(JSON.stringify(vault),beforeReplay);
  const excessive={...invoice,id:'qa-stock-oversell',number:'INV-QA-OVERSELL',
    items:[{...invoice.items[0],id:'qa-stock-oversell-line',quantity:'4'}]};
  assert.throws(()=>postIssuedInvoiceStock({...vault,documents:[...vault.documents,excessive]},excessive),/Insufficient stock/i);
  assert.equal(JSON.stringify(vault),beforeReplay,'warehouse oversell cannot partially post');
  const proof=id=>{const bytes=Buffer.from('%PDF-1.4\nSynthetic count evidence\n');return{
    id,name:id+'.pdf',mimeType:'application/pdf',size:bytes.length,
    dataUrl:'data:application/pdf;base64,'+bytes.toString('base64'),createdAt:now};};
  const adjustment={...createManualInventoryMovement(vault.savedItems[0],'adjustment','2',day,'Synthetic count correction','6.5000','USD'),
    workspaceId:'default',branchId:'main',toWarehouseId:source,reasonCategory:'count',
    createdBy:'qa-owner',evidence:proof('qa-count-proof')};
  save({...vault,inventoryMovements:[...vault.inventoryMovements,adjustment]});
  assert.equal(location(source),50000n);assert.equal(total(),'9');
  const originalAdjustment=JSON.stringify(vault.inventoryMovements.at(-1));
  const reversal={...reverseManualInventoryMovement(vault.inventoryMovements.at(-1),day),
    fromWarehouseId:source,toWarehouseId:undefined,reasonCategory:'correction',
    createdBy:'qa-owner',evidence:proof('qa-count-reversal-proof')};
  save({...vault,inventoryMovements:[...vault.inventoryMovements,reversal]});
  assert.equal(vault.inventoryMovements.at(-1).sourceId,adjustment.id);
  assert.equal(JSON.stringify(vault.inventoryMovements.at(-2)),originalAdjustment);
  assert.equal(location(source),30000n);assert.equal(location(destination.id),40000n);assert.equal(total(),'7');
  assert.equal(vault.savedItems[0].lastUnitCost,'6.5000');
  assert.equal(vault.inventoryMovements.length,5);
  const snapshot=JSON.stringify(vault);
  vault=reopen(mergeVaultIntent(vault,reopen(vault),reopen(vault)));
  assert.equal(JSON.stringify(vault),snapshot);
});
