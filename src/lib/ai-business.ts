import type { Customer, LourexDocument, PurchaseRecord, SavedItem, VaultPayload } from '../types.js';
import { pricingSuggestedUnitPrice } from './commercial-controls.js';
import { dailyBusinessBrief, type DailyBusinessBrief } from './daily-brief.js';
import { todayIso } from './id.js';
import { decimalToScaled } from './money.js';
import { purchaseAccountingIsValid, purchaseTotals } from './operations.js';
import { invoicePaymentSummary } from './payments.js';
import { calculateProfitability } from './profitability.js';
import { customerReceivables, receivableCustomerId } from './receivables.js';
import { normalizeSavedItemIdentity, normalizeSavedItemSku } from './saved-items.js';

export const AI_ARCHIVE_TAG='__lourex_archived';
export function aiProductArchived(item:SavedItem):boolean{return Boolean(item.archived)||(item.tags??[]).some(tag=>tag===AI_ARCHIVE_TAG);}

export interface AiActionCandidate {
  type:'item.archive'|'item.restore'|'item.review-duplicate'|'item.complete-data';
  itemId:string;
  relatedItemId:string;
  label:string;
  reason:string;
}

export interface AiProductInsight {
  id:string;
  name:string;
  sku:string;
  currency:string;
  lastSalePrice:string;
  lastCost:string;
  suggestedPrice:string;
  dormant:boolean;
  archived:boolean;
  missing:string[];
  duplicateWith:string;
  costChangePercent:string;
  signals:string[];
}

export interface AiSupplierSummary {
  supplierId:string;
  supplierName:string;
  currency:string;
  postedPurchases:number;
  landedSpend:string;
  lastPurchaseDate:string;
}

export interface AiSupplierItemComparison {
  itemId:string;
  itemName:string;
  currency:string;
  observations:Array<{supplierId:string;supplierName:string;unitCost:string;landedUnitCost:string;purchaseDate:string}>;
  lowestObservedSupplierId:string;
  lowestObservedSupplierName:string;
  lowestObservedUnitCost:string;
}

export interface AiCostAlert {
  itemId:string;
  itemName:string;
  currency:string;
  supplierName:string;
  currentUnitCost:string;
  previousUnitCost:string;
  changePercent:string;
  direction:'up'|'down';
}

export interface AiCustomerInsight {
  customerId:string;
  customerName:string;
  currencies:Array<{currency:string;outstanding:string;overdue:string;aging:{current:string;days1to30:string;days31to60:string;days61to90:string;days90plus:string};openInvoices:number;overdueInvoices:number}>;
  averageDaysToPay:number|null;
  averageDaysLate:number|null;
  paidInvoiceSamples:number;
  profitability:Array<{currency:string;netRevenue:string;grossProfit:string;profitComplete:boolean;missingCostItems:number}>;
  topProducts:Array<{name:string;invoiceLines:number}>;
  lastActivity:string;
  riskSignals:string[];
  followUpPriority:'high'|'medium'|'normal';
}

export interface AiBusinessContext {
  version:1;
  basis:'deterministic-business-intelligence';
  asOf:string;
  daily:DailyBusinessBrief;
  actionCenter:{candidates:AiActionCandidate[];duplicateGroups:number;dormantCandidates:number;missingDataCandidates:number;archivedItems:number};
  products:{rows:AiProductInsight[]};
  suppliers:{rows:AiSupplierSummary[];itemComparisons:AiSupplierItemComparison[];costAlerts:AiCostAlert[]};
  customers:{rows:AiCustomerInsight[]};
  limitations:string[];
}

function centsString(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function isoDate(value:string):string{return /^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):'';}
function dayNumber(iso:string):number{const [y,m,d]=iso.split('-').map(Number);return Math.floor(Date.UTC(y||0,(m||1)-1,d||1)/86_400_000);}
function daysBetween(from:string,to:string):number{return from&&to?Math.max(0,dayNumber(to)-dayNumber(from)):0;}
function shiftIso(date:string,days:number):string{const [y,m,d]=date.split('-').map(Number);const next=new Date(Date.UTC(y||0,(m||1)-1,(d||1)+days));return `${next.getUTCFullYear()}-${String(next.getUTCMonth()+1).padStart(2,'0')}-${String(next.getUTCDate()).padStart(2,'0')}`;}
function itemName(item:SavedItem):string{return (item.descriptionEn||item.descriptionAr||item.sku||'Unnamed item').trim();}
function supplierName(snapshot:PurchaseRecord['supplierSnapshot']):string{return (snapshot?.nameEn||snapshot?.nameAr||'Unknown supplier').trim();}
function customerName(customer:Customer|null|undefined):string{return (customer?.companyNameEn||customer?.companyNameAr||'Unknown customer').trim();}
function percentChange(current:string,previous:string):string{const now=decimalToScaled(current||'0',4),before=decimalToScaled(previous||'0',4);if(before===0n)return'';const basisPoints=(now-before)*1_000_000n/(before<0n?-before:before);const sign=basisPoints<0n?'-':'';const abs=basisPoints<0n?-basisPoints:basisPoints;return `${sign}${abs/10_000n}.${((abs%10_000n)/100n).toString().padStart(2,'0')}`;}
function absPercent(value:string):bigint{return decimalToScaled(value.replace('-','')||'0',2);}
function duplicateKey(item:SavedItem):string{const sku=normalizeSavedItemSku(item.sku??'');if(sku)return`sku:${sku}`;const en=normalizeSavedItemIdentity(item.descriptionEn);if(en)return`en:${en}`;const ar=normalizeSavedItemIdentity(item.descriptionAr);return ar?`ar:${ar}`:'';}
function productCostHistory(purchases:PurchaseRecord[]):Map<string,Array<{currency:string;unitCost:string;landedUnitCost:string;date:string;supplierId:string;supplierName:string}>>{
  const map=new Map<string,Array<{currency:string;unitCost:string;landedUnitCost:string;date:string;supplierId:string;supplierName:string}>>();
  const ordered=purchases.filter(p=>p.status==='posted'&&purchaseAccountingIsValid(p)).sort((a,b)=>(b.date||b.postedAt).localeCompare(a.date||a.postedAt));
  for(const purchase of ordered){const supplierId=purchase.supplierSnapshot?.sourceSupplierId||'';const name=supplierName(purchase.supplierSnapshot);for(const line of purchase.items){if(!line.savedItemId||!line.unitCost.trim())continue;const list=map.get(line.savedItemId)??[];list.push({currency:purchase.currency,unitCost:line.unitCost,landedUnitCost:line.landedUnitCost||line.unitCost,date:purchase.date,supplierId,supplierName:name});map.set(line.savedItemId,list);}}
  return map;
}
function activeInvoiceForCustomer(doc:LourexDocument,customerId:string):boolean{return doc.kind==='invoice'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&receivableCustomerId(doc)===customerId;}
function maxStamp(...values:string[]):string{return values.filter(Boolean).sort().at(-1)||'';}

export function buildAiBusinessContext(vault:VaultPayload,asOf=todayIso()):AiBusinessContext{
  const daily=dailyBusinessBrief(vault.documents,vault.payments,vault.purchases,vault.expenses,vault.inventoryMovements,vault.savedItems,asOf);
  const dormantCutoff=shiftIso(asOf,-90);
  const activeItems=vault.savedItems.filter(item=>!aiProductArchived(item));
  const duplicateMap=new Map<string,SavedItem[]>();
  for(const item of activeItems){const key=duplicateKey(item);if(!key)continue;const list=duplicateMap.get(key)??[];list.push(item);duplicateMap.set(key,list);}
  const duplicatePairs=new Map<string,string>();let duplicateGroups=0;
  for(const group of duplicateMap.values())if(group.length>1){duplicateGroups+=1;const primary=group[0]!;for(const duplicate of group.slice(1))duplicatePairs.set(duplicate.id,primary.id);}

  const history=productCostHistory(vault.purchases);
  const products:AiProductInsight[]=vault.savedItems.map(item=>{
    const isArchived=aiProductArchived(item);const used=isoDate(item.lastUsedAt);const created=isoDate(item.createdAt);const dormant=!isArchived&&(item.usageCount>0?Boolean(used&&used<=dormantCutoff):Boolean(created&&created<=dormantCutoff));
    const missing:string[]=[];if(!isArchived){if(!(item.sku??'').trim())missing.push('sku');if(!item.hsCode.trim())missing.push('hsCode');if(!(item.lastUnitCost??'').trim())missing.push('cost');if(!(item.category??'').trim())missing.push('category');}
    const costRows=history.get(item.id)??[];const latest=costRows[0];const previous=costRows.find(row=>latest&&row.currency===latest.currency&&row.unitCost!==latest.unitCost&&row.date<=latest.date);const costChange=latest&&previous?percentChange(latest.unitCost,previous.unitCost):'';
    const currency=(item.lastCostCurrency||item.lastCurrency||latest?.currency||'USD').toUpperCase();const lastCost=(item.lastUnitCost||latest?.unitCost||'').trim();const suggestedPrice=!isArchived&&lastCost?pricingSuggestedUnitPrice(lastCost,vault.company.commercial.pricing):'';
    const signals:string[]=[];if(dormant)signals.push('dormant-90-plus');if(duplicatePairs.has(item.id))signals.push('possible-duplicate');if(missing.length)signals.push('incomplete-product-data');if(!isArchived&&lastCost&&item.lastUnitPrice&&item.lastCurrency===currency&&decimalToScaled(item.lastUnitPrice,4)<decimalToScaled(lastCost,4))signals.push('sale-price-below-cost');if(!isArchived&&costChange&&absPercent(costChange)>=2000n)signals.push(decimalToScaled(costChange,2)>0n?'cost-up-20-plus':'cost-down-20-plus');if(isArchived)signals.push('archived');
    return{id:item.id,name:itemName(item),sku:item.sku??'',currency,lastSalePrice:item.lastUnitPrice||'',lastCost,suggestedPrice,dormant,archived:isArchived,missing,duplicateWith:duplicatePairs.get(item.id)||'',costChangePercent:costChange,signals};
  }).sort((a,b)=>Number(b.signals.length>0)-Number(a.signals.length>0)||b.signals.length-a.signals.length||a.name.localeCompare(b.name)).slice(0,24);

  const actions:AiActionCandidate[]=[];
  for(const row of products){if(row.archived){actions.push({type:'item.restore',itemId:row.id,relatedItemId:'',label:`Restore ${row.name}`,reason:'Product is currently archived.'});continue;}if(row.duplicateWith)actions.push({type:'item.review-duplicate',itemId:row.id,relatedItemId:row.duplicateWith,label:`Review duplicate ${row.name}`,reason:'A matching SKU or normalized product name exists.'});if(row.missing.length)actions.push({type:'item.complete-data',itemId:row.id,relatedItemId:'',label:`Complete ${row.name}`,reason:`Missing: ${row.missing.join(', ')}.`});if(row.dormant)actions.push({type:'item.archive',itemId:row.id,relatedItemId:'',label:`Archive ${row.name}`,reason:'No recorded use for at least 90 days.'});}

  const supplierRowsMap=new Map<string,{supplierId:string;supplierName:string;currency:string;count:number;landed:bigint;lastDate:string}>();
  for(const purchase of vault.purchases){if(purchase.status!=='posted'||!purchaseAccountingIsValid(purchase))continue;const supplierId=purchase.supplierSnapshot?.sourceSupplierId||'';const name=supplierName(purchase.supplierSnapshot);const key=`${supplierId||name}|${purchase.currency}`;const row=supplierRowsMap.get(key)??{supplierId,supplierName:name,currency:purchase.currency,count:0,landed:0n,lastDate:''};row.count+=1;row.landed+=decimalToScaled(purchaseTotals(purchase).landedTotal,2);if(purchase.date>row.lastDate)row.lastDate=purchase.date;supplierRowsMap.set(key,row);}
  const supplierRows:AiSupplierSummary[]=[...supplierRowsMap.values()].map(row=>({supplierId:row.supplierId,supplierName:row.supplierName,currency:row.currency,postedPurchases:row.count,landedSpend:centsString(row.landed),lastPurchaseDate:row.lastDate})).sort((a,b)=>b.lastPurchaseDate.localeCompare(a.lastPurchaseDate)).slice(0,16);

  const itemComparisons:AiSupplierItemComparison[]=[];const costAlerts:AiCostAlert[]=[];
  for(const [itemId,rows] of history){const saved=vault.savedItems.find(item=>item.id===itemId);if(!saved)continue;const grouped=new Map<string,typeof rows[number]>();for(const row of rows){const key=`${row.supplierId||row.supplierName}|${row.currency}`;if(!grouped.has(key))grouped.set(key,row);}const byCurrency=new Map<string,typeof rows>();for(const row of grouped.values()){const list=byCurrency.get(row.currency)??[];list.push(row);byCurrency.set(row.currency,list);}for(const [currency,observed] of byCurrency){const valid=observed.filter(row=>row.unitCost.trim()).sort((a,b)=>{const av=decimalToScaled(a.unitCost,4),bv=decimalToScaled(b.unitCost,4);return av<bv?-1:av>bv?1:0;});if(valid.length>=2){const best=valid[0]!;itemComparisons.push({itemId,itemName:itemName(saved),currency,observations:valid.slice(0,4).map(row=>({supplierId:row.supplierId,supplierName:row.supplierName,unitCost:row.unitCost,landedUnitCost:row.landedUnitCost,purchaseDate:row.date})),lowestObservedSupplierId:best.supplierId,lowestObservedSupplierName:best.supplierName,lowestObservedUnitCost:best.unitCost});}}const latest=rows[0];if(latest){const previous=rows.find(row=>row.currency===latest.currency&&row.date<=latest.date&&row.unitCost!==latest.unitCost);if(previous){const change=percentChange(latest.unitCost,previous.unitCost);if(change&&absPercent(change)>=2000n)costAlerts.push({itemId,itemName:itemName(saved),currency:latest.currency,supplierName:latest.supplierName,currentUnitCost:latest.unitCost,previousUnitCost:previous.unitCost,changePercent:change,direction:decimalToScaled(change,2)>0n?'up':'down'});}}}
  itemComparisons.sort((a,b)=>a.itemName.localeCompare(b.itemName));costAlerts.sort((a,b)=>{const av=absPercent(a.changePercent),bv=absPercent(b.changePercent);return av>bv?-1:av<bv?1:0;});

  const receivables=customerReceivables(vault.customers,vault.documents,vault.payments,asOf);
  const customerRows:AiCustomerInsight[]=receivables.map(receivable=>{
    const customer=receivable.customer;const customerId=receivable.customerId;const invoices=vault.documents.filter(doc=>activeInvoiceForCustomer(doc,customerId));const paidSamples:Array<{daysToPay:number;daysLate:number}> = [];
    for(const invoice of invoices){const summary=invoicePaymentSummary(invoice,vault.payments,asOf,vault.documents);if(summary.status!=='paid')continue;const linked=vault.payments.filter(payment=>payment.invoiceId===invoice.id&&payment.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));const last=linked.at(-1);if(!last)continue;paidSamples.push({daysToPay:daysBetween(invoice.issueDate,last.date),daysLate:invoice.dueDate&&last.date>invoice.dueDate?daysBetween(invoice.dueDate,last.date):0});}
    const profitMap=new Map<string,{revenue:bigint;profit:bigint;complete:boolean;missing:number}>();for(const doc of vault.documents.filter(doc=>doc.kind==='invoice'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&receivableCustomerId(doc)===customerId)){const profit=calculateProfitability(doc);const row=profitMap.get(doc.currency)??{revenue:0n,profit:0n,complete:true,missing:0};row.revenue+=decimalToScaled(profit.netRevenue,2);row.missing+=profit.missingCostItems;if(!profit.complete)row.complete=false;else row.profit+=decimalToScaled(profit.grossProfit,2);profitMap.set(doc.currency,row);}
    const productsMap=new Map<string,number>();for(const invoice of invoices)for(const item of invoice.items){const name=(item.descriptionEn||item.descriptionAr||'').trim();if(name)productsMap.set(name,(productsMap.get(name)??0)+1);}
    const riskSignals:string[]=[];if(receivable.hasOverdue)riskSignals.push('overdue-balance');if(receivable.currencies.some(row=>decimalToScaled(row.aging.days90plus,2)>0n))riskSignals.push('aging-90-plus');const avgLate=paidSamples.length?Math.round(paidSamples.reduce((sum,row)=>sum+row.daysLate,0)/paidSamples.length):null;if(avgLate!==null&&avgLate>=15)riskSignals.push('historically-late-payments');if(customer?.creditLimit&&customer.creditCurrency){const row=receivable.currencies.find(entry=>entry.currency===customer.creditCurrency);if(row&&decimalToScaled(customer.creditLimit,2)>0n&&decimalToScaled(row.outstanding,2)>decimalToScaled(customer.creditLimit,2))riskSignals.push('credit-limit-exceeded');}
    const lastDoc=invoices.reduce((latest,doc)=>maxStamp(latest,doc.updatedAt),''),lastPayment=vault.payments.filter(payment=>payment.customerId===customerId).reduce((latest,payment)=>maxStamp(latest,payment.updatedAt||payment.createdAt),''),lastActivity=maxStamp(lastDoc,lastPayment,customer?.updatedAt||'');const priority:riskSignals.includes('aging-90-plus')||riskSignals.includes('credit-limit-exceeded')?'high':riskSignals.length?'medium':'normal';
    return{customerId,customerName:customerName(customer),currencies:receivable.currencies.map(row=>({currency:row.currency,outstanding:row.outstanding,overdue:row.overdue,aging:row.aging,openInvoices:row.openInvoices,overdueInvoices:row.overdueInvoices})),averageDaysToPay:paidSamples.length?Math.round(paidSamples.reduce((sum,row)=>sum+row.daysToPay,0)/paidSamples.length):null,averageDaysLate:avgLate,paidInvoiceSamples:paidSamples.length,profitability:[...profitMap.entries()].map(([currency,row])=>({currency,netRevenue:centsString(row.revenue),grossProfit:row.complete?centsString(row.profit):'',profitComplete:row.complete,missingCostItems:row.missing})),topProducts:[...productsMap.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,invoiceLines])=>({name,invoiceLines})),lastActivity,riskSignals,followUpPriority:priority};
  }).sort((a,b)=>({high:2,medium:1,normal:0}[b.followUpPriority]-{high:2,medium:1,normal:0}[a.followUpPriority])||b.lastActivity.localeCompare(a.lastActivity)).slice(0,16);

  return{version:1,basis:'deterministic-business-intelligence',asOf,daily,actionCenter:{candidates:actions.slice(0,16),duplicateGroups,dormantCandidates:products.filter(row=>row.dormant&&!row.archived).length,missingDataCandidates:products.filter(row=>row.missing.length>0&&!row.archived).length,archivedItems:vault.savedItems.filter(aiProductArchived).length},products:{rows:products},suppliers:{rows:supplierRows,itemComparisons:itemComparisons.slice(0,12),costAlerts:costAlerts.slice(0,12)},customers:{rows:customerRows},limitations:['currencies-remain-separate','pricing-suggestions-use-saved-cost-and-company-policy','supplier-comparison-is-observed-history-not-a-purchase-recommendation','customer-risk-signals-are-rule-based-not-credit-scoring','ai-may-explain-deterministic-results-but-must-not-recalculate-accounting']};
}
