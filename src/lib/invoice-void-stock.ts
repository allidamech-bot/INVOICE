import type {DocumentAttachment,InventoryMovementRecord,LourexDocument,VaultPayload} from '../types.js';
import {decimalToScaled,isDecimalInput} from './money.js';
import {inventoryMovementAccountingIsValid} from './operations.js';
import {validateManualMovementEvidence} from './inventory-evidence.js';
import {assertGovernancePermission} from './governance.js';
import {voidFinalDocument} from './document-lifecycle.js';
import {INVOICE_STOCK_PREFIX,isIssuedInvoiceStockIssue} from './invoice-stock.js';
import {todayIso} from './id.js';

export const INVOICE_VOID_STOCK_PREFIX='sales-invoice-void-stock:';
export interface InvoiceVoidStockInput {reason:string; evidence:DocumentAttachment; operatorId:string; date?:string;}
export interface InvoiceVoidStockProof {
 invoiceId:string; invoiceLineId:string; issueMovementId:string; warehouseId:string; evidenceId:string;
}
const scaled=(s:string)=>decimalToScaled(s,4);
const format=(q:bigint)=>String(q/10000n)+'.'+String(q%10000n).padStart(4,'0');
function fail(msg:string):never{throw new Error(msg);}
const refundEventFor=(invoice:LourexDocument,source:InventoryMovementRecord):InvoiceVoidStockProof=>({
 invoiceId:invoice.id,invoiceLineId:source.id.slice((INVOICE_STOCK_PREFIX+invoice.id+':').length),
 issueMovementId:source.id,warehouseId:source.fromWarehouseId||'',evidenceId:''
});
export function isInvoiceVoidStockReceipt(m:InventoryMovementRecord):boolean{
 return m.id.startsWith(INVOICE_VOID_STOCK_PREFIX)||!!m.invoiceVoidStock;
}
export function postVoidedInvoiceWithPhysicalReceipt(vault:VaultPayload,source:LourexDocument,input:InvoiceVoidStockInput):
 {vault:VaultPayload;document:LourexDocument;movements:InventoryMovementRecord[]}{
 assertGovernancePermission(vault,'issue-sales-stock');
 const invoice=vault.documents.find(d=>d.id===source.id);
 if(!invoice||invoice.kind!=='invoice'||invoice.role!=='standard'
  ||invoice.status!=='final'||invoice.lifecycleStatus==='voided')fail('An active final sales invoice is required.');
 if(vault.appSettings.activeWorkspaceId!==(invoice.workspaceId||vault.appSettings.activeWorkspaceId)
  ||vault.appSettings.activeBranchId!==(invoice.branchId||vault.appSettings.activeBranchId))
  fail('Invoice cancellation must be performed in its own workspace and branch.');
 if(vault.documents.some(d=>d.role==='credit-note'&&d.creditForId===invoice.id&&d.lifecycleStatus!=='voided'))
  fail('Linked credit notes must be resolved before cancelling the original invoice.');
 if(vault.inventoryMovements.some(m=>m.salesReturn?.invoiceId===invoice.id))
  fail('An invoice with physical return receipts must be reconciled through its credit notes.');
 const voided=voidFinalDocument(invoice,input.reason,vault.documents,vault.payments);
 if(!input.evidence)fail('Physical receipt proof is required to restore issued invoice stock.');
 if(!input.operatorId?.trim())fail('Identify the authorized operator for physical stock receipt.');
 const when=input.date||todayIso();
 if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(when)||when<invoice.issueDate)
  fail('Physical receipt date cannot precede the original invoice.');
 const original=vault.inventoryMovements.filter(m=>m.sourceId===invoice.id&&isIssuedInvoiceStockIssue(m));
 if(!original.length)fail('This invoice has no issued stock to reverse through this cancellation flow.');
 if(original.some(m=>!m.id.startsWith(INVOICE_STOCK_PREFIX)||m.type!=='issue'
     ||!m.fromWarehouseId||!isDecimalInput(m.quantity)||scaled(m.quantity)>=0n))
  fail('Original invoice stock issue cannot be reconciled safely.');
 const proofId=input.evidence.id;
 if(!proofId||!input.reason?.trim())fail('A physical stock receipt reason and proof are required.');
 const voidWithProof={...voided,attachments:[...(invoice.attachments||[]),input.evidence]};
 const movements:InventoryMovementRecord[]=original.map(issue=>{
  const proof:InvoiceVoidStockProof={...refundEventFor(invoice,issue),evidenceId:proofId};
  return {
   id:INVOICE_VOID_STOCK_PREFIX+issue.id, type:'adjustment',quantity:format(-scaled(issue.quantity)),
   itemId:issue.itemId,itemNameEn:issue.itemNameEn,itemNameAr:issue.itemNameAr,sku:issue.sku,
   date:when,unitCost:issue.unitCost,currency:issue.currency,
   sourceId:invoice.id,sourceNumber:invoice.number,
   note:input.reason.trim(),reasonCategory:'correction',createdBy:input.operatorId.trim(),
   toWarehouseId:issue.fromWarehouseId,invoiceVoidStock:proof,
   workspaceId:invoice.workspaceId||vault.appSettings.activeWorkspaceId,
   branchId:invoice.branchId||vault.appSettings.activeBranchId,createdAt:new Date().toISOString()
  };
 });
 // One file is stored ONCE on the cancelled invoice; ledger entries reference its ID.
 const result={...vault,documents:vault.documents.map(d=>d.id===invoice.id?voidWithProof:d),
   inventoryMovements:[...vault.inventoryMovements,...movements]};
 assertInvoiceVoidStockIntegrity(result.documents,result.inventoryMovements);
 return {vault:result,document:voidWithProof,movements};
}

export function assertInvoiceVoidStockIntegrity(documents:LourexDocument[],movements:InventoryMovementRecord[]):void{
 const docs=new Map(documents.map(doc=>[doc.id,doc]));
 const issuesByInvoice=new Map<string,InventoryMovementRecord[]>();
 const correctionsByInvoice=new Map<string,InventoryMovementRecord[]>();
 const ids=new Set<string>();
 for(const row of movements){
  if(isIssuedInvoiceStockIssue(row)){
   const list=issuesByInvoice.get(row.sourceId)||[];list.push(row);issuesByInvoice.set(row.sourceId,list);
  }
  if(isInvoiceVoidStockReceipt(row)){
   if(ids.has(row.id))fail('Duplicate invoice cancellation receipt ID.');
   ids.add(row.id);
   const p=row.invoiceVoidStock;
   if(!p||!p.invoiceId||row.sourceId!==p.invoiceId||row.id!==INVOICE_VOID_STOCK_PREFIX+p.issueMovementId)
    fail('Invalid invoice cancellation receipt identity.');
   const list=correctionsByInvoice.get(p.invoiceId)||[];list.push(row);correctionsByInvoice.set(p.invoiceId,list);
  }
 }
 for(const [invoiceId,receipts] of correctionsByInvoice){
  if(!issuesByInvoice.has(invoiceId))fail('Cancellation stock receipt lacks its original invoice issue.');
  const invoice=docs.get(invoiceId);
  if(!invoice||invoice.lifecycleStatus!=='voided'||invoice.kind!=='invoice'||invoice.role!=='standard'||invoice.status!=='final')
   fail('Physical cancellation receipt must reference a voided final sales invoice.');
  const issues=issuesByInvoice.get(invoiceId)||[];
  if(receipts.length!==issues.length)fail('A cancelled invoice must restore every issued line exactly once.');
  const proofIds=new Set(receipts.map(m=>m.invoiceVoidStock?.evidenceId));
  if(proofIds.size!==1)fail('All cancellation receipt lines must share the same source proof.');
  for(const row of receipts){
   const p=row.invoiceVoidStock!;
   const original=issues.find(m=>m.id===p.issueMovementId);
   const line=invoice.items.find(l=>l.id===p.invoiceLineId);
   if(!original||!line||!inventoryMovementAccountingIsValid(row)
    ||!isDecimalInput(row.quantity)||scaled(row.quantity)<=0n
    ||scaled(original.quantity)!==-scaled(row.quantity)
    ||p.invoiceLineId!==original.id.slice((INVOICE_STOCK_PREFIX+invoiceId+':').length)
    ||row.itemId!==original.itemId||row.sku!==original.sku
    ||row.itemId!==line.savedItemId||row.sku!==line.skuSnapshot
    ||row.unitCost!==original.unitCost||row.currency!==original.currency
    ||row.toWarehouseId!==original.fromWarehouseId||p.warehouseId!==original.fromWarehouseId
    ||row.fromWarehouseId||row.sourceNumber!==invoice.number
    ||row.note!==invoice.voidReason||row.date<invoice.issueDate
    ||row.workspaceId!==(invoice.workspaceId||'default')||row.branchId!==(invoice.branchId||'main'))
    fail('Cancellation receipt differs from immutable issued invoice stock.');
   const proof=(invoice.attachments||[]).find(a=>a.id===p.evidenceId);
   if(!proof||!row.createdBy?.trim()||row.reasonCategory!=='correction')
    fail('Cancellation stock needs an accountable operator and immutable source proof.');
   validateManualMovementEvidence({...row,evidence:proof});
  }
 }
 for(const [invoiceId,issues] of issuesByInvoice){
  const invoice=docs.get(invoiceId);
  if(invoice?.lifecycleStatus==='voided'&&issues.length&&!correctionsByInvoice.has(invoiceId))
   fail('Voided invoice is missing its documented warehouse receipt.');
 }
}

/** Every returned unit and original issue persists across offline and concurrent merges. */
export function assertInvoiceVoidStockContinuity(base:InventoryMovementRecord[],intended:InventoryMovementRecord[],latest:InventoryMovementRecord[]):void{
 const index=(rows:InventoryMovementRecord[])=>{
  const map=new Map<string,InventoryMovementRecord>();
  for(const row of rows){
   if(map.has(row.id)&&(isInvoiceVoidStockReceipt(row)||isInvoiceVoidStockReceipt(map.get(row.id)!)))
    fail('Duplicate invoice cancellation stock record.');
   map.set(row.id,row);
  }return map;
 };
 const a=index(base),b=index(intended),c=index(latest);
 for(const row of a.values()){
  if(!isInvoiceVoidStockReceipt(row))continue;
  if(JSON.stringify(row)!==JSON.stringify(b.get(row.id))||JSON.stringify(row)!==JSON.stringify(c.get(row.id)))
   fail('Posted invoice cancellation stock is immutable.');
 }
 for(const row of b.values()){
  if(!isInvoiceVoidStockReceipt(row))continue;
  const remote=c.get(row.id);
  if(remote&&JSON.stringify(row)!==JSON.stringify(remote))
   fail('Conflicting invoice cancellation between devices.');
 }
}
