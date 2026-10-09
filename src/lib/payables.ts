import type { PaymentMethod, PurchaseRecord, Supplier, SupplierPaymentRecord } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isDecimalInput } from './money.js';
import { purchaseTotals } from './operations.js';

export type PayablesAgingBucket='current'|'days1to30'|'days31to60'|'days61to90'|'days90plus';
export type SupplierPayableState='draft'|'unpaid'|'partial'|'paid'|'overdue'|'reversed';
export interface PayablesAgingAmounts{current:string;days1to30:string;days31to60:string;days61to90:string;days90plus:string;}
export interface PurchasePayableSummary{
  purchaseId:string;purchaseNumber:string;supplierId:string;currency:string;date:string;dueDate:string;
  total:string;paid:string;remaining:string;state:SupplierPayableState;daysOverdue:number;agingBucket:PayablesAgingBucket;
}
export interface CurrencyPayableSummary{
  currency:string;purchases:string;paid:string;remaining:string;overdue:string;aging:PayablesAgingAmounts;openPurchases:number;overduePurchases:number;
}
export interface SupplierCurrencyPayableSummary extends CurrencyPayableSummary{supplierId:string;}
export interface SupplierAccountSummary{supplierId:string;supplier:Supplier|null;currencies:SupplierCurrencyPayableSummary[];hasOverdue:boolean;openPurchases:number;}
export interface SupplierStatementEntry{currency:string;date:string;reference:string;type:'purchase'|'payment';description:string;debit:string;credit:string;balance:string;purchaseNumber:string;}
export interface SupplierStatementCurrency{currency:string;entries:SupplierStatementEntry[];purchases:string;paid:string;remaining:string;overdue:string;}

const METHODS=new Set<PaymentMethod>(['cash','bank-transfer','card','cheque','other']);
function nowIso():string{return new Date().toISOString();}
function centsString(cents:bigint):string{const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function cleanCurrency(value:string):string{return value.trim().toUpperCase();}
function dayNumber(iso:string):number{const [year='0',month='1',day='1']=iso.split('-');return Math.floor(Date.UTC(Number(year),Number(month)-1,Number(day))/86_400_000);}
function purchaseSupplierId(purchase:PurchaseRecord):string{return purchase.supplierSnapshot?.sourceSupplierId?.trim()||`legacy-purchase:${purchase.id}`;}
function paymentCents(payment:SupplierPaymentRecord):bigint{return isDecimalInput(payment.amount)?decimalToScaled(payment.amount,2):0n;}
function liabilityCents(purchase:PurchaseRecord):bigint{return decimalToScaled(purchaseTotals(purchase).landedTotal,2);}
function paymentKnownOnOrBefore(payment:SupplierPaymentRecord,asOf:string):boolean{
  if(!asOf)return true;
  if(payment.date>asOf)return false;
  // Backdated payment entered later must not rewrite a previously closed report.
  const createdDate=payment.createdAt?.slice(0,10)||'';
  return !createdDate||(isIsoDate(createdDate)&&createdDate<=asOf);
}
function postedOnOrBefore(purchase:PurchaseRecord,asOf:string):boolean{
  if(purchase.status!=='posted')return false;
  if(!asOf)return true;
  if(purchase.date>asOf)return false;
  const postedDate=purchase.postedAt?.slice(0,10)||'';
  return !postedDate||(isIsoDate(postedDate)&&postedDate<=asOf);
}

export function supplierDaysOverdue(dueDate:string,today=todayIso()):number{
  if(!isIsoDate(dueDate)||!isIsoDate(today)||dueDate>=today)return 0;
  return Math.max(0,dayNumber(today)-dayNumber(dueDate));
}
export function supplierAgingBucketFor(dueDate:string,today=todayIso()):PayablesAgingBucket{
  const days=supplierDaysOverdue(dueDate,today);
  if(days<=0)return'current';if(days<=30)return'days1to30';if(days<=60)return'days31to60';if(days<=90)return'days61to90';return'days90plus';
}

export function supplierPaymentsForPurchase(purchase:PurchaseRecord,payments:SupplierPaymentRecord[]):SupplierPaymentRecord[]{
  if(purchase.status!=='posted')return[];
  const currency=cleanCurrency(purchase.currency);
  return payments.filter(payment=>payment.purchaseId===purchase.id&&cleanCurrency(payment.currency)===currency);
}

export function purchasePayableSummary(purchase:PurchaseRecord,payments:SupplierPaymentRecord[],today=todayIso()):PurchasePayableSummary{
  const total=liabilityCents(purchase);
  const linked=purchase.status==='posted'?supplierPaymentsForPurchase(purchase,payments).filter(payment=>paymentKnownOnOrBefore(payment,today)):[];
  const paid=linked.reduce((sum,payment)=>sum+paymentCents(payment),0n);
  const remaining=purchase.status==='posted'?(total>paid?total-paid:0n):purchase.status==='draft'?total:0n;
  const days=purchase.status==='posted'&&remaining>0n?supplierDaysOverdue(purchase.dueDate,today):0;
  const state:SupplierPayableState=purchase.status==='draft'?'draft':purchase.status==='reversed'?'reversed':remaining===0n?'paid':days>0?'overdue':paid>0n?'partial':'unpaid';
  return{purchaseId:purchase.id,purchaseNumber:purchase.number,supplierId:purchaseSupplierId(purchase),currency:cleanCurrency(purchase.currency),date:purchase.date,dueDate:purchase.dueDate,total:centsString(total),paid:centsString(paid),remaining:centsString(remaining),state,daysOverdue:days,agingBucket:supplierAgingBucketFor(purchase.dueDate,today)};
}

export function supplierPayablesByCurrency(purchases:PurchaseRecord[],payments:SupplierPaymentRecord[],today=todayIso(),supplierId=''):CurrencyPayableSummary[]{
  const map=new Map<string,{purchases:bigint;paid:bigint;remaining:bigint;overdue:bigint;aging:Record<PayablesAgingBucket,bigint>;openPurchases:number;overduePurchases:number}>();
  for(const purchase of purchases){
    if(!postedOnOrBefore(purchase,today))continue;
    if(supplierId&&purchaseSupplierId(purchase)!==supplierId)continue;
    const summary=purchasePayableSummary(purchase,payments,today);
    const row=map.get(summary.currency)??{purchases:0n,paid:0n,remaining:0n,overdue:0n,aging:{current:0n,days1to30:0n,days31to60:0n,days61to90:0n,days90plus:0n},openPurchases:0,overduePurchases:0};
    const total=decimalToScaled(summary.total,2),paid=decimalToScaled(summary.paid,2),remaining=decimalToScaled(summary.remaining,2);
    row.purchases+=total;row.paid+=paid;row.remaining+=remaining;
    if(remaining>0n){row.openPurchases+=1;row.aging[summary.agingBucket]+=remaining;if(summary.state==='overdue'){row.overdue+=remaining;row.overduePurchases+=1;}}
    map.set(summary.currency,row);
  }
  return[...map.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,row])=>({currency,purchases:centsString(row.purchases),paid:centsString(row.paid),remaining:centsString(row.remaining),overdue:centsString(row.overdue),aging:{current:centsString(row.aging.current),days1to30:centsString(row.aging.days1to30),days31to60:centsString(row.aging.days31to60),days61to90:centsString(row.aging.days61to90),days90plus:centsString(row.aging.days90plus)},openPurchases:row.openPurchases,overduePurchases:row.overduePurchases}));
}

export function supplierAccounts(suppliers:Supplier[],purchases:PurchaseRecord[],payments:SupplierPaymentRecord[],today=todayIso()):SupplierAccountSummary[]{
  const supplierMap=new Map(suppliers.map(supplier=>[supplier.id,supplier]));
  const ids=new Set(purchases.filter(purchase=>postedOnOrBefore(purchase,today)).map(purchaseSupplierId));
  return[...ids].map(supplierId=>{const currencies=supplierPayablesByCurrency(purchases,payments,today,supplierId).map(row=>({...row,supplierId}));return{supplierId,supplier:supplierMap.get(supplierId)??null,currencies,hasOverdue:currencies.some(row=>decimalToScaled(row.overdue,2)>0n),openPurchases:currencies.reduce((sum,row)=>sum+row.openPurchases,0)};}).sort((a,b)=>Number(b.hasOverdue)-Number(a.hasOverdue)||b.openPurchases-a.openPurchases||((a.supplier?.nameEn||a.supplier?.nameAr||a.supplierId).localeCompare(b.supplier?.nameEn||b.supplier?.nameAr||b.supplierId)));
}

export function supplierStatement(supplierId:string,purchases:PurchaseRecord[],payments:SupplierPaymentRecord[],today=todayIso()):SupplierStatementCurrency[]{
  const rows=new Map<string,{date:string;reference:string;type:'purchase'|'payment';description:string;debit:bigint;credit:bigint;purchaseNumber:string;order:number}[]>();
  const push=(currency:string,row:{date:string;reference:string;type:'purchase'|'payment';description:string;debit:bigint;credit:bigint;purchaseNumber:string;order:number})=>{const list=rows.get(currency)??[];list.push(row);rows.set(currency,list);};
  const supplierPurchases=purchases.filter(purchase=>postedOnOrBefore(purchase,today)&&purchaseSupplierId(purchase)===supplierId);
  for(const purchase of supplierPurchases){
    const currency=cleanCurrency(purchase.currency),total=liabilityCents(purchase);
    push(currency,{date:purchase.date,reference:purchase.number,type:'purchase',description:purchase.supplierSnapshot?.nameEn||purchase.supplierSnapshot?.nameAr||purchase.number,debit:0n,credit:total,purchaseNumber:purchase.number,order:1});
    for(const payment of supplierPaymentsForPurchase(purchase,payments).filter(item=>paymentKnownOnOrBefore(item,today)))push(currency,{date:payment.date,reference:payment.reference||payment.id,type:'payment',description:payment.reference||purchase.number,debit:paymentCents(payment),credit:0n,purchaseNumber:purchase.number,order:2});
  }
  const summaries=supplierPayablesByCurrency(purchases,payments,today,supplierId);
  return[...rows.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([currency,entries])=>{
    entries.sort((a,b)=>a.date.localeCompare(b.date)||a.order-b.order||a.reference.localeCompare(b.reference));let balance=0n;
    const statementEntries=entries.map(entry=>{balance+=entry.credit-entry.debit;return{currency,date:entry.date,reference:entry.reference,type:entry.type,description:entry.description,debit:centsString(entry.debit),credit:centsString(entry.credit),balance:centsString(balance),purchaseNumber:entry.purchaseNumber};});
    const summary=summaries.find(item=>item.currency===currency);
    return{currency,entries:statementEntries,purchases:summary?.purchases||'0.00',paid:summary?.paid||'0.00',remaining:summary?.remaining||'0.00',overdue:summary?.overdue||'0.00'};
  });
}

export function createSupplierPayment(purchase:PurchaseRecord,supplier:Supplier|null,payments:SupplierPaymentRecord[]):SupplierPaymentRecord{
  if(purchase.status!=='posted')throw new Error('Supplier payments can only be recorded against posted purchases.');
  const summary=purchasePayableSummary(purchase,payments);
  if(decimalToScaled(summary.remaining,2)<=0n)throw new Error('This purchase is already fully paid.');
  const at=nowIso();
  return{id:makeId('supplier-payment'),purchaseId:purchase.id,purchaseNumber:purchase.number,supplierId:purchaseSupplierId(purchase),supplierNameEn:supplier?.nameEn||purchase.supplierSnapshot?.nameEn||'',supplierNameAr:supplier?.nameAr||purchase.supplierSnapshot?.nameAr||'',currency:summary.currency,amount:summary.remaining,date:todayIso(),method:'bank-transfer',reference:'',notes:'',createdAt:at,updatedAt:at};
}

export function normalizeSupplierPayment(purchase:PurchaseRecord,supplier:Supplier|null,payments:SupplierPaymentRecord[],payment:SupplierPaymentRecord):SupplierPaymentRecord{
  if(purchase.status!=='posted')throw new Error('Supplier payments require an active posted purchase.');
  const supplierId=purchaseSupplierId(purchase);
  if(payment.purchaseId!==purchase.id)throw new Error('Supplier payment purchase link is invalid.');
  if(payment.supplierId!==supplierId)throw new Error('Supplier payment supplier does not match the purchase.');
  const currency=cleanCurrency(purchase.currency);
  if(cleanCurrency(payment.currency)!==currency)throw new Error('Supplier payment currency must match the purchase currency. FX conversion is not performed automatically.');
  if(!isIsoDate(payment.date))throw new Error('Supplier payment date is invalid.');
  if(!METHODS.has(payment.method))throw new Error('Supplier payment method is invalid.');
  if(!isDecimalInput(payment.amount)||decimalToScaled(payment.amount,2)<=0n)throw new Error('Supplier payment amount must be greater than zero.');
  const total=liabilityCents(purchase);
  const paidExcludingCurrent=payments.filter(item=>item.purchaseId===purchase.id&&item.id!==payment.id).reduce((sum,item)=>sum+paymentCents(item),0n);
  const amount=decimalToScaled(payment.amount,2);
  if(paidExcludingCurrent+amount>total)throw new Error('Supplier payment cannot exceed the remaining purchase balance.');
  return{...payment,purchaseNumber:purchase.number,supplierId,supplierNameEn:supplier?.nameEn||purchase.supplierSnapshot?.nameEn||payment.supplierNameEn||'',supplierNameAr:supplier?.nameAr||purchase.supplierSnapshot?.nameAr||payment.supplierNameAr||'',currency,amount:centsString(amount),reference:payment.reference.trim(),notes:payment.notes.trim(),updatedAt:nowIso()};
}

export function assertSupplierPaymentInvariant(purchases:PurchaseRecord[],suppliers:Supplier[],payments:SupplierPaymentRecord[]):void{
  const purchaseMap=new Map(purchases.map(purchase=>[purchase.id,purchase]));
  const supplierMap=new Map(suppliers.map(supplier=>[supplier.id,supplier]));
  const ids=new Set<string>();
  for(const payment of payments){
    if(!payment.id||ids.has(payment.id))throw new Error('Supplier payment IDs must be unique.');ids.add(payment.id);
    const purchase=purchaseMap.get(payment.purchaseId);if(!purchase)throw new Error('Supplier payment is linked to a missing purchase.');
    const supplier=supplierMap.get(payment.supplierId)??null;
    normalizeSupplierPayment(purchase,supplier,payments,payment);
  }
}
