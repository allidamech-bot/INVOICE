import type { FxRateRecord } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

function cleanCurrency(value:string):string{return value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8);}

export function createFxRate(fromCurrency='USD',toCurrency='EUR'):FxRateRecord{
  const now=new Date().toISOString();
  return{id:makeId('fx'),workspaceId:'',date:todayIso(),fromCurrency:cleanCurrency(fromCurrency)||'USD',toCurrency:cleanCurrency(toCurrency)||'EUR',rate:'',sourceLabel:'',notes:'',createdAt:now,updatedAt:now};
}

export function validateFxRate(rate:FxRateRecord):string[]{
  const errors:string[]=[];
  if(!isIsoDate(rate.date))errors.push('FX rate date is invalid.');
  if(!cleanCurrency(rate.fromCurrency)||!cleanCurrency(rate.toCurrency))errors.push('FX currencies are required.');
  if(cleanCurrency(rate.fromCurrency)===cleanCurrency(rate.toCurrency))errors.push('FX currencies must be different.');
  if(!isNonNegativeDecimalInput(rate.rate)||decimalToScaled(rate.rate,8)<=0n)errors.push('FX rate must be greater than zero.');
  if(!rate.sourceLabel.trim())errors.push('FX rate source is required.');
  return errors;
}
export function assertFxRate(rate:FxRateRecord):void{const errors=validateFxRate(rate);if(errors.length)throw new Error(errors[0]);}

export function fxRateForDate(rates:FxRateRecord[],fromCurrency:string,toCurrency:string,date:string):FxRateRecord|undefined{
  const from=cleanCurrency(fromCurrency),to=cleanCurrency(toCurrency);
  if(!from||!to||from===to)return undefined;
  return [...rates].filter(rate=>cleanCurrency(rate.fromCurrency)===from&&cleanCurrency(rate.toCurrency)===to&&isIsoDate(rate.date)&&rate.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function convertWithFxRate(amount:string,rate:FxRateRecord):string{
  assertFxRate(rate);
  const amountScaled=decimalToScaled(amount||'0',4),rateScaled=decimalToScaled(rate.rate,8);
  const value=(amountScaled*rateScaled+50_000_000n)/100_000_000n;
  const sign=value<0n?'-':'';const abs=value<0n?-value:value;
  return `${sign}${abs/10_000n}.${(abs%10_000n).toString().padStart(4,'0')}`.replace(/0+$/,'').replace(/\.$/,'.00');
}
