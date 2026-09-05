import type { InventoryMovementRecord, PurchaseRecord, Supplier, VaultPayload } from '../types.js';
import { isIsoDate } from '../lib/id.js';
import { decimalToScaled, isDecimalInput } from '../lib/money.js';
import { normalizeSavedItemIdentity } from '../lib/saved-items.js';
import { validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';
import { t } from '../lib/i18n.js';

type OperationalState=Pick<VaultPayload,'suppliers'|'purchases'|'expenses'|'inventoryMovements'|'savedItems'>;

function changed<T extends {id:string}>(before:T|undefined,after:T):boolean{return !before||before!==after;}
function normalizedName(value:string):string{return normalizeSavedItemIdentity(value||'');}
function supplierNames(supplier:Supplier):string[]{return [supplier.nameEn,supplier.nameAr].map(normalizedName).filter(Boolean);}
function purchaseNumber(value:string):string{return (value||'').normalize('NFKC').trim().toLocaleUpperCase();}
function purchaseStage(status:PurchaseRecord['status']):number{return status==='reversed'?2:status==='posted'?1:0;}
function movementQuantity(movement:InventoryMovementRecord):bigint|null{
  if(!isDecimalInput(movement.quantity))return null;
  const value=decimalToScaled(movement.quantity,4);
  return value===0n?null:value;
}
function movementIsManual(movement:InventoryMovementRecord):boolean{return movement.type==='opening'||movement.type==='issue'||movement.type==='adjustment';}
function recordEqual(left:unknown,right:unknown):boolean{return JSON.stringify(left)===JSON.stringify(right);}
function purchaseCommercialChanged(before:PurchaseRecord|undefined,purchase:PurchaseRecord):boolean{
  if(!before)return true;
  return before.number!==purchase.number||before.date!==purchase.date||before.currency!==purchase.currency||before.freight!==purchase.freight||before.duty!==purchase.duty||before.otherCosts!==purchase.otherCosts||before.notes!==purchase.notes||!recordEqual(before.supplierSnapshot,purchase.supplierSnapshot)||!recordEqual(before.items,purchase.items);
}
function itemCounts(items:Array<{savedItemId:string}>):Map<string,number>{
  const counts=new Map<string,number>();
  for(const item of items){const id=item.savedItemId?.trim();if(id)counts.set(id,(counts.get(id)??0)+1);}
  return counts;
}
function movementItemCounts(movements:InventoryMovementRecord[]):Map<string,number>{
  const counts=new Map<string,number>();
  for(const movement of movements){const id=movement.itemId?.trim();if(id)counts.set(id,(counts.get(id)??0)+1);}
  return counts;
}
function sameCounts(left:Map<string,number>,right:Map<string,number>):boolean{
  if(left.size!==right.size)return false;
  for(const [key,value] of left)if(right.get(key)!==value)return false;
  return true;
}

function guardSupplierChanges(base:VaultPayload,intended:VaultPayload,merged:OperationalState):void{
  if(intended.suppliers===base.suppliers)return;
  const baseById=new Map(base.suppliers.map(item=>[item.id,item]));
  const intendedById=new Map(intended.suppliers.map(item=>[item.id,item]));
  for(const supplier of intended.suppliers){
    const before=baseById.get(supplier.id);
    if(!changed(before,supplier))continue;
    const errors=validateSupplier(supplier);if(errors.length)throw new Error(errors[0]);
    const names=supplierNames(supplier);
    const namesChanged=!before||!recordEqual(supplierNames(before),names);
    if(namesChanged&&merged.suppliers.some(other=>other.id!==supplier.id&&supplierNames(other).some(name=>names.includes(name))))throw new Error(t('This supplier already exists. Open the existing supplier to edit it.','هذا المورد موجود بالفعل. افتح المورد الموجود لتعديله.'));
  }
  for(const supplier of base.suppliers){
    if(intendedById.has(supplier.id))continue;
    if(merged.expenses.some(expense=>expense.supplierId===supplier.id))throw new Error(t('This supplier is still referenced by an expense and cannot be deleted.','هذا المورد ما زال مرتبطًا بمصروف ولا يمكن حذفه.'));
  }
}

function guardExpenseChanges(base:VaultPayload,intended:VaultPayload,merged:OperationalState):void{
  if(intended.expenses===base.expenses)return;
  const baseById=new Map(base.expenses.map(item=>[item.id,item]));
  const supplierIds=new Set(merged.suppliers.map(item=>item.id));
  for(const expense of intended.expenses){
    const before=baseById.get(expense.id);if(!changed(before,expense))continue;
    const errors=validateExpense(expense);if(errors.length)throw new Error(errors[0]);
    if(expense.supplierId&&!supplierIds.has(expense.supplierId))throw new Error(t('The selected supplier no longer exists.','المورد المحدد لم يعد موجودًا.'));
  }
}

function affectedPurchaseIds(base:VaultPayload,intended:VaultPayload):Set<string>{
  const ids=new Set<string>();
  if(intended.purchases!==base.purchases){
    const baseById=new Map(base.purchases.map(item=>[item.id,item]));
    const intendedById=new Map(intended.purchases.map(item=>[item.id,item]));
    for(const purchase of intended.purchases){const before=baseById.get(purchase.id);if(changed(before,purchase))ids.add(purchase.id);}
    for(const purchase of base.purchases)if(!intendedById.has(purchase.id))ids.add(purchase.id);
  }
  if(intended.inventoryMovements!==base.inventoryMovements){
    const baseById=new Map(base.inventoryMovements.map(item=>[item.id,item]));
    const intendedById=new Map(intended.inventoryMovements.map(item=>[item.id,item]));
    for(const movement of intended.inventoryMovements){
      const before=baseById.get(movement.id);if(!changed(before,movement))continue;
      for(const candidate of [before,movement])if(candidate&&(candidate.type==='purchase'||candidate.type==='purchase-reversal')&&candidate.sourceId)ids.add(candidate.sourceId);
    }
    for(const movement of base.inventoryMovements)if(!intendedById.has(movement.id)&&(movement.type==='purchase'||movement.type==='purchase-reversal')&&movement.sourceId)ids.add(movement.sourceId);
  }
  return ids;
}

function guardPurchaseChanges(base:VaultPayload,intended:VaultPayload,latest:VaultPayload,merged:OperationalState):void{
  const baseById=new Map(base.purchases.map(item=>[item.id,item]));
  const intendedById=new Map(intended.purchases.map(item=>[item.id,item]));
  const latestById=new Map(latest.purchases.map(item=>[item.id,item]));
  if(intended.purchases!==base.purchases){
    for(const purchase of intended.purchases){
      const before=baseById.get(purchase.id);if(!changed(before,purchase))continue;
      const latestPurchase=latestById.get(purchase.id);
      if(before&&latestPurchase&&purchaseStage(latestPurchase.status)>purchaseStage(before.status)&&purchaseStage(purchase.status)<purchaseStage(latestPurchase.status))throw new Error(t('This purchase changed on another device. Reload before editing it.','تم تغيير عملية الشراء على جهاز آخر. حدّث البيانات قبل تعديلها.'));
      const commercialChanged=purchaseCommercialChanged(before,purchase);
      if(commercialChanged){const errors=validatePurchase(purchase,merged.savedItems);if(errors.length)throw new Error(errors[0]);}
      if(before){
        if(purchaseStage(purchase.status)<purchaseStage(before.status))throw new Error(t('Purchase status cannot move backwards.','لا يمكن إعادة حالة الشراء إلى مرحلة سابقة.'));
        if(before.status==='draft'&&purchase.status==='reversed')throw new Error(t('A draft purchase cannot be reversed before posting.','لا يمكن عكس مسودة شراء قبل ترحيلها.'));
        if(before.status==='posted'&&purchase.status==='posted'&&commercialChanged)throw new Error(t('Posted purchases are read-only. Reverse the purchase instead of editing it.','المشتريات المرحلة للقراءة فقط. اعكس الشراء بدل تعديله.'));
        if(before.status==='posted'&&purchase.status==='reversed'&&commercialChanged)throw new Error(t('A purchase cannot be edited while it is being reversed.','لا يمكن تعديل الشراء أثناء عكسه.'));
        if(before.status==='reversed'&&!recordEqual(before,purchase))throw new Error(t('Reversed purchases are read-only.','المشتريات المعكوسة للقراءة فقط.'));
      }
      const number=purchaseNumber(purchase.number);
      if(number&&(!before||purchaseNumber(before.number)!==number)&&merged.purchases.some(other=>other.id!==purchase.id&&purchaseNumber(other.number)===number))throw new Error(t('Purchase number already exists.','رقم الشراء مستخدم بالفعل.'));
    }
    for(const before of base.purchases){
      if(intendedById.has(before.id))continue;
      const latestPurchase=latestById.get(before.id);
      if(latestPurchase&&(latestPurchase.status!==before.status||latestPurchase.updatedAt!==before.updatedAt))throw new Error(t('This purchase changed on another device and cannot be deleted from stale data.','تم تغيير عملية الشراء على جهاز آخر ولا يمكن حذفها من بيانات قديمة.'));
    }
  }

  for(const purchaseId of affectedPurchaseIds(base,intended)){
    const purchase=merged.purchases.find(item=>item.id===purchaseId);
    const generated=merged.inventoryMovements.filter(movement=>movement.sourceId===purchaseId&&(movement.type==='purchase'||movement.type==='purchase-reversal'));
    if(!purchase){if(generated.length)throw new Error(t('Purchase inventory history cannot remain without its source purchase.','لا يمكن أن يبقى سجل مخزون شراء بدون عملية الشراء الأصلية.'));continue;}
    const receipts=generated.filter(movement=>movement.type==='purchase');
    const reversals=generated.filter(movement=>movement.type==='purchase-reversal');
    const expected=itemCounts(purchase.items);
    if(purchase.status==='draft'&&(receipts.length||reversals.length))throw new Error(t('Draft purchases cannot have posted inventory movements.','لا يمكن لمسودة الشراء أن تحتوي على حركات مخزون مرحلة.'));
    if(purchase.status==='posted'&&(!sameCounts(expected,movementItemCounts(receipts))||reversals.length))throw new Error(t('Purchase inventory receipt history is inconsistent. Reload before continuing.','سجل استلام مخزون الشراء غير متطابق. حدّث البيانات قبل المتابعة.'));
    if(purchase.status==='reversed'&&(!sameCounts(expected,movementItemCounts(receipts))||!sameCounts(expected,movementItemCounts(reversals))))throw new Error(t('Purchase reversal history is inconsistent. Reload before continuing.','سجل عكس الشراء غير متطابق. حدّث البيانات قبل المتابعة.'));
  }
}

function guardInventoryChanges(base:VaultPayload,intended:VaultPayload,merged:OperationalState):void{
  if(intended.inventoryMovements===base.inventoryMovements)return;
  const baseById=new Map(base.inventoryMovements.map(item=>[item.id,item]));
  const intendedById=new Map(intended.inventoryMovements.map(item=>[item.id,item]));
  const itemIds=new Set(merged.savedItems.map(item=>item.id));
  for(const before of base.inventoryMovements)if(!intendedById.has(before.id))throw new Error(t('Inventory ledger history is append-only and cannot be deleted.','سجل المخزون تراكمي ولا يمكن حذف حركاته التاريخية.'));
  for(const movement of intended.inventoryMovements){
    const before=baseById.get(movement.id);
    if(before){if(!recordEqual(before,movement))throw new Error(t('Existing inventory movements are read-only. Reverse them instead of editing them.','حركات المخزون الحالية للقراءة فقط. اعكس الحركة بدل تعديلها.'));continue;}
    const quantity=movementQuantity(movement);if(quantity===null)throw new Error(t('Inventory movement quantity must be a non-zero number.','يجب أن تكون كمية حركة المخزون رقمًا غير صفري.'));
    if(!isIsoDate(movement.date))throw new Error(t('Inventory movement date is invalid.','تاريخ حركة المخزون غير صالح.'));
    if(!movement.itemId||!itemIds.has(movement.itemId))throw new Error(t('Saved item not found for this inventory movement.','لم يتم العثور على الصنف المحفوظ لهذه الحركة.'));
    if(movement.unitCost&&(!isDecimalInput(movement.unitCost)||decimalToScaled(movement.unitCost,4)<0n))throw new Error(t('Inventory unit cost must be zero or greater.','يجب أن تكون تكلفة وحدة المخزون صفرًا أو أكثر.'));
    if(movement.unitCost&&!movement.currency.trim())throw new Error(t('Choose a currency when recording inventory unit cost.','اختر عملة عند تسجيل تكلفة وحدة المخزون.'));
    if(movement.type==='opening'&&quantity<0n)throw new Error(t('Opening stock must be positive.','يجب أن يكون الرصيد الافتتاحي موجبًا.'));
    if(movement.type==='issue'&&quantity>0n)throw new Error(t('Stock issues must reduce inventory.','يجب أن يؤدي إخراج المخزون إلى خفض الرصيد.'));
    if(movement.type==='purchase'||movement.type==='purchase-reversal')continue;
    if(movement.type==='adjustment'&&movement.sourceId){
      const original=merged.inventoryMovements.find(item=>item.id===movement.sourceId);
      if(!original||!movementIsManual(original))throw new Error(t('Manual reversal source movement was not found.','لم يتم العثور على الحركة الأصلية المطلوب عكسها.'));
      const originalQuantity=movementQuantity(original);
      if(originalQuantity===null||movement.itemId!==original.itemId||quantity!==-originalQuantity)throw new Error(t('Manual inventory reversal does not exactly offset the source movement.','عكس حركة المخزون اليدوية لا يعادل الحركة الأصلية بالكامل.'));
      const reversals=merged.inventoryMovements.filter(item=>item.type==='adjustment'&&item.sourceId===original.id);
      if(reversals.length!==1)throw new Error(t('This manual inventory movement has already been reversed on another device.','تم عكس حركة المخزون اليدوية هذه بالفعل على جهاز آخر.'));
    }
  }
}

function guardSavedItemCostConcurrency(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):void{
  if(intended.savedItems===base.savedItems)return;
  const baseById=new Map(base.savedItems.map(item=>[item.id,item]));
  const latestById=new Map(latest.savedItems.map(item=>[item.id,item]));
  for(const item of intended.savedItems){
    const before=baseById.get(item.id);const current=latestById.get(item.id);
    if(!before||!current)continue;
    const intendedCost=[item.lastUnitCost??'',item.lastCostCurrency??''];
    const baseCost=[before.lastUnitCost??'',before.lastCostCurrency??''];
    const latestCost=[current.lastUnitCost??'',current.lastCostCurrency??''];
    const intendedChanged=!recordEqual(intendedCost,baseCost);
    const latestChanged=!recordEqual(latestCost,baseCost);
    if(intendedChanged&&latestChanged&&!recordEqual(intendedCost,latestCost))throw new Error(t('This item cost changed on another device. Reload before posting or changing its cost.','تم تغيير تكلفة هذا الصنف على جهاز آخر. حدّث البيانات قبل الترحيل أو تغيير التكلفة.'));
  }
}

function guardSavedItemHistory(base:VaultPayload,intended:VaultPayload,merged:OperationalState):void{
  if(intended.savedItems===base.savedItems)return;
  const intendedIds=new Set(intended.savedItems.map(item=>item.id));
  for(const item of base.savedItems){
    if(intendedIds.has(item.id))continue;
    if(merged.inventoryMovements.some(movement=>movement.itemId===item.id)||merged.purchases.some(purchase=>purchase.items.some(line=>line.savedItemId===item.id)))throw new Error(t('This item gained purchase or inventory history on another device and cannot be deleted.','اكتسب هذا الصنف سجل مشتريات أو مخزون على جهاز آخر ولا يمكن حذفه.'));
  }
}

export function guardOperationsMerge(base:VaultPayload,intended:VaultPayload,latest:VaultPayload,merged:OperationalState):void{
  guardSupplierChanges(base,intended,merged);
  guardExpenseChanges(base,intended,merged);
  guardSavedItemCostConcurrency(base,intended,latest);
  guardSavedItemHistory(base,intended,merged);
  guardInventoryChanges(base,intended,merged);
  guardPurchaseChanges(base,intended,latest,merged);
}
