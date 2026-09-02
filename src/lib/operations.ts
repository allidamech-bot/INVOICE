import type { ExpenseRecord, InventoryMovementRecord, InventoryMovementType, PurchaseRecord, SavedItem, Supplier, SupplierSnapshot } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isDecimalInput } from './money.js';

const SCALE4=10_000n;
const MONEY_SCALE=100n;
const PRODUCT_TO_CENTS=1_000_000n;

function roundDivide(value:bigint,divisor:bigint):bigint{
  if(divisor===0n)return 0n;
  const sign=(value<0n)!==(divisor<0n)?-1n:1n;
  const a=value<0n?-value:value;
  const b=divisor<0n?-divisor:divisor;
  return ((a+b/2n)/b)*sign;
}
function fixed(value:bigint,decimals:number):string{
  const sign=value<0n?'-':'';
  const abs=value<0n?-value:value;
  const scale=10n**BigInt(decimals);
  return `${sign}${abs/scale}.${(abs%scale).toString().padStart(decimals,'0')}`;
}
function trimFixed(value:string):string{return value.replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');}
function cents(value:string):bigint{return decimalToScaled(value,2);}
function lineCents(quantity:string,unitCost:string):bigint{return roundDivide(decimalToScaled(quantity,4)*decimalToScaled(unitCost,4),PRODUCT_TO_CENTS);}
function positive(value:string):boolean{return isDecimalInput(value)&&decimalToScaled(value,4)>0n;}
function nonNegative(value:string):boolean{return isDecimalInput(value)&&decimalToScaled(value,4)>=0n;}
function nowIso():string{return new Date().toISOString();}
function cleanCurrency(value:string,fallback='USD'):string{return value.trim().toUpperCase()||fallback;}

export function supplierSnapshotFrom(supplier:Supplier):SupplierSnapshot{
  return {
    sourceSupplierId:supplier.id,nameEn:supplier.nameEn,nameAr:supplier.nameAr,contactPerson:supplier.contactPerson,
    address:supplier.address,city:supplier.city,country:supplier.country,phone:supplier.phone,email:supplier.email,
    vatTaxNumber:supplier.vatTaxNumber,commercialRegistration:supplier.commercialRegistration
  };
}

export function createSupplier():Supplier{
  const at=nowIso();
  return {id:makeId('supplier'),createdAt:at,updatedAt:at,nameEn:'',nameAr:'',contactPerson:'',address:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',defaultCurrency:'USD',paymentTerms:'',notes:''};
}

export function validateSupplier(supplier:Supplier):string[]{
  const errors:string[]=[];
  if(!supplier.nameEn.trim()&&!supplier.nameAr.trim())errors.push('Supplier name is required.');
  if(supplier.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email.trim()))errors.push('Supplier email is invalid.');
  if(!supplier.defaultCurrency.trim())errors.push('Supplier currency is required.');
  return errors;
}

export function nextPurchaseNumber(purchases:PurchaseRecord[],date=todayIso()):string{
  const year=/^\d{4}/.exec(date)?.[0]??String(new Date().getFullYear());
  let max=0;
  const re=new RegExp(`^PUR-${year}-(\\d+)$`,'i');
  for(const purchase of purchases){const match=re.exec(purchase.number.trim());if(match)max=Math.max(max,Number(match[1])||0);}
  return `PUR-${year}-${String(max+1).padStart(4,'0')}`;
}

export function createPurchase(purchases:PurchaseRecord[],suppliers:Supplier[],currency='USD'):PurchaseRecord{
  const at=nowIso();
  const supplier=suppliers[0];
  return {
    id:makeId('purchase'),number:nextPurchaseNumber(purchases),date:todayIso(),supplierSnapshot:supplier?supplierSnapshotFrom(supplier):null,
    currency:cleanCurrency(supplier?.defaultCurrency||currency),items:[],freight:'0.00',duty:'0.00',otherCosts:'0.00',notes:'',status:'draft',
    postedAt:'',reversedAt:'',reverseReason:'',createdAt:at,updatedAt:at
  };
}

export function createPurchaseItem(item?:SavedItem):PurchaseRecord['items'][number]{
  return {id:makeId('purchase-item'),savedItemId:item?.id??'',sku:item?.sku??'',descriptionEn:item?.descriptionEn??'',descriptionAr:item?.descriptionAr??'',quantity:'1',unit:item?.unit||'PCS',unitCost:item?.lastUnitCost??'',landedUnitCost:'',previousUnitCost:item?.lastUnitCost??'',previousCostCurrency:item?.lastCostCurrency??''};
}

export function purchaseTotals(purchase:Pick<PurchaseRecord,'items'|'freight'|'duty'|'otherCosts'>):{subtotal:string;freight:string;duty:string;other:string;landedTotal:string}{
  let subtotal=0n;
  for(const item of purchase.items)subtotal+=lineCents(item.quantity,item.unitCost);
  const freight=cents(purchase.freight||'0');
  const duty=cents(purchase.duty||'0');
  const other=cents(purchase.otherCosts||'0');
  return {subtotal:fixed(subtotal,2),freight:fixed(freight,2),duty:fixed(duty,2),other:fixed(other,2),landedTotal:fixed(subtotal+freight+duty+other,2)};
}

export function allocateLandedCost(purchase:PurchaseRecord):PurchaseRecord{
  const extras4=decimalToScaled(purchase.freight||'0',4)+decimalToScaled(purchase.duty||'0',4)+decimalToScaled(purchase.otherCosts||'0',4);
  const bases=purchase.items.map(item=>decimalToScaled(item.quantity,4)*decimalToScaled(item.unitCost,4));
  const baseTotal=bases.reduce((sum,value)=>sum+value,0n);
  const quantities=purchase.items.map(item=>decimalToScaled(item.quantity,4));
  const quantityTotal=quantities.reduce((sum,value)=>sum+(value>0n?value:0n),0n);
  const weightTotal=baseTotal>0n?baseTotal:quantityTotal;
  const items=purchase.items.map((item,index)=>{
    const qty=quantities[index]??0n;
    const unit=decimalToScaled(item.unitCost,4);
    const weight=baseTotal>0n?(bases[index]??0n):(qty>0n?qty:0n);
    const allocated=weightTotal>0n?roundDivide(extras4*weight,weightTotal):0n;
    const extraPerUnit=qty>0n?roundDivide(allocated*SCALE4,qty):0n;
    return {...item,landedUnitCost:fixed(unit+extraPerUnit,4)};
  });
  return {...purchase,items};
}

export function validatePurchase(purchase:PurchaseRecord,savedItems:SavedItem[]=[]):string[]{
  const errors:string[]=[];
  if(!purchase.number.trim())errors.push('Purchase number is required.');
  if(!isIsoDate(purchase.date))errors.push('Purchase date is invalid.');
  if(!purchase.supplierSnapshot?.sourceSupplierId)errors.push('Supplier is required.');
  if(!purchase.currency.trim())errors.push('Purchase currency is required.');
  if(!purchase.items.length)errors.push('Add at least one purchase item.');
  for(const [index,item] of purchase.items.entries()){
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim())errors.push(`Item ${index+1}: description is required.`);
    if(!positive(item.quantity))errors.push(`Item ${index+1}: quantity must be greater than zero.`);
    if(!nonNegative(item.unitCost))errors.push(`Item ${index+1}: unit cost must be zero or greater.`);
    if(item.savedItemId&&!savedItems.some(saved=>saved.id===item.savedItemId))errors.push(`Item ${index+1}: linked saved item no longer exists.`);
  }
  for(const [label,value] of [['Freight',purchase.freight],['Duty',purchase.duty],['Other costs',purchase.otherCosts]] as const){if(!nonNegative(value||'0'))errors.push(`${label} must be zero or greater.`);}
  return errors;
}

function purchaseMovement(purchase:PurchaseRecord,item:PurchaseRecord['items'][number],type:'purchase'|'purchase-reversal',quantity:string,note='',movementDate=purchase.date):InventoryMovementRecord{
  return {
    id:makeId('stock'),itemId:item.savedItemId,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku,date:movementDate,type,
    quantity,unitCost:item.landedUnitCost||item.unitCost,currency:purchase.currency,sourceId:purchase.id,sourceNumber:purchase.number,note,createdAt:nowIso()
  };
}

export function postPurchase(purchase:PurchaseRecord,savedItems:SavedItem[],existingMovements:InventoryMovementRecord[]=[]):{purchase:PurchaseRecord;movements:InventoryMovementRecord[];savedItems:SavedItem[]}{
  if(purchase.status!=='draft')throw new Error('Only draft purchases can be posted.');
  const errors=validatePurchase(purchase,savedItems);if(errors.length)throw new Error(errors[0]);
  if(existingMovements.some(m=>m.sourceId===purchase.id&&m.type==='purchase'))throw new Error('This purchase is already reflected in inventory.');
  const at=nowIso();
  const savedById=new Map(savedItems.map(item=>[item.id,item]));
  const withPrior={...purchase,items:purchase.items.map(line=>{const saved=savedById.get(line.savedItemId);return {...line,previousUnitCost:saved?.lastUnitCost??line.previousUnitCost??'',previousCostCurrency:saved?.lastCostCurrency??line.previousCostCurrency??''};})};
  const posted={...allocateLandedCost(withPrior),status:'posted' as const,postedAt:at,updatedAt:at};
  const movements=posted.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(posted,item,'purchase',trimFixed(item.quantity)));
  const landedByItem=new Map(posted.items.filter(item=>item.savedItemId).map(item=>[item.savedItemId,item]));
  const updatedItems=savedItems.map(item=>{
    const line=landedByItem.get(item.id);if(!line)return item;
    return {...item,lastUnitCost:line.landedUnitCost||line.unitCost,lastCostCurrency:posted.currency,updatedAt:at};
  });
  return {purchase:posted,movements,savedItems:updatedItems};
}

export function reversePurchase(purchase:PurchaseRecord,reason:string,existingMovements:InventoryMovementRecord[]=[],savedItems:SavedItem[]=[]):{purchase:PurchaseRecord;movements:InventoryMovementRecord[];savedItems:SavedItem[]}{
  if(purchase.status!=='posted')throw new Error('Only posted purchases can be reversed.');
  if(!reason.trim())throw new Error('A reversal reason is required.');
  if(existingMovements.some(m=>m.sourceId===purchase.id&&m.type==='purchase-reversal'))throw new Error('This purchase has already been reversed.');
  const at=nowIso();
  const reversed={...purchase,status:'reversed' as const,reversedAt:at,reverseReason:reason.trim(),updatedAt:at};
  const reversalDate=todayIso();
  const movements=purchase.items.filter(item=>item.savedItemId).map(item=>purchaseMovement(purchase,item,'purchase-reversal',trimFixed(fixed(-decimalToScaled(item.quantity,4),4)),reason.trim(),reversalDate));
  const lines=new Map(purchase.items.filter(line=>line.savedItemId).map(line=>[line.savedItemId,line]));
  const restored=savedItems.map(item=>{const line=lines.get(item.id);if(!line)return item;const current=(item.lastUnitCost??'').trim(),landed=(line.landedUnitCost||line.unitCost).trim();if(current!==landed||item.lastCostCurrency!==purchase.currency)return item;return {...item,lastUnitCost:line.previousUnitCost||'',lastCostCurrency:line.previousCostCurrency||'',updatedAt:at};});
  return {purchase:reversed,movements,savedItems:restored};
}

export function createExpense(currency='USD'):ExpenseRecord{
  const at=nowIso();
  return {id:makeId('expense'),date:todayIso(),category:'General',description:'',amount:'',currency:cleanCurrency(currency),supplierId:'',reference:'',notes:'',createdAt:at,updatedAt:at};
}

export function validateExpense(expense:ExpenseRecord):string[]{
  const errors:string[]=[];
  if(!isIsoDate(expense.date))errors.push('Expense date is invalid.');
  if(!expense.description.trim())errors.push('Expense description is required.');
  if(!positive(expense.amount))errors.push('Expense amount must be greater than zero.');
  if(!expense.currency.trim())errors.push('Expense currency is required.');
  return errors;
}

export function createManualInventoryMovement(item:SavedItem,type:Extract<InventoryMovementType,'opening'|'issue'|'adjustment'>,quantity:string,date=todayIso(),note='',unitCost='',currency=''):InventoryMovementRecord{
  if(!isIsoDate(date))throw new Error('Movement date is invalid.');
  if(!isDecimalInput(quantity)||decimalToScaled(quantity,4)===0n)throw new Error('Movement quantity cannot be zero.');
  let scaled=decimalToScaled(quantity,4);
  if(type==='opening')scaled=scaled<0n?-scaled:scaled;
  if(type==='issue')scaled=scaled>0n?-scaled:scaled;
  return {id:makeId('stock'),itemId:item.id,itemNameEn:item.descriptionEn,itemNameAr:item.descriptionAr,sku:item.sku??'',date,type,quantity:trimFixed(fixed(scaled,4)),unitCost:unitCost.trim(),currency:cleanCurrency(currency||item.lastCostCurrency||'' ,''),sourceId:'',sourceNumber:'',note:note.trim(),createdAt:nowIso()};
}

export function reverseManualInventoryMovement(movement:InventoryMovementRecord,date=todayIso()):InventoryMovementRecord{
  if(!inventoryMovementIsManual(movement))throw new Error('Only manual inventory movements can be reversed here.');
  if(!isIsoDate(date))throw new Error('Movement date is invalid.');
  const quantity=decimalToScaled(movement.quantity,4);
  if(quantity===0n)throw new Error('Movement quantity cannot be zero.');
  return {
    ...movement,id:makeId('stock'),date,type:'adjustment',quantity:trimFixed(fixed(-quantity,4)),sourceId:movement.id,sourceNumber:movement.sourceNumber||movement.id,
    note:[`Reversal of ${movement.type}`,movement.note].filter(Boolean).join(' — '),createdAt:nowIso()
  };
}

export interface InventoryBalance { item:SavedItem; quantity:string; quantityScaled:bigint; }
export function inventoryBalances(items:SavedItem[],movements:InventoryMovementRecord[]):InventoryBalance[]{
  const byItem=new Map<string,bigint>();
  for(const movement of movements)byItem.set(movement.itemId,(byItem.get(movement.itemId)??0n)+decimalToScaled(movement.quantity,4));
  return items.map(item=>{const quantityScaled=byItem.get(item.id)??0n;return {item,quantity:trimFixed(fixed(quantityScaled,4)),quantityScaled};}).sort((a,b)=>{
    const left=(a.item.sku||a.item.descriptionEn||a.item.descriptionAr).toLowerCase();
    const right=(b.item.sku||b.item.descriptionEn||b.item.descriptionAr).toLowerCase();return left.localeCompare(right);
  });
}

export function inventoryMovementIsManual(movement:InventoryMovementRecord):boolean{return movement.type==='opening'||movement.type==='issue'||movement.type==='adjustment';}

export function spendByCurrency(purchases:PurchaseRecord[],expenses:ExpenseRecord[]):Array<{currency:string;purchases:string;expenses:string;total:string}>{
  const map=new Map<string,{purchase:bigint;expense:bigint}>();
  for(const purchase of purchases){if(purchase.status!=='posted')continue;const currency=cleanCurrency(purchase.currency);const row=map.get(currency)??{purchase:0n,expense:0n};row.purchase+=cents(purchaseTotals(purchase).landedTotal);map.set(currency,row);}
  for(const expense of expenses){const currency=cleanCurrency(expense.currency);const row=map.get(currency)??{purchase:0n,expense:0n};row.expense+=cents(expense.amount);map.set(currency,row);}
  return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,purchases:fixed(row.purchase,2),expenses:fixed(row.expense,2),total:fixed(row.purchase+row.expense,2)}));
}
