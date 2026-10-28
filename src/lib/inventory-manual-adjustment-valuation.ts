import type {InventoryMovementRecord} from '../types.js';
import {decimalToScaled,isExactStockQuantityInput} from './money.js';
import {isIsoDate} from './id.js';
import {validateManualMovementEvidence} from './inventory-evidence.js';
import {calculateMovingWeightedAverage,type MovingAverageEvent,type MovingAverageScope} from './inventory-moving-average.js';

/** Read-only financial QA: this never posts inventory or journals. */
export function previewManualStockAdjustment(scope:MovingAverageScope,
  history:readonly MovingAverageEvent[],row:InventoryMovementRecord){
  const fail=(s:string):never=>{throw new Error('ALIF_22_ADJUSTMENT_NOT_READY: '+s);};
  if(!scope.workspaceId||!scope.branchId||!scope.itemId||!scope.warehouseId)
    fail('Complete scope required.');
  if(row.type!=='adjustment'||!row.id||!isIsoDate(row.date)||row.sourceId)
    fail('Manual adjustment requires a new unique dated movement.');
  if(row.itemId!==scope.itemId||row.branchId!==scope.branchId
    ||row.workspaceId!==scope.workspaceId)
    fail('Movement scope does not match.');
  if(!isExactStockQuantityInput(row.quantity))fail('Invalid precise quantity.');
  const amount=decimalToScaled(row.quantity,4),positive=amount>0n;
  if(!amount)fail('Zero adjustment.');
  // An absent direction-specific field means the legacy default warehouse.
  // However, an opposite-direction field cannot serve as cost provenance,
  // even if the fallback location happens to be that same default warehouse.
  const expectedWarehouse=positive?row.toWarehouseId:row.fromWarehouseId;
  const wrongDirectionWarehouse=positive?row.fromWarehouseId:row.toWarehouseId;
  const location=expectedWarehouse||'warehouse-'+scope.branchId;
  if(location!==scope.warehouseId||wrongDirectionWarehouse)
    fail('Wrong warehouse or movement direction.');
  try{validateManualMovementEvidence(row);}catch{fail('Evidence, reason or operator missing.');}
  if(history.some(e=>e.id===row.id)||history.length&&history.at(-1)!.date>row.date)
    fail('Duplicate or out-of-order movement.');
  if(row.currency.toUpperCase()!==scope.functionalCurrency.toUpperCase())
    fail('Currency adjustment requires documented FX policy.');
  const before=calculateMovingWeightedAverage(scope,history);
  const qty=amount<0n?-amount:amount;
  if(!positive&&qty>decimalToScaled(before.balanceQuantity,4))
    fail('Insufficient stock to adjust.');
  if(positive&&!/^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/.test(row.unitCost.trim()))
    fail('Positive adjustment needs an explicitly documented unit cost.');
  const q=(qty/10000n).toString()+'.'+(qty%10000n).toString().padStart(4,'0');
  const event:MovingAverageEvent={
    id:'qa-adjust:'+row.id,kind:positive?'receipt':'issue',
    sequence:history.length?history.at(-1)!.sequence+1:0,date:row.date,
    workspaceId:scope.workspaceId,branchId:scope.branchId,
    warehouseId:scope.warehouseId,itemId:scope.itemId,quantity:q,
    ...(positive?{unitCost:row.unitCost,costCurrency:row.currency}:{})
  };
  const after=calculateMovingWeightedAverage(scope,[...history,event]);
  const delta=decimalToScaled(after.balanceValue,12)-decimalToScaled(before.balanceValue,12);
  const abs=delta<0n?-delta:delta;
  const value=(delta<0n?'-':'')+(abs/1000000000000n).toString()+'.'+
    (abs%1000000000000n).toString().padStart(12,'0');
  return {movementId:row.id,direction:positive?'increase':'decrease',
    quantity:q,currency:before.currency,valueChange:value,
    beforeQuantity:before.balanceQuantity,afterQuantity:after.balanceQuantity,
    beforeValue:before.balanceValue,afterValue:after.balanceValue,
    previousSalesCOGS:before.costOfGoodsSold,requiresSeparateJournal:true};
}
