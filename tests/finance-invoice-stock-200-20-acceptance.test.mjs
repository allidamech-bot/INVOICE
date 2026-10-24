import test from 'node:test';
import assert from 'node:assert/strict';

import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {
  createSupplier, createPurchase, createPurchaseItem, postPurchase, inventoryBalances
} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock, INVOICE_STOCK_PREFIX} from '../dist/src/lib/invoice-stock.js';
import {defaultWarehouseId, warehouseItemQuantity} from '../dist/src/lib/warehouses.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const reopen=value=>JSON.parse(JSON.stringify(value));
const stockOf=(vault,itemId)=>
  inventoryBalances(vault.savedItems,vault.inventoryMovements)
    .find(row=>row.item.id===itemId)?.quantity;

function isolatedCartonFixture(){
  const now=new Date().toISOString(),today=now.slice(0,10),base=emptyVault();
  const item={
    id:'qa-cartons-item',sku:'QA-CARTON-200-20',descriptionEn:'Synthetic QA Cartons',
    descriptionAr:'كراتين اختبار',unit:'Carton',hsCode:'',origin:'',packing:'',
    lastUnitPrice:'5.00',lastCurrency:'USD',lastUnitCost:'2.00',
    lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,createdAt:now,
    updatedAt:now,workspaceId:base.appSettings.activeWorkspaceId,
    branchId:base.appSettings.activeBranchId,inventoryTracking:'tracked'
  };
  const supplier=createSupplier();
  supplier.nameEn='Synthetic QA Supplier';
  let vault={...base,savedItems:[item],suppliers:[supplier]};
  const persist=intent=>{vault=reopen(mergeVaultIntent(vault,intent,vault));};
  // A posted synthetic purchase provides 200 real ledger units, without
  // bypassing the separately required documentary proof for manual movements.
  const draftPurchase=createPurchase([], [supplier], 'USD');
  draftPurchase.items=[{
    ...createPurchaseItem(item),quantity:'200',unitCost:'2.00'
  }];
  persist({...vault,purchases:[draftPurchase]});
  const receipt=postPurchase(vault.purchases[0],vault.savedItems,vault.inventoryMovements);
  persist({...vault,purchases:[receipt.purchase],savedItems:receipt.savedItems,
    inventoryMovements:receipt.movements});
  const invoice=createBlankDocument('invoice','INV-QA-CARTON-200-20',vault.company);
  invoice.issueDate=today;
  invoice.dueDate=today;
  invoice.status='draft';
  invoice.customerSnapshot={
    sourceCustomerId:'qa-carton-buyer',companyNameEn:'Synthetic QA Buyer',
    companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',
    country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''
  };
  invoice.items=[{
    ...invoice.items[0],id:'qa-carton-invoice-line',descriptionEn:item.descriptionEn,
    descriptionAr:item.descriptionAr,unit:'Carton',quantity:'20',
    unitPrice:'5.00',unitCost:'2.00',savedItemId:item.id,
    skuSnapshot:item.sku,stockTreatment:'tracked'
  }];
  return {vault,item,invoice,persist,read:()=>vault};
}

test('200 cartons -> draft 200 -> final invoice of 20 -> 180, one immutable linked issue through saved vault and reload',()=>{
  const {item,invoice,persist,read}=isolatedCartonFixture();
  const original=read();
  const warehouse=defaultWarehouseId(original.appSettings.activeBranchId);
  assert.equal(stockOf(original,item.id),'200');
  assert.equal(warehouseItemQuantity(item.id,warehouse,original.inventoryMovements,warehouse),2000000n);

  // The draft must not post stock even when the user saves it.
  persist({...read(),documents:[invoice]});
  assert.equal(postIssuedInvoiceStock(read(),invoice).created,false);
  assert.equal(stockOf(read(),item.id),'200');
  assert.equal(read().inventoryMovements.filter(row=>row.sourceId===invoice.id).length,0);

  // Actual save path's one logical transaction contains both the final
  // document and the automatically generated, catalog-linked stock debit.
  const issued={...read().documents[0],status:'final'};
  const intent=postIssuedInvoiceStock({...read(),documents:[issued]},issued);
  assert.equal(intent.created,true);
  persist(intent.vault);

  let saved=read();
  assert.equal(saved.documents.find(doc=>doc.id===issued.id)?.status,'final');
  assert.equal(stockOf(saved,item.id),'180');
  assert.equal(warehouseItemQuantity(item.id,warehouse,saved.inventoryMovements,warehouse),1800000n);
  const generated=saved.inventoryMovements.filter(m=>m.sourceId===issued.id);
  assert.equal(generated.length,1);
  assert.equal(generated[0].id,INVOICE_STOCK_PREFIX+issued.id+':'+issued.items[0].id);
  assert.equal(generated[0].sourceNumber,issued.number);
  assert.equal(generated[0].type,'issue');
  assert.equal(generated[0].quantity,'-20.0000');
  assert.equal(generated[0].itemId,item.id);
  assert.equal(generated[0].sku,item.sku);
  assert.equal(generated[0].fromWarehouseId,warehouse);

  // Repeating the post and reopening/merging persisted data must not
  // produce another -20 debit.
  const again=postIssuedInvoiceStock(saved,issued);
  assert.equal(again.created,false);
  assert.equal(again.vault,saved);
  saved=reopen(mergeVaultIntent(saved,reopen(saved),reopen(saved)));
  assert.equal(stockOf(saved,item.id),'180');
  assert.equal(saved.inventoryMovements.filter(m=>m.sourceId===issued.id).length,1);

  // Oversell must fail before any ledger mutation.
  const oversized={...issued,id:'qa-cartons-oversell',number:'INV-QA-OVERSELL',
    items:[{...issued.items[0],id:'qa-carton-oversell-line',quantity:'181'}]};
  const snapshot=JSON.stringify(saved);
  assert.throws(()=>postIssuedInvoiceStock(
    {...saved,documents:[...saved.documents,oversized]},oversized
  ),/Insufficient stock for invoice issue/);
  assert.equal(JSON.stringify(saved),snapshot);
});
