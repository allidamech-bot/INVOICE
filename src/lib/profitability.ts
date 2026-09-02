import type { LourexDocument } from '../types.js';
import { calculateTotals, decimalToScaled, isDecimalInput, lineTotal } from './money.js';

export interface ProfitabilitySummary {
  netRevenue:string;
  itemCost:string;
  shippingCost:string;
  otherCost:string;
  totalCost:string;
  grossProfit:string;
  marginPercent:string;
  complete:boolean;
  missingCostItems:number;
  costedItems:number;
  totalItems:number;
  isReversal:boolean;
}

function centsString(cents:bigint):string{
  const sign=cents<0n?'-':'';
  const abs=cents<0n?-cents:cents;
  return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}

function nonNegativeMoney(value:unknown):bigint|null{
  if(typeof value!=='string'||!value.trim()||!isDecimalInput(value))return null;
  const cents=decimalToScaled(value,2);
  return cents<0n?null:cents;
}

function marginString(profit:bigint,revenue:bigint):string{
  if(revenue===0n)return '0.00';
  const basisPoints=(profit*1_000_000n/revenue);
  const sign=basisPoints<0n?'-':'';
  const abs=basisPoints<0n?-basisPoints:basisPoints;
  return `${sign}${abs/10_000n}.${((abs%10_000n)/100n).toString().padStart(2,'0')}`;
}

export function calculateProfitability(document:LourexDocument):ProfitabilitySummary{
  const totals=calculateTotals(document.items,document.adjustments);
  const subtotal=decimalToScaled(totals.subtotal,2);
  const discount=decimalToScaled(totals.discount,2);
  const customerShipping=decimalToScaled(totals.shipping,2);
  const customerOther=decimalToScaled(totals.otherCharges,2);
  const netRevenue=subtotal-discount+customerShipping+customerOther;

  let itemCost=0n;
  let missingCostItems=0;
  let costedItems=0;
  for(const item of document.items){
    const unitCost=nonNegativeMoney(item.unitCost);
    if(unitCost===null){missingCostItems+=1;continue;}
    itemCost+=decimalToScaled(lineTotal(item.quantity,centsString(unitCost)),2);
    costedItems+=1;
  }

  const shippingCost=nonNegativeMoney(document.internalCosts?.shippingCost??'0.00')??0n;
  const otherCost=nonNegativeMoney(document.internalCosts?.otherCost??'0.00')??0n;
  const totalCost=itemCost+shippingCost+otherCost;
  const grossProfit=netRevenue-totalCost;
  const multiplier=document.role==='credit-note'?-1n:1n;
  const signedRevenue=netRevenue*multiplier;
  const signedItemCost=itemCost*multiplier;
  const signedShippingCost=shippingCost*multiplier;
  const signedOtherCost=otherCost*multiplier;
  const signedTotalCost=totalCost*multiplier;
  const signedProfit=grossProfit*multiplier;
  const complete=missingCostItems===0;

  return {
    netRevenue:centsString(signedRevenue),
    itemCost:centsString(signedItemCost),
    shippingCost:centsString(signedShippingCost),
    otherCost:centsString(signedOtherCost),
    totalCost:centsString(signedTotalCost),
    grossProfit:centsString(signedProfit),
    marginPercent:complete?marginString(grossProfit,netRevenue):'',
    complete,
    missingCostItems,
    costedItems,
    totalItems:document.items.length,
    isReversal:document.role==='credit-note'
  };
}

export function validInternalCost(value:string):boolean{
  return !value.trim()||(isDecimalInput(value)&&decimalToScaled(value)>=0n);
}
