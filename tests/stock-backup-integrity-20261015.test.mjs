import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {postSalesReturn} from '../dist/src/lib/sales-returns.js';
import {postVoidedInvoiceWithPhysicalReceipt} from '../dist/src/lib/invoice-void-stock.js';
import {readPlainBackup,assertRestorableBackupVault,assertPostedStockRestoreContinuity} from '../dist/src/lib/backup.js';

const date=new Date().toISOString().slice(0,10);
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const evidence=(id)=>({id,name:'goods-received.pdf',mimeType:'application/pdf',
  size:pdf.length,dataUrl:'data:application/pdf;base64,'+pdf.toString('base64'),createdAt:new Date().toISOString()});
function setup(){
 const vault=emptyVault(),now=new Date().toISOString();
 const item={id:'backup-stock-item',sku:'BK-STOCK',descriptionEn:'Recovered goods',descriptionAr:'بضاعة مرتجعة',
   hsCode:'',origin:'',packing:'',unit:'Carton',createdAt:now,updatedAt:now,
   lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'4.50',lastCostCurrency:'USD',
   usageCount:0,lastUsedAt:now,workspaceId:vault.appSettings.activeWorkspaceId,
   branchId:vault.appSettings.activeBranchId};
 vault.savedItems=[item];
 vault.inventoryMovements=[createManualInventoryMovement(item,'opening','10',date,'QA opening stock')];
 const invoice=createBlankDocument('invoice','INV-BACKUP-SAFE',vault.company);
 invoice.issueDate=date;invoice.dueDate=date;invoice.status='final';
 invoice.customerSnapshot={sourceCustomerId:'test-buyer',companyNameEn:'Test Buyer',companyNameAr:'',
   contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
   vatTaxNumber:'',commercialRegistration:''};
 invoice.items=[{...invoice.items[0],id:'backup-invoice-line',quantity:'4',unit:'Carton',
   unitPrice:'10.00',descriptionEn:item.descriptionEn,savedItemId:item.id,
   stockTreatment:'tracked',skuSnapshot:item.sku}];
 vault.documents=[invoice];
 return {issued:postIssuedInvoiceStock(vault,invoice).vault,invoice,item};
}
const quantity=(v)=>inventoryBalances(v.savedItems,v.inventoryMovements)
 .find(x=>x.item.id==='backup-stock-item')?.quantity;
const serialize=(vault)=>new File([JSON.stringify({
 format:'LOUREX_WORKSPACE_EXPORT_V2',version:2,createdAt:new Date().toISOString(),payload:vault
})],'LOUREX-TEST.lourex-json',{type:'application/json'});
const clone=x=>structuredClone(x);

test('portable local backup and cloud hydration preserve the issued invoice and verified partial receipt exactly',async()=>{
 const {issued,invoice}=setup();
 const credit={...createCreditNoteDraft(invoice,'CN-BACKUP-SAFE','40.00'),status:'final',issueDate:date};
 credit.items=[{...credit.items[0],id:'backup-credit-line',quantity:'2',unitPrice:'10.00'}];
 const withCredit={...issued,documents:[...issued.documents,credit]};
 const withReturn=postSalesReturn(withCredit,{
  creditNoteId:credit.id,creditLineId:credit.items[0].id,invoiceLineId:invoice.items[0].id,
  warehouseId:issued.warehouses[0].id,quantity:'1.5',date,
  reason:'Verified return with actual PDF source',evidence:evidence('return-receipt-001'),operatorId:'owner'
 }).vault;
 assert.equal(quantity(withReturn),'7.5');
 assert.doesNotThrow(()=>assertRestorableBackupVault(withReturn));
 const restored=await readPlainBackup(serialize(withReturn));
 assert.deepEqual(restored,withReturn);
 assert.equal(restored.inventoryMovements.filter(row=>row.type==='issue').length,1);
 assert.equal(restored.inventoryMovements.filter(row=>row.salesReturn).length,1);
 assert.equal(quantity(restored),'7.5');
});

test('edited or orphaned physical return cannot be imported or installed from cloud',async()=>{
 const {issued,invoice}=setup();
 const credit={...createCreditNoteDraft(invoice,'CN-BACKUP-TAMPER','40.00'),status:'final',issueDate:date};
 credit.items=[{...credit.items[0],id:'backup-credit-line-tamper',quantity:'2',unitPrice:'10.00'}];
 const initial={...issued,documents:[...issued.documents,credit]};
 const valid=postSalesReturn(initial,{
   creditNoteId:credit.id,creditLineId:credit.items[0].id,invoiceLineId:invoice.items[0].id,
   warehouseId:initial.warehouses[0].id,quantity:'1.5',date,
   reason:'Actual sealed cartons returned',evidence:evidence('qa-proof-002'),operatorId:'owner'
 }).vault;
 const corruptions=[
  x=>{x.inventoryMovements.find(m=>m.salesReturn).quantity='7.5000';},
  x=>{x.inventoryMovements.find(m=>m.salesReturn).salesReturn.invoiceLineId='forged-line';},
  x=>{x.inventoryMovements.find(m=>m.salesReturn).evidence.dataUrl='data:application/pdf;base64,aGVsbG8=';},
  x=>{x.documents=x.documents.filter(d=>d.id!==credit.id);},
  x=>{x.inventoryMovements=x.inventoryMovements.filter(m=>m.type!=='issue');}
 ];
 for(const tamper of corruptions){
  const changed=clone(valid);tamper(changed);
  assert.throws(()=>assertRestorableBackupVault(changed),/Backup posted-invoice stock ledger/);
  await assert.rejects(readPlainBackup(serialize(changed)),/Backup posted-invoice stock ledger/);
 }
 assert.equal(quantity(valid),'7.5','rejected files cannot change existing in-memory financial state');
});

test('voided invoice must retain its complete physical return and proof in restored backups',async()=>{
 const {issued,invoice}=setup();
 const voided=postVoidedInvoiceWithPhysicalReceipt(issued,invoice,{
   reason:'All four cartons physically back and confirmed by warehouse',
   date,evidence:evidence('qa-proof-void'),operatorId:'owner'
 }).vault;
 assert.equal(quantity(voided),'10');
 const restored=await readPlainBackup(serialize(voided));
 assert.equal(restored.documents[0].lifecycleStatus,'voided');
 assert.equal(restored.inventoryMovements.filter(m=>m.invoiceVoidStock).length,1);
 assert.equal(restored.documents[0].attachments.at(-1).id,'qa-proof-void');
 const proofErased=clone(voided);
 proofErased.documents[0].attachments=[];
 assert.throws(()=>assertRestorableBackupVault(proofErased),/Backup posted-invoice stock ledger/);
 const returnErased=clone(voided);
 returnErased.inventoryMovements=returnErased.inventoryMovements.filter(m=>!m.invoiceVoidStock);
 assert.throws(()=>assertRestorableBackupVault(returnErased),/Backup posted-invoice stock ledger/);
});


test('manual restore cannot silently roll back an already posted invoice stock debit',async()=>{
 const {issued,invoice}=setup();
 const old=emptyVault();
 assert.doesNotThrow(()=>assertRestorableBackupVault(old),'a formerly valid backup passes shape validation');
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,old),/older local copy would erase or modify/);
 const restored=await readPlainBackup(serialize(issued));
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(issued,restored),'identical posted stock audit is recoverable');
 const cleared=clone(issued);
 cleared.inventoryMovements=cleared.inventoryMovements.filter(row=>!row.id.startsWith('sales-invoice-stock:'));
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,cleared),/posted invoice stock/);
 const rewrittenInvoice=clone(issued);
 rewrittenInvoice.documents[0].items[0].quantity='7';
 assert.throws(()=>assertPostedStockRestoreContinuity(issued,rewrittenInvoice),/posted invoice stock/);
 assert.equal(quantity(issued),'6','blocked restore preserves existing invoice stock');
});

test('restore continuity protects a voided invoice, credit note and return proof without blocking unrelated data',()=>{
 const {issued,invoice}=setup();
 const returned=postVoidedInvoiceWithPhysicalReceipt(issued,invoice,{
  reason:'All cartons back in warehouse verified by PDF',date,evidence:evidence('restore-evidence-1'),operatorId:'owner'
 }).vault;
 const compatible=clone(returned);
 compatible.customers=[...compatible.customers,{id:'unrelated-new-customer'}];
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(returned,compatible));
 const older=clone(returned);
 older.documents[0].attachments=[];
 assert.throws(()=>assertPostedStockRestoreContinuity(returned,older),/posted invoice stock/);
 const erased=clone(returned);
 erased.inventoryMovements=erased.inventoryMovements.filter(m=>!m.invoiceVoidStock);
 assert.throws(()=>assertPostedStockRestoreContinuity(returned,erased),/posted invoice stock/);
});
