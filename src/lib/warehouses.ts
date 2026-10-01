import type { BranchRecord, InventoryMovementRecord, SavedItem, WarehouseRecord } from '../types.js';
import { decimalToScaled, isDecimalInput } from './money.js';
import { makeId, todayIso } from './id.js';

const QTY_DECIMALS=4;
function scaled(value:string):bigint{return decimalToScaled(value||'0',QTY_DECIMALS);}
function fixed(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value,scale=10n**BigInt(QTY_DECIMALS);return `${sign}${abs/scale}.${(abs%scale).toString().padStart(QTY_DECIMALS,'0')}`.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');}

export function defaultWarehouseId(branchId:string):string{return `warehouse-${branchId||'main'}`;}
export function defaultWarehouseForBranch(branch:BranchRecord):WarehouseRecord{
  const now=branch.createdAt||new Date().toISOString();
  return{id:defaultWarehouseId(branch.id),workspaceId:branch.workspaceId,branchId:branch.id,name:branch.name||'Primary Location',code:(branch.code||'MAIN').toUpperCase(),active:true,createdAt:now,updatedAt:branch.updatedAt||now};
}
export function createWarehouse(workspaceId:string,branchId:string,name='Warehouse',code='WH'):WarehouseRecord{
  const now=new Date().toISOString();
  return{id:makeId('warehouse'),workspaceId,branchId,name:name.trim()||'Warehouse',code:code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,12)||'WH',active:true,createdAt:now,updatedAt:now};
}
export function validateWarehouse(warehouse:WarehouseRecord,all:WarehouseRecord[]=[]):string[]{
  const errors:string[]=[];if(!warehouse.name.trim())errors.push('Warehouse name is required.');if(!warehouse.code.trim())errors.push('Warehouse code is required.');
  if(all.some(item=>item.id!==warehouse.id&&item.workspaceId===warehouse.workspaceId&&item.branchId===warehouse.branchId&&item.code.toUpperCase()===warehouse.code.toUpperCase()))errors.push('Warehouse code already exists in this branch.');
  return errors;
}

export function movementLocationDelta(movement:InventoryMovementRecord,warehouseId:string,defaultId:string):bigint{
  if(movement.type==='transfer'){
    const qty=scaled(movement.quantity);let delta=0n;if((movement.fromWarehouseId||defaultId)===warehouseId)delta-=qty<0n?-qty:qty;if((movement.toWarehouseId||defaultId)===warehouseId)delta+=qty<0n?-qty:qty;return delta;
  }
  const qty=scaled(movement.quantity);if(qty===0n)return 0n;
  const target=qty>0n?(movement.toWarehouseId||defaultId):(movement.fromWarehouseId||defaultId);
  return target===warehouseId?qty:0n;
}

export interface WarehouseBalance {warehouseId:string;item:SavedItem;quantity:string;quantityScaled:bigint;}
export function warehouseBalances(items:SavedItem[],movements:InventoryMovementRecord[],warehouses:WarehouseRecord[],defaultId:string):WarehouseBalance[]{
  const rows:WarehouseBalance[]=[];
  for(const warehouse of warehouses){for(const item of items){let quantity=0n;for(const movement of movements)if(movement.itemId===item.id)quantity+=movementLocationDelta(movement,warehouse.id,defaultId);rows.push({warehouseId:warehouse.id,item,quantity:fixed(quantity),quantityScaled:quantity});}}
  return rows;
}
export function warehouseItemQuantity(itemId:string,warehouseId:string,movements:InventoryMovementRecord[],defaultId:string):bigint{return movements.filter(item=>item.itemId===itemId).reduce((sum,item)=>sum+movementLocationDelta(item,warehouseId,defaultId),0n);}

export function createWarehouseTransfer(item:SavedItem,fromWarehouseId:string,toWarehouseId:string,quantity:string,date=todayIso(),note=''):InventoryMovementRecord{
  if(!fromWarehouseId||!toWarehouseId||fromWarehouseId===toWarehouseId)throw new Error('Choose different source and destination locations.');
  if(!isDecimalInput(quantity)||scaled(quantity)<=0n)throw new Error('Transfer quantity must be greater than zero.');
  const now=new Date().toISOString();
  return{id:makeId('stock'),itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku||'',date,type:'transfer',quantity:fixed(scaled(quantity)),unitCost:item.lastUnitCost||'',currency:item.lastCostCurrency||'',sourceId:'',sourceNumber:'',note:note.trim(),fromWarehouseId,toWarehouseId,createdAt:now};
}

export function canArchiveWarehouse(warehouseId:string,items:SavedItem[],movements:InventoryMovementRecord[],defaultId:string):boolean{return items.every(item=>warehouseItemQuantity(item.id,warehouseId,movements,defaultId)===0n);}
