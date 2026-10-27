import type {InventoryMovementRecord,PurchaseRecord} from '../types.js';
import {isIsoDate} from './id.js';
import {decimalToScaled,isExactStockQuantityInput,normalizeDecimalInput} from './money.js';
import {
  calculateMovingWeightedAverage,
  type MovingAverageEvent,type MovingAverageScope
} from './inventory-moving-average.js';

/** Prospective isolated accounting PREVIEW, not a purchase posting or journal.
 * All earlier dated events must already have approved independent provenance.
 * For now this preview is intentionally same-functional-currency only.
 */
export interface PurchaseReversalValuationInput {
  scope:MovingAverageScope;
  previousEvents:readonly MovingAverageEvent[];
  purchase:PurchaseRecord;
  originalReceipt:InventoryMovementRecord;
  reversalMovement:InventoryMovementRecord;
}
export interface PurchaseReversalValuationPreview {
  originalReceiptId:string;
  reversalMovementId:string;
  currency:string;
  reversedQuantity:string;
  balanceQuantityBefore:string;
  balanceQuantityAfter:string;
  carryingValueBefore:string;
  carryingValueAfter:string;
  carryingValueRemoved:string;
  originalReceiptLandedValue:string;
  /** Original supplier-side cost less the current carrying value leaving stock.
   * This is NOT an automatically approved price-variance journal. */
  unresolvedReconciliationDifference:string;
  requiresSeparateFinancialReconciliation:boolean;
  priorSalesCostOfGoodsSold:string;
}
const QTY_SCALE=10_000n;
const VALUE_SCALE=1_000_000_000_000n;
function refuse(reason:string):never{throw new Error('ALIF_22_PURCHASE_REVERSAL_NOT_READY: '+reason);}
function round(value:bigint,divisor:bigint):bigint{
  if(divisor<=0n)refuse('Invalid decimal divisor.');
  const sign=value<0n?-1n:1n,abs=value<0n?-value:value;
  return sign*((abs+divisor/2n)/divisor);
}
function fixed(value:bigint,decimals:number):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value,scale=10n**BigInt(decimals);
  return sign+(abs/scale).toString()+'.'+(abs%scale).toString().padStart(decimals,'0');
}
function exactQty(value:string):bigint{
  if(!isExactStockQuantityInput(value))refuse('Stock quantity must be exact within four decimals.');
  const n=decimalToScaled(value,4);
  if(n===0n)refuse('Zero stock reversal is invalid.');
  return n;
}
function exactUnitCost(value:string):bigint{
  const normalized=normalizeDecimalInput(value);
  if(!/^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/.test(normalized))
    refuse('Original landed receipt cost must be an exact, non-negative twelve-decimal value.');
  return decimalToScaled(normalized,12);
}
function scopeMatches(row:{workspaceId?:string;branchId?:string},scope:MovingAverageScope):boolean{
  return row.workspaceId===scope.workspaceId&&row.branchId===scope.branchId;
}

/** A purchase reversal cannot silently debit stock at the ORIGINAL supplier
 * rate if the moving average has changed. The output exposes the variance,
 * but NEVER books it or alters the posted purchase/AR/AP/COGS/history.
 */
export function previewMovingAveragePurchaseReversal(input:PurchaseReversalValuationInput):PurchaseReversalValuationPreview{
  const {scope,purchase,originalReceipt,reversalMovement,previousEvents}=input;
  const currency=scope.functionalCurrency.trim().toUpperCase();
  if(!scope.workspaceId?.trim()||!scope.branchId?.trim()
    ||!scope.itemId?.trim()||!scope.warehouseId?.trim()||!/^[A-Z]{3}$/.test(currency))
    refuse('Complete valued inventory scope and functional currency are required.');
  if(purchase.status!=='reversed'||!purchase.reversedAt?.trim()
    ||!purchase.reverseReason?.trim()||!isIsoDate(purchase.date))
    refuse('Only a documented, finalized purchase reversal may be valued.');
  if(!scopeMatches(purchase,scope)||!scopeMatches(originalReceipt,scope)
    ||!scopeMatches(reversalMovement,scope))
    refuse('Purchase and movements must belong to the same company and branch.');
  if(purchase.currency.trim().toUpperCase()!==currency
    ||originalReceipt.currency.trim().toUpperCase()!==currency
    ||reversalMovement.currency.trim().toUpperCase()!==currency)
    refuse('Foreign-currency reversals need separately approved FX/journal policy.');
  if(originalReceipt.type!=='purchase'||reversalMovement.type!=='purchase-reversal'
    ||!originalReceipt.id.trim()||!reversalMovement.id.trim()
    ||originalReceipt.id===reversalMovement.id)
    refuse('An immutable original receipt and distinct reversal identity are required.');
  if(originalReceipt.itemId!==scope.itemId||reversalMovement.itemId!==scope.itemId
    ||originalReceipt.sourceId!==purchase.id||reversalMovement.sourceId!==purchase.id
    ||originalReceipt.sourceNumber!==purchase.number
    ||reversalMovement.sourceNumber!==purchase.number
    ||originalReceipt.sku!==reversalMovement.sku
    ||reversalMovement.note.trim()!==purchase.reverseReason.trim())
    refuse('Reversal and original receipt provenance do not reconcile to the purchase.');
  if(!isIsoDate(originalReceipt.date)||!isIsoDate(reversalMovement.date)
    ||originalReceipt.date!==purchase.date||reversalMovement.date<purchase.date)
    refuse('Reversal must follow its dated original purchase.');
  const originWarehouse=originalReceipt.toWarehouseId||'warehouse-'+scope.branchId;
  const reverseWarehouse=reversalMovement.fromWarehouseId||'warehouse-'+scope.branchId;
  if(originWarehouse!==scope.warehouseId||reverseWarehouse!==scope.warehouseId
    ||originalReceipt.fromWarehouseId||reversalMovement.toWarehouseId)
    refuse('Warehouse-specific purchase reversal requires the original receiving location.');
  const lineMatches=purchase.items.filter(item=>item.savedItemId===scope.itemId);
  if(lineMatches.length!==1)
    refuse('Ambiguous or missing purchase item source line.');
  const line=lineMatches[0]!;
  const sourceQty=exactQty(line.quantity),receivedQty=exactQty(originalReceipt.quantity);
  const returnQty=exactQty(reversalMovement.quantity);
  if(sourceQty<=0n||receivedQty!==sourceQty||returnQty!==-sourceQty)
    refuse('Purchase and reversal quantities differ or reversal is not exact.');
  const historicalUnitCost=exactUnitCost(line.landedUnitCost||line.unitCost);
  if(!line.landedUnitCost?.trim()||historicalUnitCost!==exactUnitCost(originalReceipt.unitCost)
    ||historicalUnitCost!==exactUnitCost(reversalMovement.unitCost))
    refuse('Original purchased landed cost differs from immutable receipt/reversal proof.');
  if(previousEvents.length&&previousEvents[previousEvents.length-1]!.date>reversalMovement.date)
    refuse('Reversal predates a previously valued event.');
  if(previousEvents.some(event=>event.id===reversalMovement.id))
    refuse('Reversal is already included in prior valuation.');
  const receiptEvents=previousEvents.filter(event=>event.id===originalReceipt.id);
  if(receiptEvents.length!==1||receiptEvents[0]!.kind!=='receipt'
    ||exactQty(receiptEvents[0]!.quantity)!==sourceQty
    ||receiptEvents[0]!.costCurrency?.trim().toUpperCase()!==currency
    ||exactUnitCost(receiptEvents[0]!.unitCost??'')!==historicalUnitCost
    ||receiptEvents[0]!.date!==originalReceipt.date)
    refuse('The actual purchase receipt is absent or mismatched in historical valuation.');
  const before=calculateMovingWeightedAverage(scope,previousEvents);
  if(decimalToScaled(before.balanceQuantity,4)<sourceQty)
    refuse('Cannot reverse more valued stock than remains at receiving warehouse.');
  // A stock-decrease engine event supplies a reliable WAC amount. Its simulated
  // COGS is NOT a sales journal and is never persisted or returned as sales COGS.
  const simulation:MovingAverageEvent={
    id:'preview:purchase-reversal:'+reversalMovement.id,
    sequence:previousEvents.length?previousEvents[previousEvents.length-1]!.sequence+1:0,
    kind:'issue',quantity:fixed(sourceQty,4),date:reversalMovement.date,
    workspaceId:scope.workspaceId,branchId:scope.branchId,
    itemId:scope.itemId,warehouseId:scope.warehouseId
  };
  const after=calculateMovingWeightedAverage(scope,[...previousEvents,simulation]);
  const beforeValue=decimalToScaled(before.balanceValue,12);
  const afterValue=decimalToScaled(after.balanceValue,12);
  const carryingValueRemoved=beforeValue-afterValue;
  const originalReceiptLandedValue=round(sourceQty*historicalUnitCost,QTY_SCALE);
  const difference=originalReceiptLandedValue-carryingValueRemoved;
  if(carryingValueRemoved<0n||afterValue<0n
    ||decimalToScaled(before.balanceQuantity,4)-sourceQty!==decimalToScaled(after.balanceQuantity,4))
    refuse('Valuation conservation failed.');
  return {
    originalReceiptId:originalReceipt.id,reversalMovementId:reversalMovement.id,currency,
    reversedQuantity:fixed(sourceQty,4),
    balanceQuantityBefore:before.balanceQuantity,balanceQuantityAfter:after.balanceQuantity,
    carryingValueBefore:before.balanceValue,carryingValueAfter:after.balanceValue,
    carryingValueRemoved:fixed(carryingValueRemoved,12),
    originalReceiptLandedValue:fixed(originalReceiptLandedValue,12),
    unresolvedReconciliationDifference:fixed(difference,12),
    requiresSeparateFinancialReconciliation:difference!==0n,
    priorSalesCostOfGoodsSold:before.costOfGoodsSold
  };
}
