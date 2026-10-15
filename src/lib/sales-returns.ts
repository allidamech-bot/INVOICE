import type {DocumentAttachment,InventoryMovementRecord,LourexDocument,VaultPayload} from '../types.js';
import {decimalToScaled,isDecimalInput} from './money.js';
import {inventoryMovementAccountingIsValid} from './operations.js';
import {validateManualMovementEvidence} from './inventory-evidence.js';
import {assertGovernancePermission} from './governance.js';
import {isIsoDate} from './id.js';
import {INVOICE_STOCK_PREFIX} from './invoice-stock.js';

/**
 * Sales credit and physical goods receipt are different events. A financial
 * credit note NEVER silently increases stock. Receive verified goods explicitly,
 * retaining the original issued invoice, credit-note line, warehouse and cost.
 */
export const SALES_RETURN_PREFIX='sales-credit-stock:';
export interface SalesReturnProof{
  invoiceId:string;invoiceLineId:string;creditNoteId:string;creditLineId:string;
  itemId:string;warehouseId:string;receiptId:string;
}
export interface SalesReturnInput{
  creditNoteId:string;invoiceLineId:string;creditLineId:string;warehouseId:string;
  quantity:string;date:string;reason:string;evidence:DocumentAttachment;operatorId:string;
}
const qty=(x:string)=>decimalToScaled(x,4);
const fixed=(q:bigint):string=>String(q/10000n)+'.'+String(q%10000n).padStart(4,'0');
const returnId=(p:SalesReturnProof)=>SALES_RETURN_PREFIX+p.creditNoteId+':'+p.creditLineId+':'+p.invoiceLineId+':'+p.receiptId;
function fail(message:string):never{throw new Error(message);}
function eligibleInvoice(doc:LourexDocument|undefined):doc is LourexDocument{
  return !!doc&&doc.kind==='invoice'&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';
}
function eligibleCredit(doc:LourexDocument|undefined):doc is LourexDocument{
  return !!doc&&doc.kind==='invoice'&&doc.role==='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided';
}
function scoped(document:LourexDocument,workspaceId:string,branchId:string):boolean{
  return (!document.workspaceId||document.workspaceId===workspaceId)&&(!document.branchId||document.branchId===branchId);
}
export function isSalesReturn(m:InventoryMovementRecord):boolean{
  return m.id.startsWith(SALES_RETURN_PREFIX)||!!m.salesReturn;
}

export function assertSalesReturnIntegrity(vault:Pick<VaultPayload,'documents'|'inventoryMovements'|'warehouses'|'appSettings'>):void{
  const movements=vault.inventoryMovements.filter(isSalesReturn);
  if(!movements.length)return;
  const documents=new Map(vault.documents.map(d=>[d.id,d]));
  const byId=new Set<string>();
  const originalUsed=new Map<string,bigint>(),creditedUsed=new Map<string,bigint>();
  for(const m of movements){
    if(byId.has(m.id))fail('Duplicate physical return movement ID.');
    byId.add(m.id);
    const p=m.salesReturn;
    if(!p||!p.receiptId||m.evidence?.id!==p.receiptId||m.id!==returnId(p)||m.type!=='adjustment'||!inventoryMovementAccountingIsValid(m)
      ||!isDecimalInput(m.quantity)||qty(m.quantity)<=0n
      ||m.sourceId!==p.creditNoteId||m.toWarehouseId!==p.warehouseId||m.fromWarehouseId
      ||m.itemId!==p.itemId||!isIsoDate(m.date))
      fail('Invalid physical sales return stock record.');
    validateManualMovementEvidence(m);
    if(m.reasonCategory!=='correction')fail('Physical return requires the dedicated correction reason.');
    const credit=documents.get(p.creditNoteId),invoice=documents.get(p.invoiceId);
    if(!eligibleInvoice(invoice)||!eligibleCredit(credit)||credit.creditForId!==invoice.id
      ||invoice.currency!==credit.currency
      ||(invoice.customerSnapshot?.sourceCustomerId||'')!==(credit.customerSnapshot?.sourceCustomerId||''))
      fail('Physical return requires a final, active, linked credit note and invoice.');
    const workspaceId=invoice.workspaceId||'default',branchId=invoice.branchId||'main';
    if(!scoped(credit,workspaceId,branchId)||m.workspaceId!==workspaceId||m.branchId!==branchId
      ||!vault.warehouses.some(w=>w.id===p.warehouseId&&w.workspaceId===workspaceId&&w.branchId===branchId))
      fail('Physical return warehouse and document scope do not match.');
    if(m.date<invoice.issueDate)fail('Returned goods cannot predate the original issued invoice.');
    const original=invoice.items.find(line=>line.id===p.invoiceLineId);
    const credited=credit.items.find(line=>line.id===p.creditLineId);
    if(!original||!credited||original.stockTreatment!=='tracked'||credited.stockTreatment!=='tracked'
      ||!original.savedItemId||original.savedItemId!==p.itemId||credited.savedItemId!==p.itemId
      ||original.skuSnapshot!==m.sku||credited.skuSnapshot!==m.sku
      ||original.unit.trim().toLowerCase()!==credited.unit.trim().toLowerCase()
      ||!isDecimalInput(original.quantity)||qty(original.quantity)<=0n
      ||!isDecimalInput(credited.quantity)||qty(credited.quantity)<=0n)
      fail('Return must match explicit catalog-linked stock lines on both documents.');
    const issued=vault.inventoryMovements.find(row=>row.id===INVOICE_STOCK_PREFIX+invoice.id+':'+original.id);
    if(!issued||issued.type!=='issue'||issued.itemId!==p.itemId
      ||qty(issued.quantity)!==-qty(original.quantity)||issued.sourceId!==invoice.id)
      fail('Only stock actually deducted by the final invoice can be returned.');
    if(m.unitCost!==issued.unitCost||m.currency!==issued.currency
      ||m.sourceNumber!==credit.number)
      fail('Return cannot change the original inventory cost or credit-note reference.');
    const creditKey=p.creditNoteId+':'+p.creditLineId;
    const invoiceKey=p.invoiceId+':'+p.invoiceLineId;
    creditedUsed.set(creditKey,(creditedUsed.get(creditKey)||0n)+qty(m.quantity));
    originalUsed.set(invoiceKey,(originalUsed.get(invoiceKey)||0n)+qty(m.quantity));
    if(creditedUsed.get(creditKey)!>qty(credited.quantity))
      fail('Physical returns exceed the quantity on the credited item line.');
    if(originalUsed.get(invoiceKey)!>qty(original.quantity))
      fail('Physical returns exceed the original invoiced quantity.');
  }
}

/** Prevent cross-device overwrites of a posted physical return, even on merge. */
export function assertSalesReturnLedgerContinuity(base:InventoryMovementRecord[],intended:InventoryMovementRecord[],latest:InventoryMovementRecord[]):void{
  const idMap=(rows:InventoryMovementRecord[])=>{
    const map=new Map<string,InventoryMovementRecord>();
    for(const row of rows){if(map.has(row.id)&&isSalesReturn(row))fail('Duplicate return receipt identity.');map.set(row.id,row);}
    return map;
  };
  const b=idMap(base),w=idMap(intended),l=idMap(latest);
  for(const m of b.values()){
    if(!isSalesReturn(m))continue;
    if(JSON.stringify(w.get(m.id))!==JSON.stringify(m)||JSON.stringify(l.get(m.id))!==JSON.stringify(m))
      fail('Issued return receipt is immutable and cannot be erased or modified.');
  }
  for(const m of w.values()){
    if(!isSalesReturn(m))continue;
    const remote=l.get(m.id);
    if(remote&&JSON.stringify(remote)!==JSON.stringify(m))fail('Concurrent return receipt conflict.');
  }
}

/** Single vault intent, never a client-side balance tweak. */
export function postSalesReturn(vault:VaultPayload,input:SalesReturnInput):{vault:VaultPayload;movement:InventoryMovementRecord;created:boolean}{
  assertGovernancePermission(vault,'issue-sales-stock');
  const credit=vault.documents.find(d=>d.id===input.creditNoteId);
  const invoice=vault.documents.find(d=>d.id===credit?.creditForId);
  if(!eligibleCredit(credit)||!eligibleInvoice(invoice))fail('Issue a final credit note against an active final invoice first.');
  const workspaceId=vault.appSettings.activeWorkspaceId,branchId=vault.appSettings.activeBranchId;
  if(!scoped(credit,workspaceId,branchId)||!scoped(invoice,workspaceId,branchId))
    fail('Return cannot cross workspaces or branches.');
  const original=invoice.items.find(l=>l.id===input.invoiceLineId);
  const credited=credit.items.find(l=>l.id===input.creditLineId);
  if(!original?.savedItemId||!credited?.savedItemId||original.savedItemId!==credited.savedItemId)
    fail('Select a credit-note item linked to the same catalog product on the invoice.');
  const item=vault.inventoryMovements.find(m=>m.id===INVOICE_STOCK_PREFIX+invoice.id+':'+original.id);
  if(!item)fail('Original invoice did not post stock: reconcile historical delivery issues separately.');
  if(!vault.warehouses.some(w=>w.id===input.warehouseId&&w.workspaceId===workspaceId&&w.branchId===branchId&&w.active))
    fail('Choose an active warehouse in the same branch.');
  if(!isDecimalInput(input.quantity)||qty(input.quantity)<=0n)fail('Received quantity must be positive and precise.');
  if(!isIsoDate(input.date))fail('Return receipt date is invalid.');
  const p:SalesReturnProof={invoiceId:invoice.id,invoiceLineId:original.id,creditNoteId:credit.id,
    creditLineId:credited.id,itemId:original.savedItemId,warehouseId:input.warehouseId,receiptId:input.evidence?.id||''};
  const id=returnId(p);
  if(vault.inventoryMovements.some(m=>m.id===id))fail('This credited item has already been received. Reverse with a dedicated audited correction.');
  const m:InventoryMovementRecord={
    id,itemId:p.itemId,itemNameEn:item.itemNameEn,itemNameAr:item.itemNameAr,sku:item.sku,
    date:input.date,type:'adjustment',quantity:fixed(qty(input.quantity)),
    unitCost:item.unitCost,currency:item.currency,sourceId:credit.id,sourceNumber:credit.number,
    note:input.reason.trim(),reasonCategory:'correction',evidence:input.evidence,
    createdBy:input.operatorId,toWarehouseId:input.warehouseId,salesReturn:p,
    workspaceId,branchId,createdAt:new Date().toISOString()
  };
  const next={...vault,inventoryMovements:[...vault.inventoryMovements,m]};
  assertSalesReturnIntegrity(next);
  return {vault:next,movement:m,created:true};
}
