import type {InventoryMovementRecord} from '../types.js';
import {isIsoDate} from './id.js';
import {decimalToScaled,isExactStockQuantityInput} from './money.js';
import {
  calculateMovingWeightedAverage,
  type MovingAverageEvent,type MovingAverageResult,type MovingAverageScope
} from './inventory-moving-average.js';

/**
 * Alif 22: ONE read-only, prospective warehouse-transfer valuation simulation.
 * No write to purchase, sale, transfer or GL ledgers. Previous warehouse events
 * must already be complete, auditable and supported by the single-location model.
 */
export interface WarehouseTransferValuationInput {
  fromScope:MovingAverageScope;
  toScope:MovingAverageScope;
  fromEvents:readonly MovingAverageEvent[];
  toEvents:readonly MovingAverageEvent[];
  movement:InventoryMovementRecord;
  /** Known posted transfer identities from a separately verified history. */
  earlierTransferIds?:readonly string[];
}
export interface ValuedWarehousePosition {
  warehouseId:string;
  quantity:string;
  carryingValue:string;
  averageUnitCost:string;
  /** Sales COGS produced before transfer; this transfer changes none of it. */
  preTransferCostOfGoodsSold:string;
}
export interface WarehouseTransferValuationResult {
  transferId:string;
  date:string;
  currency:string;
  transferredQuantity:string;
  transferredCarryingValue:string;
  from:ValuedWarehousePosition;
  to:ValuedWarehousePosition;
  combinedCarryingValueBefore:string;
  combinedCarryingValueAfter:string;
}
const QUANTITY_SCALE=10_000n;
function stop(reason:string):never{throw new Error('ALIF_22_TRANSFER_NOT_READY: '+reason);}
function format(value:bigint,decimals:number):string{
  const sign=value<0n?'-':'',abs=value<0n?-value:value,scale=10n**BigInt(decimals);
  return sign+(abs/scale).toString()+'.'+(abs%scale).toString().padStart(decimals,'0');
}
function round(value:bigint,denominator:bigint):bigint{
  if(denominator<=0n)stop('Unvalued source inventory.');
  const sign=value<0n?-1n:1n,abs=value<0n?-value:value;
  return sign*((abs+denominator/2n)/denominator);
}
function position(result:MovingAverageResult):{quantity:bigint;value:bigint}{
  const quantity=result.balanceQuantity,value=result.balanceValue;
  if(!/^\d+\.\d{4}$/.test(quantity)||!/^\d+\.\d{12}$/.test(value))
    stop('A valid and fully valued prior warehouse position is required.');
  const q=decimalToScaled(quantity,4),v=decimalToScaled(value,12);
  if((q===0n)!==(v===0n))stop('Warehouse carrying value does not match stock quantity.');
  return {quantity:q,value:v};
}
function matchingScopes(from:MovingAverageScope,to:MovingAverageScope,row:InventoryMovementRecord):void{
  for(const field of ['workspaceId','branchId','itemId','functionalCurrency'] as const){
    const left=from[field],right=to[field];
    if(!left?.trim()||left!==right)stop('Warehouse transfer crosses an inventory identity or currency.');
  }
  if(!from.warehouseId.trim()||!to.warehouseId.trim()
    ||from.warehouseId===to.warehouseId)
    stop('Source and destination must be different warehouses.');
  if(row.workspaceId!==from.workspaceId||row.branchId!==from.branchId
    ||row.itemId!==from.itemId||row.fromWarehouseId!==from.warehouseId
    ||row.toWarehouseId!==to.warehouseId)
    stop('Physical movement does not match the verified source/destination scope.');
}
function snapshot(warehouseId:string,quantity:bigint,value:bigint,before:MovingAverageResult):ValuedWarehousePosition{
  return{
    warehouseId,quantity:format(quantity,4),carryingValue:format(value,12),
    averageUnitCost:format(quantity?round(value*QUANTITY_SCALE,quantity):0n,12),
    preTransferCostOfGoodsSold:before.costOfGoodsSold
  };
}

/** Value follows the actual goods, with exact cancellation between warehouses.
 * Each pre-transfer stream uses the previously tested prospective average
 * engine. Later transfers and full ledger continuity require a separate
 * authoritative chronological multi-location engine before production use.
 */
export function previewMovingAverageWarehouseTransfer(input:WarehouseTransferValuationInput):WarehouseTransferValuationResult{
  const {fromScope,toScope,movement}=input;
  if(!movement.id?.trim()||movement.type!=='transfer'||!isIsoDate(movement.date))
    stop('An identified, dated warehouse transfer is required.');
  matchingScopes(fromScope,toScope,movement);
  if(!isExactStockQuantityInput(movement.quantity)||decimalToScaled(movement.quantity,4)<=0n)
    stop('Transfer quantity must be an exact positive stock quantity.');
  if(input.earlierTransferIds?.includes(movement.id))
    stop('Transfer identity was already applied.');
  if([...input.fromEvents,...input.toEvents].some(row=>row.id===movement.id))
    stop('The transfer cannot also occur in an earlier valuation stream.');
  if(input.fromEvents.length&&input.fromEvents[input.fromEvents.length-1]!.date>movement.date
    ||input.toEvents.length&&input.toEvents[input.toEvents.length-1]!.date>movement.date)
    stop('Transfer predates an already recognized warehouse movement.');
  const fromBefore=calculateMovingWeightedAverage(fromScope,input.fromEvents);
  const toBefore=calculateMovingWeightedAverage(toScope,input.toEvents);
  if(fromBefore.currency!==toBefore.currency)
    stop('Different functional currencies cannot be transferred without an approved policy.');
  const source=position(fromBefore),destination=position(toBefore);
  const units=decimalToScaled(movement.quantity,4);
  if(units>source.quantity)stop('Insufficient valued stock in source warehouse.');
  const transferValue=units===source.quantity
    ?source.value:round(source.value*units,source.quantity);
  const fromQuantity=source.quantity-units,fromValue=source.value-transferValue;
  const toQuantity=destination.quantity+units,toValue=destination.value+transferValue;
  if(fromValue<0n||toValue<0n
    ||fromQuantity===0n&&fromValue!==0n
    ||source.value+destination.value!==fromValue+toValue)
    stop('Transfer cannot conserve the full inventory carrying value.');
  return{
    transferId:movement.id,date:movement.date,currency:fromBefore.currency,
    transferredQuantity:format(units,4),transferredCarryingValue:format(transferValue,12),
    from:snapshot(fromScope.warehouseId,fromQuantity,fromValue,fromBefore),
    to:snapshot(toScope.warehouseId,toQuantity,toValue,toBefore),
    combinedCarryingValueBefore:format(source.value+destination.value,12),
    combinedCarryingValueAfter:format(fromValue+toValue,12)
  };
}
