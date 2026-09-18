import type { ExpenseRecord, InventoryMovementRecord, LourexDocument, PaymentRecord, PurchaseRecord, SavedItem } from '../types.js';
import { decimalToScaled } from './money.js';
import { financialReportByCurrency } from './reports.js';
import { expenseAccountingIsValid, inventoryMovementAccountingIsValid, operationsIntegritySummary, purchaseAccountingIsValid, purchaseTotals } from './operations.js';
import { isIsoDate, todayIso } from './id.js';

export interface DailyBriefMoneyRow {
  currency:string;
  sales:string;
  collected:string;
  purchases:string;
  expenses:string;
}

export interface DailyBriefChange {
  currency:string;
  metric:'sales'|'collected';
  direction:'up'|'down'|'new';
  current:string;
  previous:string;
}

export interface DailyBusinessBrief {
  date:string;
  previousDate:string;
  money:DailyBriefMoneyRow[];
  issuedInvoices:number;
  postedPurchases:number;
  expenses:number;
  inventoryMovements:number;
  productsUsedToday:number;
  dormantProducts:number;
  missingCostItems:number;
  invalidOperations:number;
  draftPurchases:number;
  changes:DailyBriefChange[];
}

function centsString(value:bigint):string{
  const sign=value<0n?'-':'';
  const abs=value<0n?-value:value;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}

function shiftIsoDate(date:string,days:number):string{
  if(!isIsoDate(date))return date;
  const [year,month,day]=date.split('-').map(Number);
  const shifted=new Date(Date.UTC(year,month-1,day+days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth()+1).padStart(2,'0')}-${String(shifted.getUTCDate()).padStart(2,'0')}`;
}

function currency(value:string):string{return (value||'USD').trim().toUpperCase()||'USD';}
function itemDate(value:string):string{return /^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):'';}

function notableChange(current:string,previous:string):'up'|'down'|'new'|null{
  const now=decimalToScaled(current||'0',2);
  const before=decimalToScaled(previous||'0',2);
  if(before===0n)return now!==0n?'new':null;
  const difference=now-before;
  const absolute=difference<0n?-difference:difference;
  if(absolute*2n<((before<0n?-before:before)))return null;
  return difference>0n?'up':difference<0n?'down':null;
}

export function dailyBusinessBrief(
  documents:LourexDocument[],
  payments:PaymentRecord[],
  purchases:PurchaseRecord[],
  expenses:ExpenseRecord[],
  inventoryMovements:InventoryMovementRecord[],
  items:SavedItem[],
  date=todayIso()
):DailyBusinessBrief{
  const today=isIsoDate(date)?date:todayIso();
  const previousDate=shiftIsoDate(today,-1);
  const todayFinancial=financialReportByCurrency(documents,payments,today,today);
  const previousFinancial=financialReportByCurrency(documents,payments,previousDate,previousDate);
  const moneyMap=new Map<string,{sales:bigint;collected:bigint;purchases:bigint;expenses:bigint}>();
  const get=(code:string)=>{
    const key=currency(code);
    const row=moneyMap.get(key)??{sales:0n,collected:0n,purchases:0n,expenses:0n};
    moneyMap.set(key,row);
    return row;
  };

  for(const row of todayFinancial){
    const target=get(row.currency);
    target.sales+=decimalToScaled(row.netSales||'0',2);
    target.collected+=decimalToScaled(row.collected||'0',2);
  }

  let postedPurchases=0;
  for(const purchase of purchases){
    if(purchase.date!==today||purchase.status!=='posted'||!purchaseAccountingIsValid(purchase))continue;
    get(purchase.currency).purchases+=decimalToScaled(purchaseTotals(purchase).landedTotal,2);
    postedPurchases+=1;
  }

  let expenseCount=0;
  for(const expense of expenses){
    if(expense.date!==today||!expenseAccountingIsValid(expense))continue;
    get(expense.currency).expenses+=decimalToScaled(expense.amount,2);
    expenseCount+=1;
  }

  const integrity=operationsIntegritySummary(purchases,expenses,inventoryMovements);
  const inventoryMovementCount=inventoryMovements.filter(movement=>movement.date===today&&inventoryMovementAccountingIsValid(movement)).length;
  const productsUsedToday=items.filter(item=>itemDate(item.lastUsedAt)===today).length;
  const dormantCutoff=shiftIsoDate(today,-90);
  const dormantProducts=items.filter(item=>{
    const used=itemDate(item.lastUsedAt);
    const created=itemDate(item.createdAt);
    if(item.usageCount>0)return Boolean(used&&used<dormantCutoff);
    return Boolean(created&&created<dormantCutoff);
  }).length;

  const previousByCurrency=new Map(previousFinancial.map(row=>[currency(row.currency),row]));
  const changes:DailyBriefChange[]=[];
  for(const row of todayFinancial){
    const code=currency(row.currency);
    const before=previousByCurrency.get(code);
    for(const metric of ['sales','collected'] as const){
      const current=metric==='sales'?row.netSales:row.collected;
      const previous=metric==='sales'?(before?.netSales||'0.00'):(before?.collected||'0.00');
      const direction=notableChange(current,previous);
      if(direction)changes.push({currency:code,metric,direction,current,previous});
      if(changes.length>=4)break;
    }
    if(changes.length>=4)break;
  }

  return{
    date:today,
    previousDate,
    money:[...moneyMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([code,row])=>({currency:code,sales:centsString(row.sales),collected:centsString(row.collected),purchases:centsString(row.purchases),expenses:centsString(row.expenses)})),
    issuedInvoices:todayFinancial.reduce((sum,row)=>sum+row.issuedInvoices,0),
    postedPurchases,
    expenses:expenseCount,
    inventoryMovements:inventoryMovementCount,
    productsUsedToday,
    dormantProducts,
    missingCostItems:todayFinancial.reduce((sum,row)=>sum+row.missingCostItems,0),
    invalidOperations:integrity.totalInvalid,
    draftPurchases:purchases.filter(purchase=>purchase.status==='draft').length,
    changes
  };
}
