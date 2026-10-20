import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyVault} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {createCreditNoteDraft} from '../dist/src/lib/document-lifecycle.js';
import {createManualInventoryMovement,inventoryBalances} from '../dist/src/lib/operations.js';
import {postIssuedInvoiceStock} from '../dist/src/lib/invoice-stock.js';
import {postVoidedInvoiceWithPhysicalReceipt} from '../dist/src/lib/invoice-void-stock.js';
import {postSalesReturn,correctSalesReturn} from '../dist/src/lib/sales-returns.js';
import {normalizePaymentRecord,invoicePaymentSummary} from '../dist/src/lib/payments.js';
import {receivablesByCurrency,customerStatement} from '../dist/src/lib/receivables.js';
import {financialReportByCurrency} from '../dist/src/lib/reports.js';
import {mergeVaultIntent} from '../dist/src/storage/vault-merge.js';
const reopen=value=>JSON.parse(JSON.stringify(value));

test('saved credit, physical return, correction and unpaid invoice void keep finance and stock coherent',()=>{
  const now=new Date().toISOString(),day=now.slice(0,10);
  const proof=id=>{const bytes=Buffer.from('%PDF-1.4\nSynthetic evidence '+id+'\n');return{
    id,name:id+'.pdf',mimeType:'application/pdf',size:bytes.length,
    dataUrl:'data:application/pdf;base64,'+bytes.toString('base64'),createdAt:now};};
  const item={id:'qa-return-cycle-item',sku:'QA-RETURN-CYCLE',descriptionEn:'Synthetic cartons',descriptionAr:'',
    unit:'Carton',lastUnitPrice:'10.00',lastCurrency:'USD',lastUnitCost:'4.50',lastCostCurrency:'USD',
    usageCount:0,lastUsedAt:now,createdAt:now,updatedAt:now,workspaceId:'default',branchId:'main'};
  let vault=emptyVault();
  const opening={...createManualInventoryMovement(item,'opening','10',day,'Synthetic documented opening','4.50','USD'),
    workspaceId:'default',branchId:'main',reasonCategory:'opening',createdBy:'qa-owner',evidence:proof('qa-return-opening')};
  vault={...vault,savedItems:[item],inventoryMovements:[opening]};
  const save=next=>{vault=reopen(mergeVaultIntent(vault,next,vault));};
  const stock=()=>inventoryBalances(vault.savedItems,vault.inventoryMovements)[0].quantity;
  const invoice=createBlankDocument('invoice','INV-QA-RETURN-CYCLE',vault.company);
  Object.assign(invoice,{id:'qa-return-cycle-invoice',issueDate:day,dueDate:day,currency:'USD',
    workspaceId:'default',branchId:'main',customerSnapshot:{sourceCustomerId:'qa-return-cycle-buyer',
      companyNameEn:'Synthetic return buyer',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',
      city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''}});
  invoice.adjustments={...invoice.adjustments,discountEnabled:false,taxEnabled:false,shippingEnabled:false,otherChargesEnabled:false};
  invoice.items=[{...invoice.items[0],id:'qa-return-sold-line',descriptionEn:item.descriptionEn,unit:'Carton',
    quantity:'4',unitPrice:'10.00',unitCost:'4.50',savedItemId:item.id,stockTreatment:'tracked',skuSnapshot:item.sku}];
  save({...vault,documents:[invoice]});
  const finalInvoice={...vault.documents[0],status:'final'};
  save(postIssuedInvoiceStock({...vault,documents:[finalInvoice]},finalInvoice).vault);
  assert.equal(stock(),'6');
  const originalIssue=JSON.stringify(vault.inventoryMovements.find(row=>row.sourceId===invoice.id));
  const credit={...createCreditNoteDraft(finalInvoice,'CN-QA-RETURN-CYCLE','20.00'),status:'final',issueDate:day};
  credit.items=[{...credit.items[0],id:'qa-return-credit-line',quantity:'2',unitPrice:'10.00'}];
  save({...vault,documents:[...vault.documents,credit]});
  assert.equal(stock(),'6','credit alone cannot receive goods');
  let summary=invoicePaymentSummary(finalInvoice,vault.payments,day,vault.documents);
  assert.equal(summary.total,'40.00');assert.equal(summary.credits,'20.00');assert.equal(summary.remaining,'20.00');
  const payment=normalizePaymentRecord(finalInvoice,[],{id:'qa-return-cycle-payment',
    amount:'20.00',date:day,method:'bank-transfer',reference:'QA-RETURN-20',notes:''},vault.documents);
  save({...vault,payments:[payment]});
  const request={creditNoteId:credit.id,invoiceLineId:finalInvoice.items[0].id,creditLineId:credit.items[0].id,
    warehouseId:vault.warehouses[0].id,quantity:'2',date:day,
    reason:'Synthetic cartons physically received and inspected',evidence:proof('qa-return-receipt'),operatorId:'qa-owner'};
  const returned=postSalesReturn(vault,request);
  save(returned.vault);
  assert.equal(stock(),'8');
  const receipt=vault.inventoryMovements.find(row=>row.salesReturn);
  assert.equal(receipt.unitCost,'4.50');assert.equal(receipt.sourceId,credit.id);
  const originalReceipt=JSON.stringify(receipt),before=JSON.stringify(vault);
  assert.throws(()=>postSalesReturn(vault,request),/already been received/i);
  assert.equal(JSON.stringify(vault),before);
  const corrected=correctSalesReturn(vault,{receiptMovementId:receipt.id,date:day,
    reason:'Synthetic receipt count corrected with new approval',
    evidence:proof('qa-return-correction'),operatorId:'qa-owner'});
  save(corrected.vault);
  assert.equal(stock(),'6');
  assert.equal(JSON.stringify(vault.inventoryMovements.find(row=>row.id===receipt.id)),originalReceipt);
  assert.equal(vault.inventoryMovements.filter(row=>row.salesReturnCorrection).length,1);
  summary=invoicePaymentSummary(finalInvoice,vault.payments,day,vault.documents);
  assert.equal(summary.credits,'20.00');assert.equal(summary.paid,'20.00');
  assert.equal(summary.remaining,'0.00');assert.equal(summary.status,'paid');
  const unpaid={...finalInvoice,id:'qa-unpaid-void-invoice',number:'INV-QA-VOID',
    items:[{...finalInvoice.items[0],id:'qa-unpaid-void-line',quantity:'1'}]};
  save(postIssuedInvoiceStock({...vault,documents:[...vault.documents,unpaid]},unpaid).vault);
  assert.equal(stock(),'5');
  const unpaidIssue=JSON.stringify(vault.inventoryMovements.find(row=>row.sourceId===unpaid.id));
  const voidRequest={reason:'Synthetic unpaid order cancelled and carton physically received',
    evidence:proof('qa-unpaid-void-receipt'),operatorId:'qa-owner',date:day};
  const voided=postVoidedInvoiceWithPhysicalReceipt(vault,unpaid,voidRequest);
  save(voided.vault);
  assert.equal(stock(),'6');
  assert.equal(vault.documents.find(row=>row.id===unpaid.id).lifecycleStatus,'voided');
  assert.equal(JSON.stringify(vault.inventoryMovements.find(row=>row.sourceId===unpaid.id&&row.type==='issue')),unpaidIssue);
  assert.equal(JSON.stringify(vault.inventoryMovements.find(row=>row.sourceId===invoice.id&&row.type==='issue')),originalIssue);
  assert.throws(()=>postVoidedInvoiceWithPhysicalReceipt(vault,unpaid,voidRequest),/active final sales invoice/i);
  const ar=receivablesByCurrency(vault.documents,vault.payments,day)[0];
  assert.equal(ar.billed,'40.00');assert.equal(ar.credits,'20.00');assert.equal(ar.paid,'20.00');assert.equal(ar.outstanding,'0.00');
  const report=financialReportByCurrency(vault.documents,vault.payments,day,day)[0];
  assert.equal(report.invoiced,'20.00');assert.equal(report.collected,'20.00');assert.equal(report.outstanding,'0.00');
  assert.equal(customerStatement('qa-return-cycle-buyer',vault.documents,vault.payments,day)[0].entries.at(-1).balance,'0.00');
  const snapshot=JSON.stringify(vault);
  vault=reopen(mergeVaultIntent(vault,reopen(vault),reopen(vault)));
  assert.equal(JSON.stringify(vault),snapshot);
  assert.equal(stock(),'6');
});
