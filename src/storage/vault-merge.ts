import type { AppSettings, CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PurchaseRecord, RecurringWorkflowRecord, SavedItem, Supplier, SupplierPaymentRecord, VaultPayload } from '../types.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity } from '../lib/saved-items.js';
import { decimalToScaled, isDecimalInput, isExactStockQuantityInput, isFinancialDecimalInput, isNonNegativeDecimalInput, isNonNegativeFinancialDecimalInput } from '../lib/money.js';
import { assertDocumentLifecycleInvariant } from '../lib/document-lifecycle.js';
import { assertInvoicePaymentInvariant } from '../lib/payments.js';
import { assertSupplierPaymentInvariant } from '../lib/payables.js';
import { inventoryMovementAccountingIsValid, inventoryMovementIsManual, validateExpense, validatePurchase, validateSupplier } from '../lib/operations.js';
import { isIsoDate } from '../lib/id.js';
import { t } from '../lib/i18n.js';
import { assertRecurringWorkflow } from '../lib/recurring-workflows.js';
import { appendTreasuryEntry, assertTreasuryAccount, assertTreasuryEntry } from '../lib/treasury-ledger.js';
import { assertFxRate } from '../lib/fx-rates.js';
import { defaultWarehouseId, validateWarehouse, warehouseItemQuantity } from '../lib/warehouses.js';
import { assertGoodsReceiptIntegrity } from '../lib/goods-receipt-flow.js';
import { assertSupplierInvoiceIntegrity } from '../lib/supplier-invoice-flow.js';
import { assertMatchedSupplierInvoicePostingIntegrity } from '../lib/supplier-invoice-posting.js';
import { assertSalesOrderIntegrity } from '../lib/sales-order-flow.js';
import { assertSalesDeliveryIntegrity } from '../lib/sales-delivery-flow.js';
import { assertDeliveryInvoiceIntegrity, assertDeliveryInvoiceLedgerContinuity } from '../lib/sales-delivery-invoice.js';
import { assertSalesDeliveryStockIntegrity, assertSalesStockLedgerContinuity, isSalesDeliveryStockIssue } from '../lib/sales-delivery-stock.js';
import {assertInvoiceStockLedgerContinuity,assertPostedInvoiceStockDocumentIntegrity,isIssuedInvoiceStockIssue,postIssuedInvoiceStock} from '../lib/invoice-stock.js';
import {validateManualMovementEvidence} from '../lib/inventory-evidence.js';
import {assertSalesReturnIntegrity,assertSalesReturnLedgerContinuity,isSalesReturn,isSalesReturnCorrection} from '../lib/sales-returns.js';
import {assertInvoiceVoidStockIntegrity,assertInvoiceVoidStockContinuity,assertInvoiceVoidDocumentContinuity,isInvoiceVoidStockReceipt} from '../lib/invoice-void-stock.js';

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
      if(before&&sameRecord(before,payment))continue;
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
      if(before&&sameRecord(before,document))continue;
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
      if(creditLimit&&!isNonNegativeDecimalInput(creditLimit))throw new Error(t('Credit limit must be zero or greater.','يجب أن يكون حد الائتمان صفرًا أو أكثر.'));
      if(creditLimit&&!creditCurrency)throw new Error(t('Choose a currency for the credit limit.','اختر عملة لحد الائتمان.'));
      if(dueDays&&!/^\d+$/.test(dueDays))throw new Error(t('Payment due days must be a whole number.','يجب أن تكون أيام الاستحقاق رقمًا صحيحًا.'));
      if(/^\d+$/.test(dueDays)&&Number(dueDays)>3650)throw new Error(t('Payment due days cannot exceed 3650.','لا يمكن أن تتجاوز أيام الاستحقاق 3650 يومًا.'));
    }
  }
}

function savedItemSku(value:unknown):string{return text(value).normalize('NFKC').trim().replace(/\s+/g,'').toUpperCase();}
function savedItemIdentityChanged(before:SavedItem|undefined,item:SavedItem):boolean{
  return !before||normalizeSavedItemIdentity(text(before.descriptionEn))!==normalizeSavedItemIdentity(text(item.descriptionEn))||normalizeSavedItemIdentity(text(before.descriptionAr))!==normalizeSavedItemIdentity(text(item.descriptionAr))||savedItemSku(before.sku)!==savedItemSku(item.sku);
}
function guardSavedItemChanges(base:SavedItem[],intended:SavedItem[],merged:SavedItem[],movements:InventoryMovementRecord[]):void{
  if(intended===base)return;
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const item of intended){
    const before=baseById.get(item.id);
    if(item.inventoryTracking&&item.inventoryTracking!=='tracked'&&item.inventoryTracking!=='non-stock')throw new Error('Invalid inventory classification.');
    if(before&&movements.some(movement=>movement.itemId===item.id)
      &&(before.unit!==item.unit||(before.inventoryTracking||'tracked')!==(item.inventoryTracking||'tracked')))
      throw new Error('Cannot change unit or inventory classification of a product with stock history. Create a separate catalog item.');
    const identityChanged=savedItemIdentityChanged(before,item);
    const commercialChanged=!before||identityChanged||text(before.unit)!==text(item.unit)||text(before.lastUnitPrice)!==text(item.lastUnitPrice);
    const costChanged=!before||text(before.lastUnitCost)!==text(item.lastUnitCost)||text(before.lastCostCurrency)!==text(item.lastCostCurrency);
    if(commercialChanged){
      if(!text(item.descriptionEn).trim()&&!text(item.descriptionAr).trim())throw new Error(t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.'));
      if(!text(item.unit).trim())throw new Error(t('Unit is required.','الوحدة مطلوبة.'));
      const price=text(item.lastUnitPrice).trim();
      if(price&&!isNonNegativeDecimalInput(price))throw new Error(t('Enter a valid non-negative price.','أدخل سعرًا صالحًا يساوي صفرًا أو أكثر.'));
    }
    if(costChanged){
      const cost=text(item.lastUnitCost).trim();
      if(cost&&!isNonNegativeDecimalInput(cost))throw new Error(t('Enter a valid non-negative unit cost.','أدخل تكلفة وحدة صالحة تساوي صفرًا أو أكثر.'));
    }
    if(identityChanged&&findSavedItemDuplicate(merged,item))throw new Error(t('This item already exists or uses a duplicate SKU. Open the existing item to edit it.','هذا الصنف موجود بالفعل أو يستخدم SKU مكررًا. افتح الصنف الموجود لتعديله.'));
  }
}

function guardConcurrentRecordChanges<T extends {id:string}>(base:T[],intended:T[],latest:T[],label:string,recovery='Reopen Operations before saving or deleting it.'):void{
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
    throw new Error(`${label} changed on another device. ${recovery}`);
  }
  for(const wanted of intended){
    if(baseIds.has(wanted.id))continue;
    const current=latestById.get(wanted.id);
    if(current&&!sameRecord(current,wanted))throw new Error(`${label} changed on another device. ${recovery}`);
  }
}
// A posted purchase establishes a supplier liability even when all its lines
// are services and no stock movements exist. Keep the original record after
// posting or reversal; draft cleanup remains allowed.
function guardPostedPurchaseContinuity(base:PurchaseRecord[],intended:PurchaseRecord[],latest:PurchaseRecord[]):void{
  const wanted=new Set(intended.map(row=>row.id));
  const current=new Set(latest.map(row=>row.id));
  for(const purchase of base){
    if(purchase.status==='draft')continue;
    if(!wanted.has(purchase.id)||!current.has(purchase.id))
      throw new Error('Posted or reversed purchase history cannot be deleted. Reverse the purchase instead.');
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
// Supplier master records carry the identity behind recorded expenses and
// supplier settlements. The UI already refuses to delete those suppliers;
// enforce the same rule for AI/import and remote offline vault merges.
// Purchases intentionally retain independent supplier snapshots and therefore
// do not by themselves block an otherwise unreferenced supplier deletion.
function guardSupplierLinkedHistoryDeletion(
  base:Supplier[],merged:Supplier[],expenses:ExpenseRecord[],
  supplierPayments:SupplierPaymentRecord[]
):void{
  const retained=new Set(merged.map(supplier=>supplier.id));
  for(const supplier of base){
    if(retained.has(supplier.id))continue;
    if(expenses.some(expense=>expense.supplierId===supplier.id)||
       supplierPayments.some(payment=>payment.supplierId===supplier.id))
      throw new Error('Supplier with recorded payments or expenses cannot be deleted.');
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
    // Validate new or edited money strictly; preserve previously stored spelling
    // when an unrelated expense field changes.
    if((!before||before.amount!==expense.amount)&&!isFinancialDecimalInput(expense.amount))
      throw new Error('Expense amount has invalid monetary grouping.');
    const errors=validateExpense(expense);
    if(errors.length)throw new Error(errors[0]);
  }
}
function purchaseCore(purchase:PurchaseRecord):string{
  const {status:_,postedAt:__,reversedAt:___,reverseReason:____,updatedAt:_____,...core}=purchase;
  return JSON.stringify(core);
}
// The reporting grammar remains backward-compatible for stored purchases.
// Reject malformed *new or changed* monetary fields before a draft is saved.
function guardPurchaseMoneyChanges(before:PurchaseRecord|undefined,wanted:PurchaseRecord):void{
  for(const field of ['freight','duty','otherCosts'] as const){
    const amount=wanted[field]||'0';
    if((!before||wanted[field]!==before[field])&&!isNonNegativeFinancialDecimalInput(amount))
      throw new Error('Purchase charge has invalid monetary grouping.');
  }
  const originalLines=new Map((before?.items??[]).map(line=>[line.id,line]));
  for(const line of wanted.items){
    const old=originalLines.get(line.id);
    for(const field of ['unitCost','landedUnitCost'] as const){
      const amount=line[field];
      if(field==='landedUnitCost'&&!amount)continue;
      if((!old||amount!==old[field])&&!isNonNegativeFinancialDecimalInput(amount))
        throw new Error('Purchase unit cost has invalid monetary grouping.');
    }
  }
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
function guardInventoryLedgerIntent(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):void{
  if(intended.inventoryMovements===base.inventoryMovements&&latest.inventoryMovements===base.inventoryMovements)return;
  const intendedById=new Map(intended.inventoryMovements.map(movement=>[movement.id,movement]));
  const latestById=new Map(latest.inventoryMovements.map(movement=>[movement.id,movement]));
  for(const movement of base.inventoryMovements){
    const wanted=intendedById.get(movement.id);
    const remote=latestById.get(movement.id);
    if(!wanted||!remote)throw new Error('Inventory ledger entries are append-only and cannot be deleted. Reverse the movement instead.');
    if(!sameRecord(movement,wanted)||!sameRecord(movement,remote))
      throw new Error('Inventory ledger entries are immutable. Reverse the movement instead of editing history.');
  }
}
function guardNewManualMovements(base:VaultPayload,intended:VaultPayload,movements:InventoryMovementRecord[],savedItems:SavedItem[]):Set<string>{
  const baseIds=new Set(base.inventoryMovements.map(movement=>movement.id));
  const touched=new Set<string>();
  for(const movement of intended.inventoryMovements){
    if(baseIds.has(movement.id))continue;
    touched.add(movement.itemId);
    if(movement.type==='purchase'||movement.type==='purchase-reversal'||movement.type==='transfer')continue;
    // A physical customer return must be validated against its final credit note,
    // original invoice and immutable issue before it can increase a warehouse.
    if(isSalesReturn(movement)||isSalesReturnCorrection(movement)||isInvoiceVoidStockReceipt(movement))continue;
    if(!inventoryMovementIsManual(movement))throw new Error('Unsupported inventory movement type.');
    if(!savedItems.some(item=>item.id===movement.itemId&&item.inventoryTracking!=='non-stock'))throw new Error('Inventory movement needs a tracked catalog item.');
    if(!isIsoDate(movement.date))throw new Error('Movement date is invalid.');
    const quantity=movementQuantity(movement);
    if(movement.type==='opening'&&quantity<0n)throw new Error('Opening stock cannot be negative.');
    if(movement.type==='issue'&&quantity>0n)throw new Error('Stock issues must reduce inventory.');
    const cost=text(movement.unitCost).trim();
    if(cost&&!isNonNegativeDecimalInput(cost))throw new Error('Inventory movement unit cost must be zero or greater.');
    if(!isSalesDeliveryStockIssue(movement)&&!isIssuedInvoiceStockIssue(movement))validateManualMovementEvidence(movement);
    if(movement.sourceId){
      if(movement.type==='issue'&&(isSalesDeliveryStockIssue(movement)||isIssuedInvoiceStockIssue(movement)))continue;
      if(movement.type!=='adjustment')throw new Error('Only an adjustment can reverse a prior manual inventory movement.');
      const source=movements.find(item=>item.id===movement.sourceId);
      if(!source||!inventoryMovementIsManual(source))throw new Error('Manual inventory reversal is linked to an invalid source movement.');
      if(isSalesDeliveryStockIssue(source))throw new Error('Confirmed delivery stock issues cannot be reversed as generic manual adjustments.');
      if(source.itemId!==movement.itemId||movementQuantity(source)!==-quantity)throw new Error('Manual inventory reversal must exactly offset its source movement.');
      const reversals=movements.filter(item=>item.type==='adjustment'&&item.sourceId===source.id);
      if(reversals.length!==1)throw new Error('This manual inventory movement has already been reversed.');
    }
  }
  return touched;
}
// Verify transfer identity and location against the current account state.
// All physical quantity reservations, including transfers mixed with issues or
// receipts, are replayed once in guardNewWarehouseDebits below.
function guardNewWarehouseTransfers(base:VaultPayload,intended:VaultPayload,latest:VaultPayload,warehouses:VaultPayload['warehouses'],savedItems:SavedItem[]):void{
  if(intended.inventoryMovements===base.inventoryMovements)return;
  const beforeIds=new Set(base.inventoryMovements.map(movement=>movement.id));
  const latestIds=new Set(latest.inventoryMovements.map(movement=>movement.id));
  const workspaceId=latest.appSettings.activeWorkspaceId,branchId=latest.appSettings.activeBranchId;
  for(const movement of intended.inventoryMovements){
    if(beforeIds.has(movement.id)||movement.type!=='transfer')continue;
    if(latestIds.has(movement.id))throw new Error('Warehouse transfer already exists. Refresh Stock Locations.');
    if(!inventoryMovementAccountingIsValid(movement))throw new Error('Warehouse transfer details are invalid.');
    if(!savedItems.some(item=>item.id===movement.itemId))throw new Error('Warehouse transfer product is unavailable.');
    for(const locationId of [movement.fromWarehouseId,movement.toWarehouseId]){
      if(!warehouses.some(row=>row.id===locationId&&row.workspaceId===workspaceId&&row.branchId===branchId&&row.active))throw new Error('Warehouse transfer location is no longer active.');
    }

  }
}

/**
 * A company-wide positive quantity must not conceal an overdrawn warehouse.
 * Replay ALL new physical movements against ONE latest-location ledger, including
 * transfers, incoming receipts, outgoing issues and concurrent device changes.
 * Split transfer/debit ledgers would allow two entries to spend the same stock.
 */
function guardNewWarehouseDebits(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):void{
  if(intended.inventoryMovements===base.inventoryMovements)return;
  const previous=new Set(base.inventoryMovements.map(row=>row.id));
  const remote=new Set(latest.inventoryMovements.map(row=>row.id));
  const ledger=[...latest.inventoryMovements];
  for(const movement of intended.inventoryMovements){
    if(previous.has(movement.id))continue;
    if(remote.has(movement.id)){
      // Retain the specialized immutable sales-ledger conflict messages and proof checks.
      if(isSalesDeliveryStockIssue(movement)||isIssuedInvoiceStockIssue(movement)||isInvoiceVoidStockReceipt(movement))continue;
      throw new Error('Concurrent inventory movement already exists. Refresh before posting.');
    }
    // Only NEW ledger entries must meet exact physical precision. Historical
    // persisted movements stay readable without rounding or data rewriting.
    if(!isExactStockQuantityInput(movement.quantity))
      throw new Error('New inventory movement quantity must use at most four decimal places with valid grouping.');
    if(!inventoryMovementAccountingIsValid(movement))
      throw new Error('New inventory movement has invalid quantities or origin.');
    const fallback=defaultWarehouseId(movement.branchId||latest.appSettings.activeBranchId);
    if(movement.type==='transfer'){
      const available=warehouseItemQuantity(movement.itemId,movement.fromWarehouseId!,ledger,fallback);
      if(movementQuantity(movement)>available)
        throw new Error('Transfer quantity exceeds the latest available stock at its source.');
    }else{
      const delta=movementQuantity(movement);
      if(delta<0n){
        const source=movement.fromWarehouseId||fallback;
        const available=warehouseItemQuantity(movement.itemId,source,ledger,fallback);
        if(-delta>available)
          throw new Error('Insufficient stock at the selected warehouse after concurrent changes.');
      }
    }
    ledger.push(movement);
  }
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
    if(cost&&!isNonNegativeDecimalInput(cost))throw new Error('Purchase inventory unit cost must be zero or greater.');
  }
}
// Once a customer invoice is issued it represents a financial claim, even
// before any receipt is collected. Neither side of an offline merge may delete
// that claim or rewrite its commercial facts while keeping status=final.
// Deliberate final->draft revision uses the separate protected snapshot path;
// purely visual metadata and the explicit void transition remain supported.
function issuedInvoiceFinancialFacts(doc:LourexDocument):unknown{
  return{
    id:doc.id,kind:doc.kind,role:doc.role,number:doc.number,
    issueDate:doc.issueDate,dueDate:doc.dueDate,currency:doc.currency,
    customerSnapshot:doc.customerSnapshot,supplierSnapshot:doc.supplierSnapshot,
    companySnapshot:doc.companySnapshot,
    items:doc.items,adjustments:doc.adjustments,internalCosts:doc.internalCosts,
    terms:doc.terms,creditForId:doc.creditForId,creditForNumber:doc.creditForNumber,
    convertedFromId:doc.convertedFromId,bankAccountId:doc.bankAccountId,
    paymentTermPresetId:doc.paymentTermPresetId
  };
}
function guardIssuedInvoiceContinuity(base:VaultPayload,candidate:VaultPayload):void{
  if(candidate.documents===base.documents)return;
  const byId=new Map(candidate.documents.map(doc=>[doc.id,doc]));
  for(const original of base.documents){
    if(original.kind!=='invoice'||original.status!=='final')continue;
    const next=byId.get(original.id);
    if(!next)throw new Error('Issued invoice history cannot be deleted. Void the invoice instead.');
    // Only the audited revision workflow may turn an issued final into a draft.
    if(next.status==='draft')continue;
    if(!sameRecord(issuedInvoiceFinancialFacts(original),issuedInvoiceFinancialFacts(next)))
      throw new Error('Issued invoice financial terms are immutable. Use a documented revision.');
  }
}
// A final document may become an editable draft only after the *same write*
// preserves its exact preceding issued version. Historical snapshots are not
// recreated or normalized: only a new final -> revision-draft transition is
// checked on each side of the offline/cloud merge.
function guardFinalDocumentRevisionOpening(base:VaultPayload,candidate:VaultPayload):void{
  if(candidate.documents===base.documents)return;
  const originalById=new Map(base.documents.map(doc=>[doc.id,doc]));
  const storedRevisionIds=new Set(base.documentRevisions.map(record=>record.id));
  for(const draft of candidate.documents){
    const original=originalById.get(draft.id);
    if(!original||original.status!=='final'||draft.status!=='draft')continue;
    if(draft.lifecycleStatus!=='active'||draft.revision!==documentRevision(original)+1)
      throw new Error('Final document revision number must advance exactly once.');
    const snapshots=candidate.documentRevisions.filter(record=>
      !storedRevisionIds.has(record.id)&&record.documentId===original.id&&
      record.documentNumber===original.number&&record.revision===documentRevision(original));
    const valid=snapshots.some(record=>{
      const {attachments:originalFiles,...issued}=original;
      const {attachments:snapshotFiles,...preserved}=record.snapshot;
      return sameRecord(issued,preserved);
    });
    if(!valid)throw new Error('Final document revision requires a matching original issued snapshot.');
  }
}
// Revision snapshots are the preserved, earlier issued document. Their audit
// identity and contents must survive local edits AND stale-device cloud merges.
function guardDocumentRevisionHistory(
  base:VaultPayload['documentRevisions'],
  intended:VaultPayload['documentRevisions'],
  latest:VaultPayload['documentRevisions']
):void{
  if(intended===base&&latest===base)return;
  const localById=new Map(intended.map(row=>[row.id,row]));
  const remoteById=new Map(latest.map(row=>[row.id,row]));
  for(const original of base){
    const local=localById.get(original.id),remote=remoteById.get(original.id);
    if(!local||!remote)throw new Error('Document revision history cannot be deleted.');
    if(!sameRecord(original,local)||!sameRecord(original,remote))
      throw new Error('Document revision history is immutable.');
  }
}
// Preserve every newly imported purchase/expense independently: generic mergeRecords
// indexes by ID and otherwise silently keeps the last duplicate.
function guardNewOperationalRecordIds<T extends {id:string}>(base:T[],intended:T[],label:string):void{
  if(intended===base)return;
  const existing=new Set(base.map(row=>row.id));
  const seen=new Set<string>();
  for(const row of intended){
    if(existing.has(row.id))continue; // historical IDs are not migrated
    if(!row.id||seen.has(row.id))throw new Error(`New ${label} IDs must be unique.`);
    seen.add(row.id);
  }
}
// Once posted, a supplier purchase establishes a liability even when no stock
// or payment exists. Validate historical posting/reversal integrity against BOTH
// the local intent and the remote state accepted by an offline vault merge.
// Untouched historical rows are never reinterpreted or normalized.
function guardPostedPurchaseAuditChanges(base:PurchaseRecord[],candidate:PurchaseRecord[]):void{
  if(candidate===base)return;
  const nextById=new Map(candidate.map(purchase=>[purchase.id,purchase]));
  for(const before of base){
    if(before.status==='draft')continue;
    const next=nextById.get(before.id);
    if(!next||sameRecord(before,next))continue; // Deletion is guarded separately.
    if(before.status==='reversed')throw new Error('Reversed purchases are immutable.');
    if(next.status!=='reversed')
      throw new Error('Posted purchases are immutable. Reverse the purchase instead of editing it.');
    if(purchaseCore(before)!==purchaseCore(next)||before.postedAt!==next.postedAt)
      throw new Error('Purchase reversal cannot change the original posted purchase details.');
    if(!next.reverseReason?.trim()||!next.reversedAt||
       !isIsoDate(next.reversedAt.slice(0,10))||
       !Number.isFinite(Date.parse(next.reversedAt))||
       (before.postedAt&&next.reversedAt<before.postedAt)||
       next.updatedAt!==next.reversedAt)
      throw new Error('Purchase reversal requires valid reason and chronological audit timestamps.');
  }
}

function guardOperationsChanges(base:VaultPayload,intended:VaultPayload,latest:VaultPayload,suppliers:Supplier[],purchases:PurchaseRecord[],expenses:ExpenseRecord[],movements:InventoryMovementRecord[],savedItems:SavedItem[]):void{
  guardPostedPurchaseContinuity(base.purchases,intended.purchases,latest.purchases);
  guardPostedPurchaseAuditChanges(base.purchases,intended.purchases);
  guardPostedPurchaseAuditChanges(base.purchases,latest.purchases);
  guardConcurrentRecordChanges(base.suppliers,intended.suppliers,latest.suppliers,'Supplier');
  guardConcurrentRecordChanges(base.expenses,intended.expenses,latest.expenses,'Expense');
  guardDraftPurchaseConflicts(base.purchases,intended.purchases,latest.purchases);
  guardSupplierChanges(base.suppliers,intended.suppliers);
  guardSupplierChanges(base.suppliers,latest.suppliers);
  guardExpenseChanges(base.expenses,intended.expenses);
  // A remotely added/edited expense is real spend even when the local save
  // only changes a supplier. Validate both sides with the same amount rules.
  guardExpenseChanges(base.expenses,latest.expenses);
  guardInventoryLedgerIntent(base,intended,latest);
  const affectedPurchases=purchaseIdsAffected(base,intended);
  const baseById=new Map(base.purchases.map(purchase=>[purchase.id,purchase]));
  const intendedById=new Map(intended.purchases.map(purchase=>[purchase.id,purchase]));
  for(const id of affectedPurchases){
    const before=baseById.get(id),wanted=intendedById.get(id),merged=purchases.find(purchase=>purchase.id===id);
    if(wanted)guardPurchaseMoneyChanges(before,wanted);
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
  guardNewWarehouseTransfers(base,intended,latest,latest.warehouses,savedItems);
  const touchedItems=guardNewManualMovements(base,intended,movements,savedItems);
  guardNewWarehouseDebits(base,intended,latest);
  // A stale device can save an unrelated expense while the cloud has newly
  // appended physical inventory. Those remote additions must pass the exact
  // same evidence and warehouse debit checks as local postings. Replaying them
  // against the original immutable stock base avoids counting remote debits
  // as their own available quantity; local debits were already checked above
  // against the full latest ledger.
  if(latest.inventoryMovements!==base.inventoryMovements){
    // A conflicting two-device issue of the SAME documented sale has a more
    // precise immutable sales proof error. Preserve that precedence before
    // replaying physical warehouse availability from the remote side.
    assertSalesStockLedgerContinuity(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
    for(const itemId of guardNewManualMovements(base,latest,movements,savedItems))
      touchedItems.add(itemId);
    const remotePostingBase={...base,appSettings:latest.appSettings,
      warehouses:latest.warehouses};
    guardNewWarehouseTransfers(base,latest,remotePostingBase,latest.warehouses,savedItems);
    guardNewWarehouseDebits(base,latest,remotePostingBase);
  }
  // A remote draft or freshly posted service purchase may create a real
  // supplier payable without any local purchase edit or stock movement.
  // Validate remote new/changed purchase cost syntax and the authoritative
  // merged purchase identity/state as strictly as a local write, without
  // retroactively validating unchanged stored historical purchase amounts.
  const remotePurchaseById=new Map(latest.purchases.map(purchase=>[purchase.id,purchase]));
  const basePurchaseById=new Map(base.purchases.map(purchase=>[purchase.id,purchase]));
  for(const id of purchaseIdsAffected(base,latest)){
    const remote=remotePurchaseById.get(id);
    const original=basePurchaseById.get(id);
    if(remote)guardPurchaseMoneyChanges(original,remote);
    const merged=purchases.find(purchase=>purchase.id===id);
    if(merged)guardPurchaseState(merged,purchases,movements,savedItems);
  }
  for(const id of affectedPurchases){const purchase=purchases.find(item=>item.id===id);for(const line of purchase?.items??[])if(line.savedItemId)touchedItems.add(line.savedItemId);}
  for(const itemId of touchedItems){
    const latestQuantity=inventoryQuantity(itemId,latest.inventoryMovements);
    const mergedQuantity=inventoryQuantity(itemId,movements);
    if(mergedQuantity<0n&&mergedQuantity<latestQuantity)throw new Error('Inventory cannot fall below zero. Reduce the issue or restore stock before reversing it.');
  }
  guardSavedItemInventoryRemoval(base,intended,purchases,movements);
}

function guardRecurringWorkflowChanges(base:RecurringWorkflowRecord[],intended:RecurringWorkflowRecord[],latest:RecurringWorkflowRecord[]):void{
  if(intended===base)return;
  guardConcurrentRecordChanges(base,intended,latest,'Recurring workflow','Reopen the Recurring Manager before saving or generating a draft.');
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const workflow of intended){const before=baseById.get(workflow.id);if(before&&sameRecord(before,workflow))continue;assertRecurringWorkflow(workflow);}
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
  if(intended.activeTeamMemberId!==base.activeTeamMemberId)next.activeTeamMemberId=intended.activeTeamMemberId;
  if(intended.activeWorkspaceId!==base.activeWorkspaceId)next.activeWorkspaceId=intended.activeWorkspaceId;
  if(intended.activeBranchId!==base.activeBranchId)next.activeBranchId=intended.activeBranchId;
  const numberingKeys:Array<keyof AppSettings['numbering']>=['proformaPrefix','invoicePrefix','creditNotePrefix','purchaseOrderPrefix','proformaLast','invoiceLast','creditNoteLast','purchaseOrderLast','proformaYear','invoiceYear','creditNoteYear','purchaseOrderYear'];
  for(const key of numberingKeys)if(intended.numbering[key]!==base.numbering[key])(next.numbering as any)[key]=intended.numbering[key];
  const smartKeys:Array<Exclude<keyof AppSettings['smartDefaults'],'favoriteTemplateIds'>>=['currency','language','incoterm','paymentTerms','deliveryTime','quoteTemplateId','invoiceTemplateId'];
  for(const key of smartKeys)if(intended.smartDefaults[key]!==base.smartDefaults[key])(next.smartDefaults as any)[key]=intended.smartDefaults[key];
  if(!sameArray(intended.smartDefaults.favoriteTemplateIds,base.smartDefaults.favoriteTemplateIds))next.smartDefaults.favoriteTemplateIds=[...intended.smartDefaults.favoriteTemplateIds];
  return next;
}

// Generic record merging indexes by ID. For a new reconciliation or Undo,
// duplicate IDs could silently discard an event, and unvalidated remote events
// could alter the bank reconciliation state during unrelated local writes.
function guardNewTreasuryReconciliationEvents(
  base:VaultPayload['treasuryReconciliations'],
  candidate:VaultPayload['treasuryReconciliations']
):void{
  if(candidate===base)return;
  const historicalIds=new Set(base.map(row=>row.id));
  const freshIds=new Set<string>();
  for(const row of candidate){
    if(historicalIds.has(row.id))continue; // historical event spellings stay untouched
    if(!row.id||freshIds.has(row.id))
      throw new Error('New treasury reconciliation event IDs must be unique.');
    freshIds.add(row.id);
    if(!row.movementKey?.trim()||!row.createdAt||!Number.isFinite(Date.parse(row.createdAt))||
      (row.action&&row.action!=='reconcile'&&row.action!=='undo')||
      (row.action==='undo'&&row.reconciledAt)||
      (row.action!=='undo'&&(!row.reconciledAt||!Number.isFinite(Date.parse(row.reconciledAt)))))
      throw new Error('New treasury reconciliation audit event is invalid.');
  }
}

// Treasury movements are an audit ledger, not mutable form records. The Cash &
// Bank screen corrects an entry by voiding it, preserving its original details.
// Enforce that same contract for direct, offline and concurrently merged writes.
// A newly synchronized bank entry may already have been posted AND voided on
// another device. Preserve those legitimate two-step histories, but require
// their final cancellation metadata to be internally auditable. Previously
// saved rows (including old legacy formats) are deliberately grandfathered.
function guardNewTreasuryVoidMetadata(
  base:VaultPayload['treasuryEntries'],
  candidate:VaultPayload['treasuryEntries']
):void{
  if(candidate===base)return;
  const knownIds=new Set(base.map(entry=>entry.id));
  for(const entry of candidate){
    if(knownIds.has(entry.id)||!entry.voidedAt)continue;
    const created=Date.parse(entry.createdAt||'');
    const cancelled=Date.parse(entry.voidedAt);
    if(!Number.isFinite(created)||!Number.isFinite(cancelled)||
       cancelled<created||!isIsoDate(entry.voidedAt.slice(0,10))||
       !entry.voidReason?.trim()||entry.updatedAt!==entry.voidedAt)
      throw new Error('New treasury entry cancellation audit metadata is invalid.');
  }
}

function guardTreasuryEntryHistory(
  base:VaultPayload['treasuryEntries'],
  intended:VaultPayload['treasuryEntries'],
  latest:VaultPayload['treasuryEntries']
):void{
  const intendedById=new Map(intended.map(entry=>[entry.id,entry]));
  const latestById=new Map(latest.map(entry=>[entry.id,entry]));
  for(const original of base){
    const wanted=intendedById.get(original.id);
    const remote=latestById.get(original.id);
    if(!wanted||!remote)throw new Error('Treasury entry history cannot be deleted. Void the entry instead.');
    for(const next of [wanted,remote]){
      if(sameRecord(original,next))continue;
      const immutable=(entry:typeof original)=>{
        const {voidedAt:_voidedAt,voidReason:_voidReason,updatedAt:_updatedAt,...record}=entry;
        return record;
      };
      if(!sameRecord(immutable(original),immutable(next)))
        throw new Error('Recorded treasury entry is immutable. Void it and post a corrected entry.');
      if(original.voidedAt||!next.voidedAt||!next.voidReason?.trim()||
        !isIsoDate(next.voidedAt.slice(0,10))||
        !Number.isFinite(Date.parse(next.voidedAt))||
        (original.createdAt&&next.voidedAt<original.createdAt)||
        next.updatedAt!==next.voidedAt)
        throw new Error('Treasury entry history permits only a valid one-time void.');
    }
  }
}

// A payment already allocated to an active cash/bank entry cannot be edited or
// deleted independently. Void/correct its treasury allocation first, preserving
// the financial audit trail and preventing orphaned source references.
// Supplier settlement history is append-only on BOTH sides of an offline merge.
// A recorded payment can only transition to a one-time, reasoned cancellation;
// neither device may silently erase or rewrite the prior money and source links.
function guardSupplierPaymentHistory(base:SupplierPaymentRecord[],candidate:SupplierPaymentRecord[]):void{
  if(candidate===base)return;
  const byId=new Map(candidate.map(row=>[row.id,row]));
  const immutable=(payment:SupplierPaymentRecord)=>({
    id:payment.id,purchaseId:payment.purchaseId,purchaseNumber:payment.purchaseNumber,
    supplierId:payment.supplierId,supplierNameEn:payment.supplierNameEn,supplierNameAr:payment.supplierNameAr,
    currency:payment.currency,amount:payment.amount,date:payment.date,method:payment.method,
    reference:payment.reference,notes:payment.notes,createdAt:payment.createdAt,
    workspaceId:payment.workspaceId||'default',branchId:payment.branchId||'main'
  });
  for(const original of base){
    const next=byId.get(original.id);
    if(!next)throw new Error('Supplier payment history cannot be deleted. Void the payment instead.');
    if(!sameRecord(immutable(original),immutable(next)))
      throw new Error('Recorded supplier payment is immutable. Void it and create a corrected payment.');
    if(original.voidedAt&&(
      original.voidedAt!==next.voidedAt||original.voidReason!==next.voidReason
    ))throw new Error('A voided supplier payment cannot be restored or changed.');
    if(!original.voidedAt&&next.voidedAt&&(!next.voidReason?.trim()||!Number.isFinite(Date.parse(next.voidedAt))))
      throw new Error('Supplier payment void requires a reason and valid timestamp.');
  }
}

function guardAllocatedPaymentChanges<T extends {id:string}>(
  base:T[],intended:T[],entries:VaultPayload['treasuryEntries'],
  sourceType:'customer-payment'|'supplier-payment',label:string
):void{
  if(intended===base)return;
  const wanted=new Map(intended.map(row=>[row.id,row]));
  for(const before of base){
    const after=wanted.get(before.id);
    if(after&&sameRecord(before,after))continue;
    if(entries.some(entry=>!entry.voidedAt&&entry.sourceType===sourceType&&entry.sourceId===before.id)){
      throw new Error(`${label} has an active linked treasury entry. Void or correct that entry before changing the payment.`);
    }
  }
}

export function mergeVaultIntent(base:VaultPayload,intended:VaultPayload,latest:VaultPayload):VaultPayload{
  // Saved product IDs also back immutable warehouse movements and invoice
  // item references: never let fresh same-ID imports collapse their identities.
  // Customer and supplier IDs are long-lived foreign keys for commercial
  // documents and settlements. Never let fresh same-ID records collapse.
  guardNewOperationalRecordIds(base.customers,intended.customers,'customer');
  guardNewOperationalRecordIds(base.customers,latest.customers,'customer');
  guardNewOperationalRecordIds(base.suppliers,intended.suppliers,'supplier');
  guardNewOperationalRecordIds(base.suppliers,latest.suppliers,'supplier');
  guardNewOperationalRecordIds(base.savedItems,intended.savedItems,'saved item');
  guardNewOperationalRecordIds(base.savedItems,latest.savedItems,'saved item');
  guardNewOperationalRecordIds(base.purchases,intended.purchases,'purchase');
  guardNewOperationalRecordIds(base.purchases,latest.purchases,'purchase');
  guardNewOperationalRecordIds(base.expenses,intended.expenses,'expense');
  guardNewOperationalRecordIds(base.expenses,latest.expenses,'expense');
  // Do not replay two physical transfers/issues only to persist the last same-ID movement.
  guardNewOperationalRecordIds(base.inventoryMovements,intended.inventoryMovements,'inventory movement');
  guardNewOperationalRecordIds(base.inventoryMovements,latest.inventoryMovements,'inventory movement');
  // Customer credit terms and master identity are saved as whole records.
  // Reject stale same-ID writes instead of silently replacing changes another
  // device made to credit limits, payment terms or customer contact details.
  // Unrelated customers and identical concurrent changes still merge normally.
  guardConcurrentRecordChanges(base.customers,intended.customers,latest.customers,
    'Customer','Reopen Customers before saving or deleting this customer.');
  const customers=mergeRecords(base.customers,intended.customers,latest.customers);
  const savedItems=mergeRecords(base.savedItems,intended.savedItems,latest.savedItems);
  const suppliers=mergeRecords(base.suppliers,intended.suppliers,latest.suppliers);
  const purchases=mergeRecords(base.purchases,intended.purchases,latest.purchases);
  const expenses=mergeRecords(base.expenses,intended.expenses,latest.expenses);
  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  guardConcurrentRecordChanges(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts,'Treasury account','Reopen Cash & Bank before saving this account.');
  const treasuryAccounts=mergeRecords(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts);
  for(const account of treasuryAccounts)assertTreasuryAccount(account);
  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before saving this entry.');
  guardTreasuryEntryHistory(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);
  guardNewTreasuryVoidMetadata(base.treasuryEntries,intended.treasuryEntries);
  guardNewTreasuryVoidMetadata(base.treasuryEntries,latest.treasuryEntries);
  // A remote new posting is not trusted merely because it arrived from another
  // device. Reject new remote ID collisions before the generic ID-keyed merge.
  guardNewOperationalRecordIds(base.treasuryEntries,latest.treasuryEntries,'treasury entry');
  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);
  if(intended.treasuryEntries!==base.treasuryEntries){
    const existingIds=new Set(base.treasuryEntries.map(entry=>entry.id));
    const newIds=new Set<string>();
    for(const entry of intended.treasuryEntries){
      if(existingIds.has(entry.id))continue;
      if(newIds.has(entry.id))throw new Error('New treasury entry IDs must be unique.');
      newIds.add(entry.id);
      if(!isFinancialDecimalInput(entry.amount))
        throw new Error('New treasury amount has invalid monetary grouping.');
    }
  }
  if(latest.treasuryEntries!==base.treasuryEntries){
    const historicalIds=new Set(base.treasuryEntries.map(entry=>entry.id));
    for(const entry of latest.treasuryEntries){
      if(!historicalIds.has(entry.id)&&!isFinancialDecimalInput(entry.amount))
        throw new Error('New treasury amount has invalid monetary grouping.');
    }
  }
  // Read-only validation of existing historical treasury values remains unchanged.
  for(const entry of treasuryEntries)assertTreasuryEntry(entry,treasuryAccounts);
  // Reconciliation/Undo events are financial audit history; a later device must
  // not erase or rewrite records that were previously saved.
  const intendedReconciliationById=new Map(intended.treasuryReconciliations.map(row=>[row.id,row]));
  const latestReconciliationById=new Map(latest.treasuryReconciliations.map(row=>[row.id,row]));
  for(const original of base.treasuryReconciliations){
    const next=intendedReconciliationById.get(original.id);
    const remote=latestReconciliationById.get(original.id);
    if(!next||!remote)throw new Error('Treasury reconciliation history cannot be deleted.');
    if(!sameRecord(original,next)||!sameRecord(original,remote))throw new Error('Treasury reconciliation history is immutable.');
  }
  guardNewTreasuryReconciliationEvents(base.treasuryReconciliations,intended.treasuryReconciliations);
  guardNewTreasuryReconciliationEvents(base.treasuryReconciliations,latest.treasuryReconciliations);
  for(const row of intended.treasuryReconciliations){
    if(!row.id||!row.movementKey?.trim()||!row.createdAt||!Number.isFinite(Date.parse(row.createdAt))||
      (row.action&&row.action!=='reconcile'&&row.action!=='undo')||
      (row.action==='undo'&&row.reconciledAt)||
      (row.action!=='undo'&&(!row.reconciledAt||!Number.isFinite(Date.parse(row.reconciledAt)))))
      throw new Error('Treasury reconciliation audit event is invalid.');
  }
  guardConcurrentRecordChanges(base.treasuryReconciliations,intended.treasuryReconciliations,latest.treasuryReconciliations,'Treasury reconciliation','Reload Cash & Bank before reconciling this movement.');
  const treasuryReconciliations=mergeRecords(base.treasuryReconciliations,intended.treasuryReconciliations,latest.treasuryReconciliations);
  guardConcurrentRecordChanges(base.fxRates,intended.fxRates,latest.fxRates,'FX rate','Reload FX before saving this rate.');
  const fxRates=mergeRecords(base.fxRates,intended.fxRates,latest.fxRates);
  for(const rate of fxRates)assertFxRate(rate);
  guardConcurrentRecordChanges(base.warehouses,intended.warehouses,latest.warehouses,'Warehouse','Reload Stock Locations before saving this location.');
  const warehouses=mergeRecords(base.warehouses,intended.warehouses,latest.warehouses);
  for(const warehouse of warehouses){const errors=validateWarehouse(warehouse,warehouses);if(errors.length)throw new Error(errors[0]);}
  const workspaces=mergeRecords(base.workspaces,intended.workspaces,latest.workspaces);
  const branches=mergeRecords(base.branches,intended.branches,latest.branches);
  guardConcurrentRecordChanges(base.teamMembers,intended.teamMembers,latest.teamMembers,'Team member','Reopen Access settings before saving this member.');
  const teamMembers=mergeRecords(base.teamMembers,intended.teamMembers,latest.teamMembers);
  const approvalPolicies=mergeRecords(base.approvalPolicies,intended.approvalPolicies,latest.approvalPolicies);
  guardConcurrentRecordChanges(base.approvalRequests,intended.approvalRequests,latest.approvalRequests,'Approval request','Reopen Access settings before deciding this request.');
  const approvalRequests=mergeRecords(base.approvalRequests,intended.approvalRequests,latest.approvalRequests);
  guardRecurringWorkflowChanges(base.recurringWorkflows,intended.recurringWorkflows,latest.recurringWorkflows);
  const recurringWorkflows=mergeRecords(base.recurringWorkflows,intended.recurringWorkflows,latest.recurringWorkflows);
  const documents=mergeDocuments(base.documents,intended.documents,latest.documents);
  guardConcurrentRecordChanges(base.payments,intended.payments,latest.payments,'Payment','Reopen the invoice before saving or deleting the payment.');
  // New remotely recorded customer receipts are keyed by ID during merging.
  // Reject blank/reused incoming IDs before the merge can discard a receipt.
  guardNewOperationalRecordIds(base.payments,latest.payments,'customer payment');
  const payments=mergeRecords(base.payments,intended.payments,latest.payments);
  // The normal payment form validates amounts strictly. Enforce the same rule at
  // the authoritative save boundary for new imported, AI or offline payments.
  // Existing payment IDs retain their immutable historical numeric spelling.
  if(intended.payments!==base.payments){
    const originalIds=new Set(base.payments.map(payment=>payment.id));
    const originalById=new Map(base.payments.map(payment=>[payment.id,payment]));
    const newIds=new Set<string>();
    for(const payment of intended.payments){
      if(originalIds.has(payment.id)){
        // Existing money can retain its historical spelling, but an edit to
        // that money must use the strict grammar of a new receipt.
        if(originalById.get(payment.id)?.amount!==payment.amount&&!isFinancialDecimalInput(payment.amount))
          throw new Error('Changed customer payment amount has invalid monetary grouping.');
        continue;
      }
      if(!payment.id||newIds.has(payment.id))
        throw new Error('New customer payment IDs must be unique.');
      newIds.add(payment.id);
      if(!isFinancialDecimalInput(payment.amount))
        throw new Error('New customer payment amount has invalid monetary grouping.');
    }
  }
  // A remote payment edit is subject to the same new-money syntax before a
  // stale device may merge an unrelated expense or inventory adjustment.
  // Identical historical strings are left alone, including cloud JSON clones.
  if(latest.payments!==base.payments){
    const originalById=new Map(base.payments.map(payment=>[payment.id,payment]));
    for(const payment of latest.payments){
      const original=originalById.get(payment.id);
      if((!original||original.amount!==payment.amount)&&!isFinancialDecimalInput(payment.amount))
        throw new Error('Changed customer payment amount has invalid monetary grouping.');
    }
  }
  // A remote newly created payment is a real supplier settlement. Its fresh
  // identity and monetary grammar must be validated before ID-keyed merging,
  // even when this device only saves an unrelated operational record.
  guardNewOperationalRecordIds(base.supplierPayments,latest.supplierPayments,'supplier payment');
  if(latest.supplierPayments!==base.supplierPayments){
    const recordedIds=new Set(base.supplierPayments.map(payment=>payment.id));
    for(const payment of latest.supplierPayments){
      if(recordedIds.has(payment.id))continue; // do not revalue stored history
      if(!isFinancialDecimalInput(payment.amount))
        throw new Error('New supplier payment amount has invalid monetary grouping.');
    }
  }
  // Recorded payments are append-only: only a one-time void transition is legal.
  // A merge must never quietly erase historical payments or rewrite settled amounts.
  if(intended.supplierPayments!==base.supplierPayments){
    // Direct imports, AI and offline merges must obey the same NEW-entry grammar.
    // Preserve immutable legacy payments exactly as stored: no migration or revaluation.
    const originalIds=new Set(base.supplierPayments.map(row=>row.id));
    const newIds=new Set<string>();
    for(const payment of intended.supplierPayments){
      if(originalIds.has(payment.id))continue;
      if(!payment.id||newIds.has(payment.id))
        throw new Error('New supplier payment IDs must be unique.');
      newIds.add(payment.id);
      if(!isFinancialDecimalInput(payment.amount))
        throw new Error('New supplier payment amount has invalid monetary grouping.');
    }
  }
  guardSupplierPaymentHistory(base.supplierPayments,intended.supplierPayments);
  guardSupplierPaymentHistory(base.supplierPayments,latest.supplierPayments);
  guardConcurrentRecordChanges(base.supplierPayments,intended.supplierPayments,latest.supplierPayments,'Supplier payment','Reopen Supplier Payables before saving or deleting the payment.');
  const supplierPayments=mergeRecords(base.supplierPayments,intended.supplierPayments,latest.supplierPayments);
  // Check against the final merged history so a concurrently appended expense
  // also protects its supplier from deletion by a stale device.
  guardSupplierLinkedHistoryDeletion(base.suppliers,suppliers,expenses,supplierPayments);
  guardAllocatedPaymentChanges(base.payments,intended.payments,treasuryEntries,'customer-payment','Customer payment');
  // Apply the same live bank-allocation barrier to the remote side of a stale-device merge.
  // Unallocated customer receipts retain the existing edit/delete workflow.
  guardAllocatedPaymentChanges(base.payments,latest.payments,treasuryEntries,'customer-payment','Customer payment');
  guardAllocatedPaymentChanges(base.supplierPayments,intended.supplierPayments,treasuryEntries,'supplier-payment','Supplier payment');
  for(const entry of treasuryEntries)if(!entry.voidedAt&&entry.sourceType==='supplier-payment'&&supplierPayments.some(payment=>payment.id===entry.sourceId&&payment.voidedAt))throw new Error('Active cash/bank entry references a voided supplier payment. Void the treasury entry first.');
  guardCustomerChanges(base.customers,intended.customers,customers);
  // Cloud-side edits are subject to the same name, email and credit control
  // authority; previously stored unchanged legacy fields remain untouched.
  guardCustomerChanges(base.customers,latest.customers,customers);
  guardSavedItemChanges(base.savedItems,intended.savedItems,savedItems,inventoryMovements);
  // Validate external device changes against the same physical unit,
  // tracking-classification and SKU/cost restrictions as local edits.
  guardSavedItemChanges(base.savedItems,latest.savedItems,savedItems,inventoryMovements);
  guardFinancialSettlementChanges(base,intended,documents,payments);
  // A remote paid-invoice deletion, void or monetary rewrite must pass the same
  // invariant before an unrelated local edit can accept it. Deep record equality
  // in financialInvoiceIds skips unchanged deserialized legacy records.
  guardFinancialSettlementChanges(base,latest,documents,payments);
  guardOperationsChanges(base,intended,latest,suppliers,purchases,expenses,inventoryMovements,savedItems);
  assertSupplierPaymentInvariant(purchases,suppliers,supplierPayments);
  // All newly posted active treasury entries share the same cash/bank authority
  // as the UI, including manual deposits, withdrawals and transfers. This keeps
  // account activity, workspace and reconciliation checks at the save boundary.
  // Existing ledger entries and previously saved voids remain grandfathered.
  if(intended.treasuryEntries!==base.treasuryEntries||latest.treasuryEntries!==base.treasuryEntries){
    // Check ALL new, active merged entries against the same posting authority,
    // including valid remote-only additions during unrelated local writes.
    const storedIds=new Set(base.treasuryEntries.map(entry=>entry.id));
    const checked=treasuryEntries.filter(entry=>storedIds.has(entry.id)||Boolean(entry.voidedAt));
    for(const entry of treasuryEntries){
      if(storedIds.has(entry.id)||entry.voidedAt)continue;
      appendTreasuryEntry({
        ...latest,documents,payments,supplierPayments,purchases,suppliers,treasuryAccounts,
        treasuryEntries:checked
      },entry);
      checked.push(entry);
    }
  }
  // Delivery-linked invoice evidence has a specialized immutable identity
  // guard and precise conflict errors. Keep it first, then reject other new
  // audit ID collisions before the generic merge can lose a financial event.
  assertDeliveryInvoiceLedgerContinuity(base.documentEvents,intended.documentEvents,latest.documentEvents);
  guardNewOperationalRecordIds(base.documentEvents,intended.documentEvents,'document event');
  guardNewOperationalRecordIds(base.documentEvents,latest.documentEvents,'document event');
  assertSalesStockLedgerContinuity(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  assertInvoiceStockLedgerContinuity(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  assertSalesReturnLedgerContinuity(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  assertInvoiceVoidStockContinuity(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);
  assertInvoiceVoidDocumentContinuity(base.documents,intended.documents,latest.documents,base.inventoryMovements);
  const documentEvents=mergeRecords(base.documentEvents,intended.documentEvents,latest.documentEvents);
  assertGoodsReceiptIntegrity(documents,documentEvents);
  assertSupplierInvoiceIntegrity(documents,documentEvents);
  assertSalesOrderIntegrity(documents,documentEvents);
  assertSalesDeliveryIntegrity(documents,documentEvents);
  assertDeliveryInvoiceIntegrity(documents,documentEvents);
  // Block final invoice imports and concurrent merges that omit the mandatory stock movement.
  // Existing historical issued invoices are intentionally grandfathered, never re-posted.
  for(const doc of documents){
    if(doc.kind!=='invoice'||doc.role!=='standard'||doc.status!=='final'||doc.lifecycleStatus==='voided')continue;
    const old=base.documents.find(row=>row.id===doc.id);
    const intendedDoc=intended.documents.find(row=>row.id===doc.id);
    if(old?.status==='final'||intendedDoc?.status!=='final')continue;
    const scopedStock=postIssuedInvoiceStock({...latest,documents,documentEvents,inventoryMovements,savedItems,warehouses},doc);
    if(scopedStock.created)throw new Error('A final invoice must commit its stock issues atomically. Reopen and issue again.');
  }
  assertInvoiceVoidStockIntegrity(documents,inventoryMovements);
  assertPostedInvoiceStockDocumentIntegrity(documents,inventoryMovements);
  assertSalesReturnIntegrity({documents,inventoryMovements,warehouses,appSettings:latest.appSettings});
  assertSalesDeliveryStockIntegrity({documents,documentEvents,inventoryMovements,savedItems,warehouses,appSettings:latest.appSettings});
  assertMatchedSupplierInvoicePostingIntegrity({documents,documentEvents,purchases,inventoryMovements});
  // A financial revision is a historical document snapshot, not an editable
  // cached copy. New record IDs cannot collapse, and stored versions never
  // disappear or silently change across independent device edits.
  guardIssuedInvoiceContinuity(base,intended);
  guardIssuedInvoiceContinuity(base,latest);
  guardFinalDocumentRevisionOpening(base,intended);
  guardFinalDocumentRevisionOpening(base,latest);
  guardDocumentRevisionHistory(base.documentRevisions,intended.documentRevisions,latest.documentRevisions);
  guardNewOperationalRecordIds(base.documentRevisions,intended.documentRevisions,'document revision');
  guardNewOperationalRecordIds(base.documentRevisions,latest.documentRevisions,'document revision');
  return {
    ...latest,
    schemaVersion:Math.max(latest.schemaVersion,intended.schemaVersion),
    company:mergeCompany(base.company,intended.company,latest.company),
    customers,
    suppliers,
    purchases,
    supplierPayments,
    expenses,
    inventoryMovements,
    treasuryAccounts,
    treasuryEntries,
    treasuryReconciliations,
    fxRates,
    warehouses,
    workspaces,
    branches,
    teamMembers,
    approvalPolicies,
    approvalRequests,
    recurringWorkflows,
    documents,
    documentEvents,
    documentRevisions:mergeRecords(base.documentRevisions,intended.documentRevisions,latest.documentRevisions),
    payments,
    savedItems,
    appSettings:mergeAppSettings(base.appSettings,intended.appSettings,latest.appSettings)
  };
}
