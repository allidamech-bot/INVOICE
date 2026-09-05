import type { AppSettings, CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PurchaseRecord, SavedItem, Supplier, VaultPayload } from '../types.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity } from '../lib/saved-items.js';
import { decimalToScaled, isDecimalInput } from '../lib/money.js';
import { assertDocumentLifecycleInvariant } from '../lib/document-lifecycle.js';
import { assertInvoicePaymentInvariant } from '../lib/payments.js';
import { inventoryMovementIsManual, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';
import { isIsoDate } from '../lib/id.js';
import { t } from '../lib/i18n.js';

function sameArray(a: readonly string[], b: readonly string[]): boolean {
  return a.length===b.length && a.every((value,index)=>value===b[index]);
}

function sameRecord(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b);}

function mergeRecords<T extends { id:string }>(base:T[], intended:T[], latest:T[]):T[]{
  if(intended===base)return latest;
  const baseById=new Map(base.map(item=>[item.id,item]));
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const removed=new Set(base.filter(item=>!intendedById.has(item.id)).map(item=>item.id));
  const result=latest.filter(item=>!removed.has(item.id));
  const indexById=new Map(result.map((item,index)=>[item.id,index]));
  for(const item of intended){
    const before=baseById.get(item.id);
    if(before&&sameRecord(before,item))continue;
    const index=indexById.get(item.id);
    if(index===undefined){indexById.set(item.id,result.length);result.push(item);}
    else result[index]=item;
  }
  return result;
}

function documentRevision(document:LourexDocument):number{return Math.max(1,Math.trunc(document.revision||1));}
function documentChangedSinceBase(base:LourexDocument,latest:LourexDocument):boolean{
  return base.updatedAt!==latest.updatedAt||base.status!==latest.status||base.lifecycleStatus!==latest.lifecycleStatus||documentRevision(base)!==documentRevision(latest);
}
function preserveConcurrentDocument(base:LourexDocument,intended:LourexDocument,latest:LourexDocument):boolean{
  if(!documentChangedSinceBase(base,latest))return false;
  if(latest.lifecycleStatus==='voided'&&intended.lifecycleStatus!=='voided')return true;
  if(latest.status==='final'&&intended.status==='draft')return true;
  if(documentRevision(latest)>documentRevision(intended))return true;
  return false;
}
function mergeDocuments(base:LourexDocument[],intended:LourexDocument[],latest:LourexDocument[]):LourexDocument[]{
  if(intended===base)return latest;
  const baseById=new Map(base.map(item=>[item.id,item]));
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const result:LourexDocument[]=[];
  const seen=new Set<string>();
  for(const latestItem of latest){
    const before=baseById.get(latestItem.id);
    const wanted=intendedById.get(latestItem.id);
    if(!wanted){
      if(!before||documentChangedSinceBase(before,latestItem))result.push(latestItem);
      seen.add(latestItem.id);
      continue;
    }
    if(before&&before===wanted){result.push(latestItem);seen.add(latestItem.id);continue;}
    result.push(before&&preserveConcurrentDocument(before,wanted,latestItem)?latestItem:wanted);
    seen.add(latestItem.id);
  }
  for(const item of intended)if(!seen.has(item.id))result.push(item);
  return result;
}

function financialInvoiceIds(base:VaultPayload,intended:VaultPayload):Set<string>{
  const ids=new Set<string>();
  if(intended.payments!==base.payments){
    const baseById=new Map(base.payments.map(payment=>[payment.id,payment]));
    const intendedById=new Map(intended.payments.map(payment=>[payment.id,payment]));
    for(const payment of intended.payments){
      const before=baseById.get(payment.id);
      if(before===payment)continue;
      if(payment.invoiceId)ids.add(payment.invoiceId);
      if(before?.invoiceId&&before.invoiceId!==payment.invoiceId)ids.add(before.invoiceId);
    }
    for(const payment of base.payments)if(!intendedById.has(payment.id)&&payment.invoiceId)ids.add(payment.invoiceId);
  }
  if(intended.documents!==base.documents){
    const baseById=new Map(base.documents.map(document=>[document.id,document]));
    const intendedById=new Map(intended.documents.map(document=>[document.id,document]));
    for(const document of intended.documents){
      const before=baseById.get(document.id);
      if(before===document)continue;
      for(const candidate of [before,document]){
        if(!candidate)continue;
        if(candidate.role==='credit-note'){
          if(candidate.creditForId)ids.add(candidate.creditForId);
        }else if(candidate.kind==='invoice')ids.add(candidate.id);
      }
    }
    for(const document of base.documents){
      if(intendedById.has(document.id))continue;
      if(document.role==='credit-note'){
        if(document.creditForId)ids.add(document.creditForId);
      }else if(document.kind==='invoice')ids.add(document.id);
    }
  }
  return ids;
}
function guardFinancialSettlementChanges(base:VaultPayload,intended:VaultPayload,documents:LourexDocument[],payments:VaultPayload['payments']):void{
  const affected=financialInvoiceIds(base,intended);
  if(!affected.size)return;
  for(const invoiceId of affected){
    const invoice=documents.find(document=>document.id===invoiceId&&document.kind==='invoice'&&document.role!=='credit-note');
    const linkedPayments=payments.filter(payment=>payment.invoiceId===invoiceId);
    const linkedCredits=documents.filter(document=>document.role==='credit-note'&&document.creditForId===invoiceId&&document.status==='final'&&document.lifecycleStatus!=='voided');
    if(!invoice){
      if(linkedPayments.length||linkedCredits.length)throw new Error('Financial activity cannot remain linked to a missing source invoice.');
      continue;
    }
    if((linkedPayments.length||linkedCredits.length)&&(invoice.status!=='final'||invoice.lifecycleStatus==='voided'))throw new Error('An invoice with payments or issued credit notes must remain an active final invoice.');
    assertInvoicePaymentInvariant(invoice,payments,documents);
    assertDocumentLifecycleInvariant(invoice,documents,payments);
    for(const credit of linkedCredits)assertDocumentLifecycleInvariant(credit,documents,payments);
  }
}

function text(value:unknown):string{return typeof value==='string'?value:'';}
function customerIdentity(value:string):string{return normalizeSavedItemIdentity(value);}
function customerNames(customer:Customer):string[]{return [text(customer.companyNameEn),text(customer.companyNameAr)].map(customerIdentity).filter(Boolean);}
function customerFieldChanged(before:Customer|undefined,customer:Customer,key:keyof Customer):boolean{return !before||text(before[key])!==text(customer[key]);}
function guardCustomerChanges(base:Customer[],intended:Customer[],merged:Customer[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(customer=>[customer.id,customer]));
  for(const customer of intended){
    const before=baseById.get(customer.id);
    const namesChanged=!before||customerIdentity(text(before.companyNameEn))!==customerIdentity(text(customer.companyNameEn))||customerIdentity(text(before.companyNameAr))!==customerIdentity(text(customer.companyNameAr));
    if(namesChanged){
      const names=customerNames(customer);
      if(!names.length)throw new Error(t('Company name is required.','اسم الشركة مطلوب.'));
      const duplicate=merged.find(existing=>existing.id!==customer.id&&customerNames(existing).some(name=>names.includes(name)));
      if(duplicate)throw new Error(t('This customer already exists. Open the existing customer to edit it.','هذا العميل موجود بالفعل. افتح العميل الموجود لتعديله.'));
    }
    if(customerFieldChanged(before,customer,'email')){
      const email=text(customer.email).trim();
      if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error(t('Enter a valid email address or leave it empty.','أدخل بريدًا إلكترونيًا صحيحًا أو اترك الحقل فارغًا.'));
    }
    const commercialChanged=!before||(['creditLimit','creditCurrency','paymentDueDays'] as Array<keyof Customer>).some(key=>customerFieldChanged(before,customer,key));
    if(commercialChanged){
      const creditLimit=text(customer.creditLimit).trim();
      const creditCurrency=text(customer.creditCurrency).trim();
      const dueDays=text(customer.paymentDueDays).trim();
      if(creditLimit&&(!isDecimalInput(creditLimit)||decimalToScaled(creditLimit,2)<0n))throw new Error(t('Credit limit must be zero or greater.','يجب أن يكون حد الائتمان صفرًا أو أكثر.'));
      if(creditLimit&&!creditCurrency)throw new Error(t('Choose a currency for the credit limit.','اختر عملة لحد الائتمان.'));
      if(dueDays&&!/^\d+$/.test(dueDays))throw new Error(t('Payment due days must be a whole number.','يجب أن تكون أيام الاستحقاق رقمًا صحيحًا.'));
      if(/^\d+$/.test(dueDays)&&Number(dueDays)>3650)throw new Error(t('Payment due days cannot exceed 3650.','لا يمكن أن تتجاوز أيام الاستحقاق 3650 يومًا.'));
    }
  }
}

function savedItemSku(value:unknown):string{return text(value).normalize('NFKC').trim().replace(/\s+/g,'').toLocaleUpperCase();}
function savedItemIdentityChanged(before:SavedItem|undefined,item:SavedItem):boolean{
  return !before||normalizeSavedItemIdentity(text(before.descriptionEn))!==normalizeSavedItemIdentity(text(item.descriptionEn))||normalizeSavedItemIdentity(text(before.descriptionAr))!==normalizeSavedItemIdentity(text(item.descriptionAr))||savedItemSku(before.sku)!==savedItemSku(item.sku);
}
function guardSavedItemChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const item of intended){
    const before=baseById.get(item.id);
    const identityChanged=savedItemIdentityChanged(before,item);
    const commercialChanged=!before||identityChanged||text(before.unit)!==text(item.unit)||text(before.lastUnitPrice)!==text(item.lastUnitPrice);
    if(commercialChanged){
      if(!text(item.descriptionEn).trim()&&!text(item.descriptionAr).trim())throw new Error(t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.'));
      if(!text(item.unit).trim())throw new Error(t('Unit is required.','الوحدة مطلوبة.'));
      const price=text(item.lastUnitPrice).trim();
      if(price&&(!isDecimalInput(price)||decimalToScaled(price)<0n))throw new Error(t('Enter a valid non-negative price.','أدخل سعرًا صالحًا يساوي صفرًا أو أكثر.'));
    }
    if(identityChanged&&findSavedItemDuplicate(merged,item))throw new Error(t('This item already exists or uses a duplicate SKU. Open the existing item to edit it.','هذا الصنف موجود بالفعل أو يستخدم SKU مكررًا. افتح الصنف الموجود لتعديله.'));
  }
}

function guardConcurrentRecordChanges<T extends {id:string}>(base:T[],intended:T[],latest:T[],label:string):void{
  if(intended===base)return;
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const latestById=new Map(latest.map(item=>[item.id,item]));
  const baseIds=new Set(base.map(item=>item.id));
  for(const before of base){
    const wanted=intendedById.get(before.id);
    const current=latestById.get(before.id);
    const localChanged=!wanted||!sameRecord(before,wanted);
    if(!localChanged)continue;
    const remoteChanged=!current||!sameRecord(before,current);
    if(!remoteChanged)continue;
    if(!wanted&&!current)continue;
    if(wanted&&current&&sameRecord(wanted,current))continue;
    throw new Error(`${label} changed on another device. Reopen Operations before saving or deleting it.`);
  }
  for(const wanted of intended){
    if(baseIds.has(wanted.id))continue;
    const current=latestById.get(wanted.id);
    if(current&&!sameRecord(current,wanted))throw new Error(`${label} changed on another device. Reopen Operations before saving or deleting it.`);
  }
}
function guardDraftPurchaseConflicts(base:PurchaseRecord[],intended:PurchaseRecord[],latest:PurchaseRecord[]):void{
  if(intended===base)return;
  const intendedById=new Map(intended.map(item=>[item.id,item]));
  const latestById=new Map(latest.map(item=>[item.id,item]));
  const baseIds=new Set(base.map(item=>item.id));
  for(const before of base){
    if(before.status!=='draft')continue;
    const wanted=intendedById.get(before.id);
    const current=latestById.get(before.id);
    const localChanged=!wanted||!sameRecord(before,wanted);
    if(!localChanged)continue;
    const remoteChanged=!current||!sameRecord(before,current);
    if(!remoteChanged)continue;
    if(!wanted&&!current)continue;
    if(wanted&&current&&sameRecord(wanted,current))continue;
    if((wanted&&wanted.status!=='draft')||(current&&current.status!=='draft'))continue;
    throw new Error('Purchase changed on another device. Reopen Operations before saving or deleting it.');
  }
  for(const wanted of intended){
    if(baseIds.has(wanted.id))continue;
    const current=latestById.get(wanted.id);
    if(current&&!sameRecord(current,wanted))throw new Error('Purchase changed on another device. Reopen Operations before saving or deleting it.');
  }
}
function guardSupplierChanges(base:Supplier[],intended:Supplier[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(supplier=>[supplier.id,supplier]));
  for(const supplier of intended){
    const before=baseById.get(supplier.id);
    if(before&&sameRecord(before,supplier))continue;
    const errors=validateSupplier(supplier);
    if(errors.length)throw new Error(errors[0]);
  }
}
function guardExpenseChanges(base:ExpenseRecord[],intended:ExpenseRecord[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(expense=>[expense.id,expense]));
  for(const expense of intended){
    const before=baseById.get(expense.id);
    if(before&&sameRecord(before,expense))continue;
    const errors=validateExpense(expense);
    if(errors.length)throw new Error(errors[0]);
  }
}
function purchaseCore(purchase:PurchaseRecord):string{
  const {status:_,postedAt:__,reversedAt:___,reverseReason:____,updatedAt:_____,...core}=purchase;
  return JSON.stringify(core);
}
function purchaseIdsAffected(base:VaultPayload,intended:VaultPayload):Set<string>{
  const ids=new Set<string>();
  if(intended.purchases!==base.purchases){
    const baseById=new Map(base.purchases.map(purchase=>[purchase.id,purchase]));
    const intendedById=new Map(intended.purchases.map(purchase=>[purchase.id,purchase]));
    for(const purchase of intended.purchases){const before=baseById.get(purchase.id);if(!before||!sameRecord(before,purchase))ids.add(purchase.id);}
    for(const purchase of base.purchases)if(!intendedById.has(purchase.id))ids.add(purchase.id);
  }
  if(intended.inventoryMovements!==base.inventoryMovements){
    const baseById=new Map(base.inventoryMovements.map(movement=>[movement.id,movement]));
    const intendedById=new Map(intended.inventoryMovements.map(movement=>[movement.id,movement]));
    for(const movement of intended.inventoryMovements){
      const before=baseById.get(movement.id);if(before&&sameRecord(before,movement))continue;
      for(const candidate of [before,movement])if(candidate&&(candidate.type==='purchase'||candidate.type==='purchase-reversal')&&candidate.sourceId)ids.add(candidate.sourceId);
    }
    for(const movement of base.inventoryMovements){if(intendedById.has(movement.id))continue;if((movement.type==='purchase'||movement.type==='purchase-reversal')&&movement.sourceId)ids.add(movement.sourceId);}
  }
  return ids;
}
function movementQuantity(movement:InventoryMovementRecord):bigint{
  if(!isDecimalInput(movement.quantity))throw new Error('Inventory history contains an invalid movement quantity.');
  const quantity=decimalToScaled(movement.quantity,4);
  if(quantity===0n)throw new Error('Inventory history contains a zero-quantity movement.');
  return quantity;
}
function inventoryQuantity(itemId:string,movements:InventoryMovementRecord[]):bigint{
  let total=0n;
  for(const movement of movements)if(movement.itemId===itemId)total+=movementQuantity(movement);
  return total;
}
function quantityMapFromPurchase(purchase:PurchaseRecord):Map<string,bigint>{
  const result=new Map<string,bigint>();
  for(const item of purchase.items){
    if(!item.savedItemId)continue;
    const quantity=decimalToScaled(item.quantity,4);
    result.set(item.savedItemId,(result.get(item.savedItemId)??0n)+quantity);
  }
  return result;
}
function quantityMapFromMovements(purchaseId:string,type:'purchase'|'purchase-reversal',movements:InventoryMovementRecord[]):Map<string,bigint>{
  const result=new Map<string,bigint>();
  for(const movement of movements){
    if(movement.sourceId!==purchaseId||movement.type!==type)continue;
    const quantity=movementQuantity(movement);
    result.set(movement.itemId,(result.get(movement.itemId)??0n)+quantity);
  }
  return result;
}
function quantityMapsEqual(left:Map<string,bigint>,right:Map<string,bigint>):boolean{
  if(left.size!==right.size)return false;
  for(const [key,value] of left)if(right.get(key)!==value)return false;
  return true;
}
function negativeQuantityMap(source:Map<string,bigint>):Map<string,bigint>{return new Map(Array.from(source,([key,value])=>[key,-value]));}
function guardInventoryLedgerIntent(base:VaultPayload,intended:VaultPayload):void{
  if(intended.inventoryMovements===base.inventoryMovements)return;
  const intendedById=new Map(intended.inventoryMovements.map(movement=>[movement.id,movement]));
  for(const movement of base.inventoryMovements){
    const next=intendedById.get(movement.id);
    if(!next)throw new Error('Inventory ledger entries are append-only and cannot be deleted. Reverse the movement instead.');
    if(!sameRecord(movement,next))throw new Error('Inventory ledger entries are immutable. Reverse the movement instead of editing history.');
  }
}
function guardNewManualMovements(base:VaultPayload,intended:VaultPayload,movements:InventoryMovementRecord[],savedItems:SavedItem[]):Set<string>{
  const baseIds=new Set(base.inventoryMovements.map(movement=>movement.id));
  const touched=new Set<string>();
  for(const movement of intended.inventoryMovements){
    if(baseIds.has(movement.id))continue;
    touched.add(movement.itemId);
    if(movement.type==='purchase'||movement.type==='purchase-reversal')continue;
    if(!inventoryMovementIsManual(movement))throw new Error('Unsupported inventory movement type.');
    if(!savedItems.some(item=>item.id===movement.itemId))throw new Error('Inventory movement is linked to a missing saved item.');
    if(!isIsoDate(movement.date))throw new Error('Movement date is invalid.');
    const quantity=movementQuantity(movement);
    if(movement.type==='opening'&&quantity<0n)throw new Error('Opening stock cannot be negative.');
    if(movement.type==='issue'&&quantity>0n)throw new Error('Stock issues must reduce inventory.');
    const cost=text(movement.unitCost).trim();
    if(cost&&(!isDecimalInput(cost)||decimalToScaled(cost,4)<0n))throw new Error('Inventory movement unit cost must be zero or greater.');
    if(movement.sourceId){
      if(movement.type!=='adjustment')throw new Error('Only an adjustment can reverse a prior manual inventory movement.');
      const source=movements.find(item=>item.id===movement.sourceId);
      if(!source||!inventoryMovementIsManual(source))throw new Error('Manual inventory reversal is linked to an invalid source movement.');
      if(source.itemId!==movement.itemId||movementQuantity(source)!==-quantity)throw new Error('Manual inventory reversal must exactly offset its source movement.');
      const reversals=movements.filter(item=>item.type==='adjustment'&&item.sourceId===source.id);
      if(reversals.length!==1)throw new Error('This manual inventory movement has already been reversed.');
    }
  }
  return touched;
}
function guardSavedItemInventoryRemoval(base:VaultPayload,intended:VaultPayload,purchases:PurchaseRecord[],movements:InventoryMovementRecord[]):void{
  if(intended.savedItems===base.savedItems)return;
  const intendedIds=new Set(intended.savedItems.map(item=>item.id));
  for(const item of base.savedItems){
    if(intendedIds.has(item.id))continue;
    if(purchases.some(purchase=>purchase.status==='draft'&&purchase.items.some(line=>line.savedItemId===item.id)))throw new Error('Cannot delete a saved item that is used by a draft purchase.');
    const related=movements.filter(movement=>movement.itemId===item.id);
    if(related.length&&inventoryQuantity(item.id,movements)!==0n)throw new Error('Cannot delete a saved item while it still has an inventory balance. Adjust or reverse stock to zero first.');
  }
}
function guardPurchaseState(purchase:PurchaseRecord,purchases:PurchaseRecord[],movements:InventoryMovementRecord[],savedItems:SavedItem[]):void{
  const errors=validatePurchase(purchase,savedItems);if(errors.length)throw new Error(errors[0]);
  const number=purchase.number.trim().toLowerCase();
  if(purchases.some(other=>other.id!==purchase.id&&other.number.trim().toLowerCase()===number))throw new Error('Purchase number already exists.');
  const sourceMovements=movements.filter(movement=>movement.sourceId===purchase.id&&(movement.type==='purchase'||movement.type==='purchase-reversal'));
  if(purchase.status==='draft'){
    if(sourceMovements.length)throw new Error('A draft purchase cannot already be reflected in inventory.');
    return;
  }
  const expected=quantityMapFromPurchase(purchase);
  const receipts=quantityMapFromMovements(purchase.id,'purchase',movements);
  const reversals=quantityMapFromMovements(purchase.id,'purchase-reversal',movements);
  if(!quantityMapsEqual(receipts,expected))throw new Error('Posted purchase inventory receipts do not match the purchase lines.');
  if(purchase.status==='posted'&&reversals.size)throw new Error('A posted purchase cannot contain reversal stock before the purchase is reversed.');
  if(purchase.status==='reversed'&&!quantityMapsEqual(reversals,negativeQuantityMap(expected)))throw new Error('Purchase reversal stock does not exactly offset the posted purchase.');
  for(const movement of sourceMovements){
    if(movement.sourceNumber!==purchase.number)throw new Error('Purchase inventory movement source number does not match the purchase.');
    if(text(movement.currency).trim().toUpperCase()!==purchase.currency.trim().toUpperCase())throw new Error('Purchase inventory movement currency does not match the purchase.');
    if(!expected.has(movement.itemId))throw new Error('Purchase inventory movement references an item outside the purchase.');
    const quantity=movementQuantity(movement);
    if(movement.type==='purchase'&&quantity<0n)throw new Error('Purchase receipt quantity cannot be negative.');
    if(movement.type==='purchase-reversal'&&quantity>0n)throw new Error('Purchase reversal quantity cannot be positive.');
    const cost=text(movement.unitCost).trim();
    if(cost&&(!isDecimalInput(cost)||decimalToScaled(cost,4)<0n))throw new Error('Purchase inventory unit cost must be zero or greater.');
  }
}
function guardOperationsChanges(base:VaultPayload,intended:VaultPayload,latest:VaultPayload,suppliers:Supplier[],purchases:PurchaseRecord[],expenses:ExpenseRecord[],movements:InventoryMovementRecord[],savedItems:SavedItem[]):void{
  guardConcurrentRecordChanges(base.suppliers,intended.suppliers,latest.suppliers,'Supplier');
  guardConcurrentRecordChanges(base.expenses,intended.expenses,latest.expenses,'Expense');
  guardDraftPurchaseConflicts(base.purchases,intended.purchases,latest.purchases);
  guardSupplierChanges(base.suppliers,intended.suppliers);
  guardExpenseChanges(base.expenses,intended.expenses);
  guardInventoryLedgerIntent(base,intended);
  const affectedPurchases=purchaseIdsAffected(base,intended);
  const baseById=new Map(base.purchases.map(purchase=>[purchase.id,purchase]));
  const intendedById=new Map(intended.purchases.map(purchase=>[purchase.id,purchase]));
  for(const id of affectedPurchases){
    const before=baseById.get(id),wanted=intendedById.get(id),merged=purchases.find(purchase=>purchase.id===id);
    if(before&&wanted&&!sameRecord(before,wanted)){
      if(before.status==='reversed')throw new Error('Reversed purchases are immutable.');
      if(before.status==='posted'){
        if(wanted.status!=='reversed')throw new Error('Posted purchases are immutable. Reverse the purchase instead of editing it.');
        if(purchaseCore(before)!==purchaseCore(wanted))throw new Error('Purchase reversal cannot change the original posted purchase details.');
      }
    }
    if(!merged){
      if(movements.some(movement=>movement.sourceId===id&&(movement.type==='purchase'||movement.type==='purchase-reversal')))throw new Error('Purchase inventory history cannot remain linked to a deleted purchase.');
      continue;
    }
    guardPurchaseState(merged,purchases,movements,savedItems);
  }
  const touchedItems=guardNewManualMovements(base,intended,movements,savedItems);
  for(const id of affectedPurchases){const purchase=purchases.find(item=>item.id===id);for(const line of purchase?.items??[])if(line.savedItemId)touchedItems.add(line.savedItemId);}
  for(const itemId of touchedItems){
    const latestQuantity=inventoryQuantity(itemId,latest.inventoryMovements);
    const mergedQuantity=inventoryQuantity(itemId,movements);
    if(mergedQuantity<0n&&mergedQuantity<latestQuantity)throw new Error('Inventory cannot fall below zero. Reduce the issue or restore stock before reversing it.');
  }
  guardSavedItemInventoryRemoval(base,intended,purchases,movements);
}

function mergeCompany(base:CompanySettings,intended:CompanySettings,latest:CompanySettings):CompanySettings{
  if(intended===base)return latest;
  const next:CompanySettings={...latest,bank:{...latest.bank},bankAccounts:latest.bankAccounts.map(account=>({...account})),commercial:{...latest.commercial,taxPresets:latest.commercial.taxPresets.map(item=>({...item})),paymentTermPresets:latest.commercial.paymentTermPresets.map(item=>({...item})),pricing:{...latest.commercial.pricing}}};
  const keys:Array<Exclude<keyof CompanySettings,'bank'|'bankAccounts'|'commercial'>>=[
    'nameEn','nameAr','logoDataUrl','addressEn','addressAr','city','country','phone','email','website','vatNumber','taxNumber','commercialRegistration','defaultBankAccountId',
    'signatureDataUrl','stampDataUrl','defaultCurrency','defaultLanguage','defaultPaymentTerms','defaultIncoterm','defaultDeliveryTime','defaultValidityDays','defaultFooterText','defaultNotes'
  ];
  for(const key of keys)if(intended[key]!==base[key])(next as any)[key]=intended[key];
  const bankKeys:Array<keyof CompanySettings['bank']>=['bankName','accountName','iban','swift','currency'];
  for(const key of bankKeys)if(intended.bank[key]!==base.bank[key])next.bank[key]=intended.bank[key];
  if(JSON.stringify(intended.bankAccounts)!==JSON.stringify(base.bankAccounts))next.bankAccounts=intended.bankAccounts.map(account=>({...account}));
  if(JSON.stringify(intended.commercial)!==JSON.stringify(base.commercial))next.commercial={...intended.commercial,taxPresets:intended.commercial.taxPresets.map(item=>({...item})),paymentTermPresets:intended.commercial.paymentTermPresets.map(item=>({...item})),pricing:{...intended.commercial.pricing}};
  return next;
}

function mergeAppSettings(base:AppSettings,intended:AppSettings,latest:AppSettings):AppSettings{
  if(intended===base)return latest;
  const next:AppSettings={...latest,numbering:{...latest.numbering},smartDefaults:{...latest.smartDefaults,favoriteTemplateIds:[...latest.smartDefaults.favoriteTemplateIds]}};
  if(intended.autoLockMinutes!==base.autoLockMinutes)next.autoLockMinutes=intended.autoLockMinutes;
  if(intended.uiLanguage!==base.uiLanguage)next.uiLanguage=intended.uiLanguage;
  const numberingKeys:Array<keyof AppSettings['numbering']>=['proformaPrefix','invoicePrefix','creditNotePrefix','proformaLast','invoiceLast','creditNoteLast','proformaYear','invoiceYear','creditNoteYear'];
  for(const key of numberingKeys)if(intended.numbering[key]!==base.numbering[key])(next.numbering as any)[key]=intended.numbering[key];
  const smartKeys:Array<Exclude<keyof AppSettings['smartDefaults'],'favoriteTemplateIds'>>=['currency','language','incoterm','paymentTerms','deliveryTime','quoteTemplateId','invoiceTemplateId'];
  for(const key of smartKeys)if(intended.smartDefaults[key]!==base.smartDefaults[key])(next.smartDefaults as any)[key]=intended.smartDefaults[key];
  if(!sameArray(intended.smartDefaults.favoriteTemplateIds,base.smartDefaults.favoriteTemplateIds))next.smartDefaults.favoriteTemplateIds=[...intended.smartDefaults.favoriteTemplateIds];
  return next;
}

export function mergeVaultIntent(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):VaultPayload{
  const customers=mergeRecords(base.customers,intended.customers,latest.customers);
  const savedItems=mergeRecords(base.savedItems,intended.savedItems,latest.savedItems);
  const suppliers=mergeRecords(base.suppliers,intended.suppliers,latest.suppliers);
  const purchases=mergeRecords(base.purchases,intended.purchases,latest.purchases);
  const expenses=mergeRecords(base.expenses,intended.expenses,latest.expenses);
  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  const documents=mergeDocuments(base.documents,intended.documents,latest.documents);
  const payments=mergeRecords(base.payments,intended.payments,latest.payments);
  guardCustomerChanges(base.customers,intended.customers,customers);
  guardSavedItemChanges(base.savedItems,intended.savedItems,savedItems);
  guardFinancialSettlementChanges(base,intended,documents,payments);
  guardOperationsChanges(base,intended,latest,suppliers,purchases,expenses,inventoryMovements,savedItems);
  return {
    ...latest,
    schemaVersion:Math.max(latest.schemaVersion,intended.schemaVersion),
    company:mergeCompany(base.company,intended.company,latest.company),
    customers,
    suppliers,
    purchases,
    expenses,
    inventoryMovements,
    documents,
    documentEvents:mergeRecords(base.documentEvents,intended.documentEvents,latest.documentEvents),
    documentRevisions:mergeRecords(base.documentRevisions,intended.documentRevisions,latest.documentRevisions),
    payments,
    savedItems,
    appSettings:mergeAppSettings(base.appSettings,intended.appSettings,latest.appSettings)
  };
}