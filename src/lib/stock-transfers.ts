import type { BranchRecord, InventoryMovementRecord, InventoryTransferRecord, SavedItem } from '../types.js';
import { isIsoDate, makeId } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

export function branchItemQuantityScaled(itemId:string,workspaceId:string,branchId:string,movements:InventoryMovementRecord[]):bigint{
  let total=0n;for(const movement of movements){if(movement.itemId!==itemId||String(movement.workspaceId||'default')!==workspaceId||String(movement.branchId||'main')!==branchId)continue;total+=decimalToScaled(movement.quantity,4);}return total;
}

export function createInventoryTransfer(input:{workspaceId:string;fromBranchId:string;toBranchId:string;item:SavedItem;quantity:string;date:string;note?:string},branches:BranchRecord[],movements:InventoryMovementRecord[]):{transfer:InventoryTransferRecord;movements:InventoryMovementRecord[]}{
  const {workspaceId,fromBranchId,toBranchId,item}=input;if(!workspaceId||fromBranchId===toBranchId)throw new Error('Choose two different stock locations.');
  const from=branches.find(branch=>branch.workspaceId===workspaceId&&branch.id===fromBranchId&&branch.active),to=branches.find(branch=>branch.workspaceId===workspaceId&&branch.id===toBranchId&&branch.active);if(!from||!to)throw new Error('Stock transfer location was not found or is inactive.');
  if(!isIsoDate(input.date))throw new Error('Transfer date is invalid.');if(!isNonNegativeDecimalInput(input.quantity)||decimalToScaled(input.quantity,4)<=0n)throw new Error('Transfer quantity must be greater than zero.');
  const quantity=decimalToScaled(input.quantity,4),available=branchItemQuantityScaled(item.id,workspaceId,fromBranchId,movements);if(quantity>available)throw new Error('Transfer quantity exceeds stock available at the source location.');
  const now=new Date().toISOString(),id=makeId('stock-transfer'),transfer:InventoryTransferRecord={id,workspaceId,fromBranchId,toBranchId,itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku||'',quantity:input.quantity,date:input.date,note:(input.note||'').trim(),createdAt:now};
  const shared={itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku||'',date:input.date,unitCost:item.lastUnitCost||'',currency:(item.lastCostCurrency||item.lastCurrency||'').toUpperCase(),sourceId:id,sourceNumber:`TRANSFER-${id.slice(-8).toUpperCase()}`,note:transfer.note,createdAt:now,transferId:id,fromBranchId,toBranchId,workspaceId};
  const out:InventoryMovementRecord={id:makeId('movement'),...shared,branchId:fromBranchId,type:'transfer-out',quantity:`-${input.quantity}`};
  const incoming:InventoryMovementRecord={id:makeId('movement'),...shared,branchId:toBranchId,type:'transfer-in',quantity:input.quantity};
  return{transfer,movements:[out,incoming]};
}
