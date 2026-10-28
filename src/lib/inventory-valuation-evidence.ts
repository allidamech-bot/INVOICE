import type {InventoryMovementRecord,LourexDocument,PurchaseRecord} from '../types.js';
import {decimalToScaled,isExactStockQuantityInput} from './money.js';
import {defaultWarehouseId} from './warehouses.js';
import {
  calculateMovingWeightedAverage,
  type ExplicitCostFxEvidence,
  type MovingAverageEvent,
  type MovingAverageResult,
  type MovingAverageScope
} from './inventory-moving-average.js';

/**
 * Read-only Alif 22-B/C acceptance bridge for an EXPLICITLY ORDERED, COMPLETE
 * synthetic ledger. No production posting, no inference from catalog last cost.
 * A real cutover still requires approved immutable chronology and opening/FX
 * evidence, plus transfers/reversals/period/NRV policy.
 */
export interface PostedValuationEvidence {
  scope:MovingAverageScope;
  /** Caller-verified chronological order of ALL in-scope stock movement IDs. */
  orderedMovementIds:readonly string[];
  movements:readonly InventoryMovementRecord[];
  purchases:readonly PurchaseRecord[];
  documents:readonly LourexDocument[];
  /** Explicitly approved direct FX evidence, indexed by receipt movement ID. */
  fxByMovementId?:Readonly<Record<string,ExplicitCostFxEvidence>>;
}
function refuse(reason:string):never{
  throw new Error('ALIF_22_POSTED_LEDGER_NOT_READY: '+reason);
}
function qty(value:string):bigint{
  if(!isExactStockQuantityInput(value))refuse('Stock movement quantity is imprecise.');
  return decimalToScaled(value,4);
}
function location(row:InventoryMovementRecord,branchId:string):string{
  return row.quantity.startsWith('-')
    ?row.fromWarehouseId||defaultWarehouseId(branchId)
    :row.toWarehouseId||defaultWarehouseId(branchId);
}
function assertScope(row:{workspaceId?:string;branchId?:string},scope:MovingAverageScope):void{
  if(row.workspaceId!==scope.workspaceId||row.branchId!==scope.branchId)
    refuse('Ledger source scope is missing or does not match the chosen company and branch.');
}
function purchaseReceipt(row:InventoryMovementRecord,input:PostedValuationEvidence):void{
  const purchase=input.purchases.find(p=>p.id===row.sourceId);
  if(!purchase||purchase.status!=='posted')refuse('Receipt requires an existing posted purchase.');
  assertScope(purchase,input.scope);
  if(row.sourceNumber!==purchase.number||row.currency!==purchase.currency)
    refuse('Receipt disagrees with purchase number or original currency.');
  const matches=purchase.items.filter(line=>line.savedItemId===row.itemId);
  if(matches.length!==1)refuse('Ambiguous purchase lines: a unique source line ID is required.');
  const line=matches[0]!;
  if(qty(line.quantity)!==qty(row.quantity)
    ||decimalToScaled(line.landedUnitCost||line.unitCost,12)!==decimalToScaled(row.unitCost,12)
    ||!row.unitCost.trim()||!line.unitCost.trim()||!line.quantity.trim())
    refuse('Receipt quantity or landed unit cost differs from posted purchase.');
}
function invoiceIssue(row:InventoryMovementRecord,input:PostedValuationEvidence):void{
  const invoice=input.documents.find(doc=>doc.id===row.sourceId);
  if(!invoice||invoice.kind!=='invoice'||invoice.role!=='standard'
    ||invoice.status!=='final'||invoice.lifecycleStatus==='voided')
    refuse('Issue requires an active final invoice; corrections need separate rules.');
  assertScope(invoice,input.scope);
  const matched=invoice.items.filter(line=>
    row.id==='sales-invoice-stock:'+invoice.id+':'+line.id
    &&line.savedItemId===row.itemId&&line.stockTreatment==='tracked');
  if(matched.length!==1||row.sourceNumber!==invoice.number
    ||qty(row.quantity)!==-qty(matched[0]!.quantity)
    ||row.sku!==matched[0]!.skuSnapshot)
    refuse('Invoice issue differs from its verified final stock line.');
  const prefix='@lourex:invoice-stock:v1:';
  if(!row.note.startsWith(prefix))refuse('Signed invoice stock provenance is missing.');
  let proof:Record<string,unknown>;
  try{proof=JSON.parse(row.note.slice(prefix.length));}
  catch{refuse('Invoice stock proof is unreadable.');}
  if(proof.invoiceId!==invoice.id||proof.lineId!==matched[0]!.id
    ||proof.itemId!==row.itemId||proof.warehouseId!==location(row,input.scope.branchId)
    ||proof.quantity!==matched[0]!.quantity||proof.unit!==matched[0]!.unit)
    refuse('Invoice stock proof disagrees with its underlying document.');
}

/**
 * Projection rejects missing/duplicated rows, ambiguous sources and any
 * unsupported movement BEFORE returning a financial result.
 */
export function projectPostedValuationEvidence(input:PostedValuationEvidence):MovingAverageResult{
  const {scope,orderedMovementIds,movements}=input;
  if(!scope.workspaceId.trim()||!scope.branchId.trim()
    ||!scope.warehouseId.trim()||!scope.itemId.trim())
    refuse('Company, branch, product and warehouse must all be explicit.');
  if(movements.some(row=>row.itemId===scope.itemId&&(!row.workspaceId||!row.branchId)))
    refuse('Unscoped historic movements need audited normalization before valuation.');
  const relevant=movements.filter(row=>row.itemId===scope.itemId
    &&row.workspaceId===scope.workspaceId&&row.branchId===scope.branchId);
  if(relevant.length!==orderedMovementIds.length)
    refuse('The trusted chronological order omits or adds inventory movements.');
  const byId=new Map<string,InventoryMovementRecord>();
  for(const row of relevant){
    if(!row.id.trim()||byId.has(row.id))refuse('Duplicate or empty inventory movement ID.');
    byId.set(row.id,row);
  }
  const seen=new Set<string>();
  const events:MovingAverageEvent[]=[];
  for(const id of orderedMovementIds){
    if(seen.has(id)||!byId.has(id))refuse('Duplicate or unknown entry in valuation order.');
    seen.add(id);
    const row=byId.get(id)!;
    const amount=qty(row.quantity);
    if(amount===0n)refuse('Zero-quantity ledger entry.');
    // A missing correct-direction field may identify the legacy default
    // warehouse, but an explicit warehouse on the OPPOSITE side invalidates
    // the source even when the fallback happens to match the valuation scope.
    const wrongDirectionWarehouse=amount>0n?row.fromWarehouseId:row.toWarehouseId;
    if(location(row,scope.branchId)!==scope.warehouseId||wrongDirectionWarehouse)
      refuse('Warehouse transfer or other-location movement needs a separate valuation policy.');
    const base={id:row.id,sequence:events.length,date:row.date,
      workspaceId:scope.workspaceId,branchId:scope.branchId,
      warehouseId:scope.warehouseId,itemId:scope.itemId};
    if(row.type==='purchase'){
      if(amount<0n)refuse('A purchase receipt must increase stock.');
      purchaseReceipt(row,input);
      events.push({...base,kind:'receipt',quantity:row.quantity,
        unitCost:row.unitCost,costCurrency:row.currency,
        ...(input.fxByMovementId?.[id]?{fx:input.fxByMovementId[id]}:{})});
    }else if(row.type==='opening'){
      if(amount<0n||!row.evidence?.id||!row.evidence.dataUrl)
        refuse('Opening quantity and documented valuation evidence are mandatory.');
      events.push({...base,kind:'opening',quantity:row.quantity,
        unitCost:row.unitCost,costCurrency:row.currency,
        ...(input.fxByMovementId?.[id]?{fx:input.fxByMovementId[id]}:{})});
    }else if(row.type==='issue'){
      if(amount>0n)refuse('An inventory issue must decrease stock.');
      invoiceIssue(row,input);
      events.push({...base,kind:'issue',quantity:row.quantity.slice(1)});
    }else{
      refuse('Unsupported reversal, return, adjustment or warehouse transfer requires a separate audited policy.');
    }
  }
  return calculateMovingWeightedAverage(scope,events);
}
