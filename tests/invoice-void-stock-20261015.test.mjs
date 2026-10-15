import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {postVoidedInvoiceWithPhysicalReceipt,assertInvoiceVoidStockIntegrity,assertInvoiceVoidStockContinuity} from '../dist/src/lib/invoice-void-stock.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
const today=new Date().toISOString().slice(0,10);
const pdfBytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const evidence=(id='receipt-void-1')=>({id,name:'physical-goods-received.pdf',mimeType:'application/pdf',
 size:pdfBytes.length,dataUrl:'data:application/pdf;base64,'+pdfBytes.toString('base64'),createdAt:new Date().toISOString()});
function fixture(){
 const vault=emptyVault(),now=new Date().toISOString();
 const item={id:'void-item',sku:'SKU-VOID',descriptionEn:'Shipped carton',descriptionAr:'كرتون',hsCode:'',
  origin:'',packing:'',unit:'Carton',lastUnitPrice:'15.00',lastCurrency:'USD',
  lastUnitCost:'6.20',lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,createdAt:now,updatedAt:now,
  workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId};
 vault.savedItems=[item];
 vault.inventoryMovements=[createManualInventoryMovement(item,'opening','10',today,'Previously documented stock')];
 const invoice=createBlankDocument('invoice','INV-VOID-1',vault.company);
 invoice.status='final';invoice.issueDate=today;invoice.dueDate=today;
 invoice.customerSnapshot={sourceCustomerId:'void-buyer',companyNameEn:'Test Buyer',companyNameAr:'',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items=[{...invoice.items[0],id:'void-invoice-line',quantity:'4',unit:'Carton',unitPrice:'15.00',
  descriptionEn:item.descriptionEn,savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku}];
 vault.documents=[invoice];
 const issued=postIssuedInvoiceStock(vault,invoice).vault;
 return {vault:issued,invoice,item};
}
const balance=(v)=>inventoryBalances(v.savedItems,v.inventoryMovements).find(x=>x.item.id==='void-item').quantity;
const request=()=>({reason:'Four cartons received back undamaged and checked by warehouse',evidence:evidence(),operatorId:'owner',date:today});
test('unpaid issued invoice void recredits warehouse exactly once without erasing debit or source document',()=>{
 const {vault,invoice}=fixture();
 assert.equal(balance(vault),'6');
 const {vault:cancelled,document,movements}=postVoidedInvoiceWithPhysicalReceipt(vault,invoice,request());
 assert.equal(document.id,invoice.id);
 assert.equal(document.lifecycleStatus,'voided');
 assert.equal(balance(cancelled),'10');
 assert.equal(movements.length,1);
 assert.equal(movements[0].type,'adjustment');
 assert.equal(movements[0].quantity,'4.0000');
 assert.equal(movements[0].unitCost,'6.20');
 assert.equal(movements[0].sourceId,invoice.id);
 assert.equal(movements[0].evidence,undefined,'store one actual proof on source document only');
 assert.equal(document.attachments.at(-1).id,'receipt-void-1');
 assert.equal(cancelled.inventoryMovements.filter(m=>m.type==='issue').length,1);
 assert.doesNotThrow(()=>assertInvoiceVoidStockIntegrity(cancelled.documents,cancelled.inventoryMovements));
 const committed=mergeVaultIntent(vault,cancelled,vault);
 assert.equal(balance(committed),'10');
 assert.equal(committed.documents.find(d=>d.id===invoice.id).voidReason,request().reason);
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(committed,invoice,request()),/active final sales invoice/);
});
test('invoice with payments, linked credits or no documented physical receipt cannot be stock-voided',()=>{
 const {vault,invoice}=fixture();
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(vault,invoice,{...request(),evidence:undefined}),/physical receipt proof/i);
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(vault,invoice,{...request(),reason:'no'}),/written inventory movement reason|reason/i);
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(vault,invoice,{...request(),operatorId:''}),/authorized operator/i);
 const paid={...vault,payments:[{invoiceId:invoice.id,id:'pay1',amount:'5.00'}]};
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(paid,invoice,request()),/recorded payments/i);
 const credit={...invoice,id:'credit-draft',number:'CN-1',role:'credit-note',creditForId:invoice.id,status:'draft'};
 assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt({...vault,documents:[invoice,credit]},invoice,request()),/Linked credit notes/);
 assert.equal(balance(vault),'6','rejected void must leave original stock untouched');
});
test('void source and quantity cannot be erased, forged, or replayed across offline merges',()=>{
 const {vault,invoice}=fixture(),cancelled=postVoidedInvoiceWithPhysicalReceipt(vault,invoice,request()).vault;
 const received=cancelled.inventoryMovements.find(m=>m.invoiceVoidStock);
 for(const tamper of [{quantity:'3'},{unitCost:'9.00'},{toWarehouseId:'wrong'},
  {invoiceVoidStock:{...received.invoiceVoidStock,issueMovementId:'other'}},
  {sourceId:'some-other-invoice'}]){
  const forged={...cancelled,inventoryMovements:cancelled.inventoryMovements.map(m=>m.invoiceVoidStock?{...m,...tamper}:m)};
  assert.throws(()=>assertInvoiceVoidStockIntegrity(forged.documents,forged.inventoryMovements),/Cancellation receipt|Invalid invoice cancellation/i);
  assert.throws(()=>mergeVaultIntent(cancelled,forged,cancelled),/immutable/i);
 }
 const erased={...cancelled,inventoryMovements:cancelled.inventoryMovements.filter(m=>!m.invoiceVoidStock)};
 assert.throws(()=>mergeVaultIntent(cancelled,erased,cancelled),/immutable/i);
 const sourceLost={...cancelled,documents:cancelled.documents.map(d=>({...d,attachments:[]}))};
 assert.throws(()=>assertInvoiceVoidStockIntegrity(sourceLost.documents,sourceLost.inventoryMovements),/proof/);
 const missing={...vault,documents:[{...invoice,lifecycleStatus:'voided'}]};
 assert.throws(()=>mergeVaultIntent(vault,missing,vault),/documented warehouse receipt/i);
});
test('two devices cannot issue mutually inconsistent compensation entries for the same invoice',()=>{
 const {vault,invoice}=fixture();
 const left=postVoidedInvoiceWithPhysicalReceipt(vault,invoice,{...request(),evidence:evidence('first-photo')}).vault;
 const right=postVoidedInvoiceWithPhysicalReceipt(vault,invoice,{...request(),evidence:evidence('second-photo')}).vault;
 assert.throws(()=>assertInvoiceVoidStockContinuity(vault.inventoryMovements,left.inventoryMovements,right.inventoryMovements),/Conflicting invoice cancellation/);
 assert.throws(()=>mergeVaultIntent(vault,left,right),/Conflicting invoice cancellation/);
});
