import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {postSalesReturn,correctSalesReturn,assertSalesReturnIntegrity,assertSalesReturnLedgerContinuity} from '../dist/src/lib/sales-returns.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';

const date=new Date().toISOString().slice(0,10);
const proofBytes=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n');
const evidence=()=>({id:'physical-receipt-'+Math.random(),name:'received-goods.pdf',mimeType:'application/pdf',
 size:proofBytes.length,dataUrl:'data:application/pdf;base64,'+proofBytes.toString('base64'),createdAt:new Date().toISOString()});
function setup(){
 const vault=emptyVault(),now=new Date().toISOString();
 const item={id:'returned-product',sku:'RET-1',descriptionEn:'Product returned',descriptionAr:'صنف مرتجع',
  createdAt:now,updatedAt:now,hsCode:'',origin:'',packing:'',unit:'Carton',
  lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'4.50',lastCostCurrency:'USD',usageCount:0,lastUsedAt:now,
  workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId};
 vault.savedItems=[item];
 vault.inventoryMovements=[createManualInventoryMovement(item,'opening','10',date,'Legacy balance')];
 const invoice=createBlankDocument('invoice','INV-RETURN-1',vault.company);
 invoice.status='final';invoice.issueDate=date;
 invoice.customerSnapshot={sourceCustomerId:'buyer-return',companyNameEn:'Return Buyer',companyNameAr:'',contactPerson:'',
 addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};
 invoice.items=[{...invoice.items[0],id:'sold-line-1',savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku,
  descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,unit:'Carton',quantity:'4',unitPrice:'10.00'}];
 vault.documents=[invoice];
 const posted=postIssuedInvoiceStock(vault,invoice).vault;
 const credit={...createCreditNoteDraft(invoice,'CN-RETURN-1','40.00'),status:'final',issueDate:date};
 credit.items=[{...credit.items[0],id:'credited-line-1',quantity:'2',unitPrice:'10.00'}];
 const ready={...posted,documents:[invoice,credit]};
 const input={creditNoteId:credit.id,invoiceLineId:invoice.items[0].id,creditLineId:credit.items[0].id,
  warehouseId:ready.warehouses[0].id,quantity:'1.5',date,reason:'Actual unopened cartons returned and counted',
  evidence:evidence(),operatorId:'owner'};
 return {vault:ready,invoice,credit,item,input};
}
const balance=v=>inventoryBalances(v.savedItems,v.inventoryMovements).find(x=>x.item.id==='returned-product').quantity;
test('a credit note by itself never increases inventory; physical receipt does once',()=>{
 const f=setup();
 assert.equal(balance(f.vault),'6');
 const result=postSalesReturn(f.vault,f.input);
 assert.equal(result.created,true);
 assert.equal(balance(result.vault),'7.5');
 assert.equal(result.movement.unitCost,'4.50','restore original issued COGS, never sale price');
 assert.equal(result.movement.sourceId,f.credit.id);
 assert.ok(result.movement.salesReturn);
 assert.throws(()=>postSalesReturn(result.vault,f.input),/already been received/i);
 const later=postSalesReturn(result.vault,{...f.input,quantity:'0.5',evidence:evidence()}).vault;
 assert.equal(balance(later),'8','allow a later partial physical receipt with its own evidence');
 assert.equal(later.inventoryMovements.filter(x=>x.salesReturn).length,2);
 assert.throws(()=>postSalesReturn(later,{...f.input,quantity:'0.1',evidence:evidence()}),/exceed/i);
 assert.doesNotThrow(()=>assertSalesReturnIntegrity(result.vault));
});
test('receipt requires valid PDF/image evidence, reason, active credit and original issued stock',()=>{
 const f=setup();
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,evidence:undefined}),/evidence/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,reason:'no'}),/reason/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,quantity:'3'}),/exceed/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,quantity:'-1'}),/positive/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,quantity:'1.00005'}),/four decimal places/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,quantity:'0.00001'}),/four decimal places/i);
 assert.throws(()=>postSalesReturn(f.vault,{...f.input,warehouseId:'other-branch'}),/warehouse/i);
 const badCredit={...f.credit,status:'draft'};
 assert.throws(()=>postSalesReturn({...f.vault,documents:[f.invoice,badCredit]},f.input),/final credit/i);
 const badCreditLine={...f.credit,items:[{...f.credit.items[0],skuSnapshot:'WRONG'}]};
 assert.throws(()=>postSalesReturn({...f.vault,documents:[f.invoice,badCreditLine]},f.input),/catalog-linked/i);
});
test('new physical return rejects malformed mixed grouping before writing stock',()=>{
 const fixture=setup();
 const original=JSON.stringify(fixture.vault);
 for(const quantity of ['0,1.00','٠,١.٠٠','0.1,00']){
   const input={...fixture.input,quantity,evidence:evidence()};
   assert.throws(()=>postSalesReturn(fixture.vault,input),/positive and use no more than four decimal places|invalid quantity/i,
     'malformed grouping must not silently become a valid positive return quantity');
   assert.equal(JSON.stringify(fixture.vault),original,'failed return must never mutate saved history');
 }
 assert.equal(balance(fixture.vault),'6');
 const accepted=postSalesReturn(fixture.vault,{...fixture.input,quantity:'1,5',evidence:evidence()});
 assert.equal(accepted.movement.quantity,'1.5000','unambiguous decimal comma stays supported');
 assert.equal(balance(accepted.vault),'7.5');
});

test('a physical return is immutable and cannot survive credit void or source alteration',()=>{
 const f=setup(),returned=postSalesReturn(f.vault,f.input).vault;
 const altered={...returned,inventoryMovements:returned.inventoryMovements.map(x=>x.salesReturn?{...x,quantity:'1'}:x)};
 assert.throws(()=>assertSalesReturnLedgerContinuity(returned.inventoryMovements,altered.inventoryMovements,returned.inventoryMovements),/immutable/);
 assert.throws(()=>mergeVaultIntent(returned,altered,returned),/immutable/);
 const voided={...returned,documents:[f.invoice,{...f.credit,lifecycleStatus:'voided'}]};
 assert.throws(()=>assertSalesReturnIntegrity(voided),/active, linked credit note/i);
 const fractional={...returned,inventoryMovements:returned.inventoryMovements.map(x=>x.salesReturn?{...x,quantity:'1.50009'}:x)};
 assert.throws(()=>assertSalesReturnIntegrity(fractional),/physical sales return stock record/i);
 const forged={...returned,inventoryMovements:returned.inventoryMovements.map(x=>x.salesReturn?{...x,unitCost:'9.00'}:x)};
 assert.throws(()=>assertSalesReturnIntegrity(forged),/cost/);
});
test('return receipt must be accepted by the vault merge rather than a local-only UI mutation',()=>{
 const f=setup(),returned=postSalesReturn(f.vault,f.input).vault;
 const saved=mergeVaultIntent(f.vault,returned,f.vault);
 assert.equal(balance(saved),'7.5');
 assert.equal(saved.inventoryMovements.filter(x=>x.salesReturn).length,1);
 const modified={...saved,inventoryMovements:saved.inventoryMovements.map(m=>m.salesReturn?{...m,salesReturn:{...m.salesReturn,creditLineId:'tampered'}}:m)};
 assert.throws(()=>mergeVaultIntent(saved,modified,saved),/immutable/);
});
test('concurrent goods receipts cannot return more than the original invoice quantity',()=>{
 const f=setup();
 const first=postSalesReturn(f.vault,{...f.input,quantity:'2'}).vault;
 const credit2={...f.credit,id:'credit-second',number:'CN-RETURN-2',items:[{...f.credit.items[0],id:'credited-line-2',
  quantity:'3',unitPrice:'1.00'}]};
 const base={...f.vault,documents:[...f.vault.documents,credit2]};
 const intended={...first,documents:base.documents};
 const second=postSalesReturn(base,{...f.input,creditNoteId:credit2.id,creditLineId:'credited-line-2',quantity:'3'}).vault;
 assert.throws(()=>mergeVaultIntent(base,intended,second),/exceed the original invoiced quantity/);
});


const distinctProof=()=>{const bytes=Buffer.from('%PDF-1.4\\n2 0 obj\\nendobj\\n');return{
 id:'new-correction-'+Math.random(),name:'stock-correction.pdf',mimeType:'application/pdf',
 size:bytes.length,dataUrl:'data:application/pdf;base64,'+bytes.toString('base64'),createdAt:new Date().toISOString()
};};
test('a wrongly received customer return can only be offset by a NEW evidenced correction',()=>{
 const f=setup(),posted=postSalesReturn(f.vault,f.input).vault;
 const receipt=posted.inventoryMovements.find(x=>x.salesReturn);
 const correctionInput={receiptMovementId:receipt.id,date,reason:'Physically miscounted goods; correction authorized',
   evidence:distinctProof(),operatorId:'owner'};
 assert.throws(()=>correctSalesReturn(posted,{...correctionInput,evidence:f.input.evidence}),/NEW proof/);
 const corrected=correctSalesReturn(posted,correctionInput);
 assert.equal(corrected.movement.quantity,'-1.5000');
 assert.equal(corrected.movement.fromWarehouseId,receipt.toWarehouseId);
 assert.equal(corrected.movement.unitCost,receipt.unitCost);
 assert.equal(balance(corrected.vault),'6');
 assert.equal(corrected.vault.inventoryMovements.filter(x=>x.salesReturn).length,1,'never erase original receipt');
 assert.equal(corrected.vault.inventoryMovements.filter(x=>x.salesReturnCorrection).length,1);
 assert.throws(()=>correctSalesReturn(corrected.vault,{...correctionInput,evidence:distinctProof()}),/already been corrected/);
 assert.doesNotThrow(()=>assertSalesReturnIntegrity(corrected.vault));
 const merged=mergeVaultIntent(posted,corrected.vault,posted);
 assert.equal(balance(merged),'6');
});
test('documented return correction is immutable and cannot exceed its source receipt',()=>{
 const f=setup(),posted=postSalesReturn(f.vault,f.input).vault;
 const receipt=posted.inventoryMovements.find(x=>x.salesReturn);
 const corrected=correctSalesReturn(posted,{receiptMovementId:receipt.id,date,
   reason:'Erroneous goods receipt corrected with supervisor approval',evidence:distinctProof(),operatorId:'owner'}).vault;
 for(const bad of [
  {quantity:'-1'}, {fromWarehouseId:'unknown'}, {unitCost:'99.00'},
  {salesReturnCorrection:{receiptMovementId:'unrelated'}}, {evidence:receipt.evidence}
 ]){
  const tampered={...corrected,inventoryMovements:corrected.inventoryMovements.map(m=>m.salesReturnCorrection?{...m,...bad}:m)};
  assert.throws(()=>assertSalesReturnIntegrity(tampered),/return reversal|independent physical correction/);
  assert.throws(()=>mergeVaultIntent(corrected,tampered,corrected),/immutable/);
 }
});


test('return correction cannot overdraw a warehouse after another device issues stock',()=>{
 const f=setup(),received=postSalesReturn(f.vault,f.input).vault;
 const receipt=received.inventoryMovements.find(m=>m.salesReturn);
 const corrected=correctSalesReturn(received,{receiptMovementId:receipt.id,date,
  reason:'Receiving count was incorrect; reverse full receipt',
  evidence:distinctProof(),operatorId:'owner'}).vault;
 const concurrentIssue=createManualInventoryMovement(f.item,'issue','7',date,'Sample transfer authorized');
 const issued={...concurrentIssue,createdBy:'owner',reasonCategory:'samples',evidence:distinctProof(),
  fromWarehouseId:f.input.warehouseId,toWarehouseId:undefined};
 const latest={...received,inventoryMovements:[...received.inventoryMovements,issued]};
 assert.throws(()=>mergeVaultIntent(received,corrected,latest),
  /Insufficient stock|below zero|warehouse/i);
 assert.equal(balance(received),'7.5','failed conflicting correction must not alter the base stock');
});
