import type { ExchangeRateRecord } from '../types.js';
import { isIsoDate, makeId } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

const RATE_DECIMALS=8;
const RATE_SCALE=100_000_000n;

export function cleanFxCurrency(value:string):string{return value.trim().toUpperCase();}
export function assertExchangeRate(rate:ExchangeRateRecord):void{
  if(!rate.id||!isIsoDate(rate.date))throw new Error('Exchange-rate date is invalid.');
  const base=cleanFxCurrency(rate.baseCurrency),quote=cleanFxCurrency(rate.quoteCurrency);
  if(!/^[A-Z]{3}$/.test(base)||!/^[A-Z]{3}$/.test(quote)||base===quote)throw new Error('Choose two different three-letter currencies.');
  if(!isNonNegativeDecimalInput(rate.rate)||decimalToScaled(rate.rate,RATE_DECIMALS)<=0n)throw new Error('Exchange rate must be greater than zero.');
  if(!rate.sourceLabel.trim())throw new Error('Exchange-rate source is required.');
  if(!rate.workspaceId)throw new Error('Exchange-rate workspace scope is missing.');
}

export function createExchangeRate(input:{date:string;baseCurrency:string;quoteCurrency:string;rate:string;sourceLabel:string;notes?:string;workspaceId:string}):ExchangeRateRecord{
  const now=new Date().toISOString();const record:ExchangeRateRecord={id:makeId('fx-rate'),date:input.date,baseCurrency:cleanFxCurrency(input.baseCurrency),quoteCurrency:cleanFxCurrency(input.quoteCurrency),rate:input.rate.trim(),sourceLabel:input.sourceLabel.trim(),notes:(input.notes||'').trim(),workspaceId:input.workspaceId,createdAt:now,updatedAt:now};assertExchangeRate(record);return record;
}

export function latestExchangeRate(rates:ExchangeRateRecord[],baseCurrency:string,quoteCurrency:string,asOf:string):{record:ExchangeRateRecord;inverse:boolean}|null{
  const base=cleanFxCurrency(baseCurrency),quote=cleanFxCurrency(quoteCurrency);if(base===quote)return null;
  const candidates=rates.filter(item=>item.date<=asOf&&((cleanFxCurrency(item.baseCurrency)===base&&cleanFxCurrency(item.quoteCurrency)===quote)||(cleanFxCurrency(item.baseCurrency)===quote&&cleanFxCurrency(item.quoteCurrency)===base))).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
  const record=candidates[0];if(!record)return null;return{record,inverse:cleanFxCurrency(record.baseCurrency)!==base};
}

export function convertWithExchangeRate(amount:string,match:{record:ExchangeRateRecord;inverse:boolean}):string{
  const cents=decimalToScaled(amount,2);const rate=decimalToScaled(match.record.rate,RATE_DECIMALS);if(rate<=0n)return'0.00';
  const converted=match.inverse?(cents*RATE_SCALE+rate/2n)/rate:(cents*rate+RATE_SCALE/2n)/RATE_SCALE;
  const sign=converted<0n?'-':'',abs=converted<0n?-converted:converted;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;
}
