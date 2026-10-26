import type { FxRateRecord } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isDecimalInput, isNonNegativeDecimalInput } from './money.js';

const RATE_DECIMALS=8;
const RATE_SCALE=100_000_000n;
// Round the magnitude half away from zero, then restore the amount's sign.
function roundFxDivision(numerator:bigint,denominator:bigint):bigint{
  const magnitude=numerator<0n?-numerator:numerator;
  const rounded=(magnitude+denominator/2n)/denominator;
  return numerator<0n?-rounded:rounded;
}
function cleanCurrency(value:string):string{return value.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);}
function formatScaled4(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;const raw=`${sign}${abs/10_000n}.${(abs%10_000n).toString().padStart(4,'0')}`;return raw.replace(/0+$/,'').replace(/\.$/,'.00');}
export interface FxRateMatch {rate:FxRateRecord;inverse:boolean;}

export function createFxRate(fromCurrency='USD',toCurrency='EUR'):FxRateRecord{const now=new Date().toISOString();return{id:makeId('fx'),workspaceId:'',date:todayIso(),fromCurrency:cleanCurrency(fromCurrency)||'USD',toCurrency:cleanCurrency(toCurrency)||'EUR',rate:'',sourceLabel:'',notes:'',createdAt:now,updatedAt:now};}
export function validateFxRate(rate:FxRateRecord):string[]{const errors:string[]=[];if(!isIsoDate(rate.date))errors.push('FX rate date is invalid.');const from=cleanCurrency(rate.fromCurrency),to=cleanCurrency(rate.toCurrency);if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to))errors.push('FX currencies must be three-letter codes.');if(from===to)errors.push('FX currencies must be different.');if(!isNonNegativeDecimalInput(rate.rate)||decimalToScaled(rate.rate,RATE_DECIMALS)<=0n)errors.push('FX rate must be greater than zero.');if(typeof rate.sourceLabel!=='string'||!rate.sourceLabel.trim())errors.push('FX rate source is required.');return errors;}
export function assertFxRate(rate:FxRateRecord):void{const errors=validateFxRate(rate);if(errors.length)throw new Error(errors[0]);}
export function fxRateForDate(rates:FxRateRecord[],fromCurrency:string,toCurrency:string,date:string):FxRateRecord|undefined{const from=cleanCurrency(fromCurrency),to=cleanCurrency(toCurrency);if(!from||!to||from===to||!isIsoDate(date))return undefined;return [...rates].filter(rate=>cleanCurrency(rate.fromCurrency)===from&&cleanCurrency(rate.toCurrency)===to&&validateFxRate(rate).length===0&&rate.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))[0];}
export function fxRateMatchForDate(rates:FxRateRecord[],fromCurrency:string,toCurrency:string,date:string):FxRateMatch|undefined{const direct=fxRateForDate(rates,fromCurrency,toCurrency,date);if(direct)return{rate:direct,inverse:false};const reverse=fxRateForDate(rates,toCurrency,fromCurrency,date);return reverse?{rate:reverse,inverse:true}:undefined;}
export function convertWithFxRate(amount:string,rate:FxRateRecord):string{assertFxRate(rate);if(!isDecimalInput(amount))throw new Error('FX amount must be a valid decimal.');const amountScaled=decimalToScaled(amount||'0',4),rateScaled=decimalToScaled(rate.rate,RATE_DECIMALS);return formatScaled4(roundFxDivision(amountScaled*rateScaled,RATE_SCALE));}
export function convertWithFxMatch(amount:string,match:FxRateMatch):string{assertFxRate(match.rate);if(!isDecimalInput(amount))throw new Error('FX amount must be a valid decimal.');if(!match.inverse)return convertWithFxRate(amount,match.rate);const amountScaled=decimalToScaled(amount||'0',4),rateScaled=decimalToScaled(match.rate.rate,RATE_DECIMALS);return formatScaled4(roundFxDivision(amountScaled*RATE_SCALE,rateScaled));}
