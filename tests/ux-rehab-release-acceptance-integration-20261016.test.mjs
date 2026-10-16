import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument,convertToInvoice,validateDocument} from '../dist/src/lib/documents.js';
import {planProductImportBatch,importableProducts} from '../dist/src/lib/product-import.js';
import {reviewProductAiRows} from '../dist/src/lib/product-ai-review.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock,assertPostedInvoiceStockDocumentIntegrity,assertInvoiceStockLedgerContinuity} from '../dist/src/lib/invoice-stock.js';
import {calculateTotals} from '../dist/src/lib/money.js';
import {receivablesByCurrency,customerStatement} from '../dist/src/lib/receivables.js';
import {assertPostedStockRestoreContinuity} from '../dist/src/lib/backup.js';

const TODAY=new Date().toISOString().slice(0,10);
const makeMatrix=(rows)=>[['SKU','Description EN','Unit','Unit Price','Currency', 'Unit Cost'],...rows];
const customer={sourceCustomerId:'ux-acceptance-buyer',companyNameEn:'Synthetic Buyer',companyNameAr:'عميل تجريبي',
  contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',
  vatTaxNumber:'',commercialRegistration:''};
const amount=(vault,id)=>inventoryBalances(vault.savedItems,vault.inventoryMovements).find(row=>row.item.id===id)?.quantity;

function proposal(){
 const vault=emptyVault();
 const data=makeMatrix([['D-VALVE-01','Synthetic valve','PCS','125.00','USD','48.00']]);
 const duplicates=makeMatrix([['D-VALVE-01','Synthetic valve','PCS','126.00','USD','48.00']]);
 const plan=planProductImportBatch([{name:'File 1 / Products',matrix:data},{name:'File 2 / Repeat',matrix:duplicates}],[], 'USD',true);
 return{vault,plan};
}

test('Batch D import remains a read-only preview; repeated SKU across two spreadsheets never creates a second saved product',()=>{
 const {vault,plan}=proposal();
 assert.equal(vault.savedItems.length,0,'reviewing import cannot write to master catalog');
 assert.deepEqual(plan.counts,{create:1,update:0,skip:0,error:1});
 assert.equal(plan.rows.find(r=>r.action==='error')?.sourceName,'File 2 / Repeat');
 assert.match(plan.rows.find(r=>r.action==='error')?.reason||'',/Duplicate product across worksheets/);
 assert.equal(importableProducts(plan).length,1);
 // Canceling the preview means no mutation to vault; deliberately never invoke a save callback.
 assert.equal(vault.savedItems.length,0);
});

test('Batch D AI source review classifies matching + duplicated extraction as blocked without master-data changes',()=>{
 const {vault,plan}=proposal();
 const existing=importableProducts(plan)[0];
 const row=(sku,name)=>({sku,descriptionEn:name,descriptionAr:'',brand:'',hsCode:'',origin:'',packing:'',
   cartonQuantity:'',unit:'PCS',salePrice:'',saleCurrency:'',unitCost:'',costCurrency:'',category:'',notes:''});
 const reviews=reviewProductAiRows([existing],[
  row('D-VALVE-01','Synthetic valve'),row('NEW-B-1','Second product'),row('new-b-1','Repeated extracted product')
 ],'USD');
 assert.deepEqual(reviews.map(r=>r.classification),['existing-match','duplicate-candidate','duplicate-candidate']);
 assert.deepEqual(reviews.map(r=>r.defaultSelected),[false,false,false]);
 assert.equal(vault.savedItems.length,0,'AI read-only classification never writes original workspace');
});

test('Batch D integrated catalog → quote → final invoice → exact stock issue → receivable → restore protection',()=>{
 const {vault:initial,plan}=proposal();
 const item=importableProducts(plan)[0];
 const vault={...initial,savedItems:[item],inventoryMovements:[createManualInventoryMovement(item,'opening','10',TODAY,'Synthetic starting stock','48.00','USD')]};
 assert.equal(amount(vault,item.id),'10');
 const quote=createBlankDocument('proforma','QUO-TEST-D-1',vault.company);
 quote.status='final';quote.issueDate=TODAY;quote.dueDate=TODAY;
 quote.customerSnapshot={...customer};
 quote.items=[{...quote.items[0],descriptionEn:item.descriptionEn,descriptionAr:'',savedItemId:item.id,
   skuSnapshot:item.sku,stockTreatment:'tracked',unit:'PCS',quantity:'2',unitPrice:'125.00'}];
 quote.adjustments={...quote.adjustments,discountEnabled:false,taxEnabled:true,taxPercent:'10',shippingEnabled:false,otherChargesEnabled:false};
 assert.equal(validateDocument(quote).items,undefined,'final quotation has valid commercial items');
 assert.equal(calculateTotals(quote.items,quote.adjustments).grandTotal,'275.00');
 const invoice=convertToInvoice(quote,'INV-TEST-D-1');
 assert.equal(invoice.convertedFromId,quote.id);
 assert.equal(invoice.status,'draft');
 assert.equal(quote.status,'final','source quote must remain untouched');
 assert.equal(amount(vault,item.id),'10','a quote or conversion must never affect stock');
 const finalInvoice={...invoice,status:'final',issueDate:TODAY,dueDate:TODAY};
 const ready={...vault,documents:[quote,finalInvoice]};
 const posted=postIssuedInvoiceStock(ready,finalInvoice);
 assert.equal(posted.created,true);
 assert.equal(amount(posted.vault,item.id),'8');
 assert.equal(posted.vault.inventoryMovements.filter(m=>m.sourceId===invoice.id&&m.type==='issue').length,1);
 const retry=postIssuedInvoiceStock(posted.vault,finalInvoice);
 assert.equal(retry.created,false,'retrying issue must be idempotent');
 assert.equal(amount(retry.vault,item.id),'8');
 assert.doesNotThrow(()=>assertPostedInvoiceStockDocumentIntegrity(retry.vault.documents,retry.vault.inventoryMovements));
 const ar=receivablesByCurrency(retry.vault.documents,[],TODAY,'ux-acceptance-buyer');
 assert.equal(ar.length,1);
 assert.equal(ar[0].currency,'USD');
 assert.equal(ar[0].billed,'275.00');
 assert.equal(ar[0].outstanding,'275.00','stock posting does not equal recording payment');
 const statement=customerStatement('ux-acceptance-buyer',retry.vault.documents,[],TODAY);
 assert.equal(statement[0]?.outstanding,'275.00');
 assert.throws(()=>assertPostedStockRestoreContinuity(retry.vault,ready),/erase or modify posted invoice stock|audit history/i,
   'old backups cannot erase issued stock and its source');
 assert.doesNotThrow(()=>assertPostedStockRestoreContinuity(retry.vault,retry.vault));
 assert.throws(()=>assertInvoiceStockLedgerContinuity(retry.vault.inventoryMovements,ready.inventoryMovements,retry.vault.inventoryMovements),
   /immutable/i,'concurrent sync cannot silently delete issued stock');
});

test('Batch D rejects insufficient stock without creating any movement or changing the source vault',()=>{
 const {vault:initial,plan}=proposal(),item=importableProducts(plan)[0];
 const before={...initial,savedItems:[item],inventoryMovements:[createManualInventoryMovement(item,'opening','1',TODAY,'Synthetic 1 unit')]};
 const invoice=createBlankDocument('invoice','INV-TEST-D-LOW',before.company);
 invoice.status='final';invoice.issueDate=TODAY;invoice.dueDate=TODAY;invoice.customerSnapshot={...customer};
 invoice.items=[{...invoice.items[0],savedItemId:item.id,skuSnapshot:item.sku,stockTreatment:'tracked',
   descriptionEn:item.descriptionEn,quantity:'2',unit:'PCS',unitPrice:'125.00'}];
 const beforeJson=JSON.stringify(before);
 assert.throws(()=>postIssuedInvoiceStock({...before,documents:[invoice]},invoice),/Insufficient stock/);
 assert.equal(JSON.stringify(before),beforeJson,'insufficient stock failure must be non-mutating');
 assert.equal(amount(before,item.id),'1');
});
