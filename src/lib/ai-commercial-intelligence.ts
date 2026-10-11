import type { VaultPayload } from '../types.js';
import { normalizeDecimalInput, decimalToScaled, lineTotal } from './money.js';
import { scopeVault } from './workspaces.js';
import { fxRateMatchForDate, convertWithFxMatch } from './fx-rates.js';
import { isIsoDate } from './id.js';

export const ICC_SOURCE='https://iccwbo.org/business-solutions/incoterms-rules/';
export interface ScenarioInput { quantity:string; unitCost:string; unitPrice:string; currency:string; freight:string; duty:string; otherCosts:string; toCurrency:string; date:string; }
export interface CommercialScenario { input:ScenarioInput; goods:string; landed:string; revenue:string; profit:string|null; margin:string|null; converted:string|null; fx?:{id:string;rate:string;date:string;source:string;inverse:boolean}; assumptions:string[]; }
export interface ExternalQuote { id:string; productId:string; supplier:string; currency:string; unit:string; unitCost:string; quantity:string; source:string; date:string; capturedAt:string; excerpt:string; reliability:'external-unverified'; }
export interface CommercialState { scenario?:CommercialScenario; sources:ExternalQuote[]; supplierProductId?:string; pack?:{cartons:string;unitsPerCarton:string;units:string}; obligations?:{from:string;to:string;warnings:string[];source:string;checkedAt:string}; }
export function decimal(value:string,positive=false):string { const result=normalizeDecimalInput(value);if(!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,4})?$/.test(result)||(positive&&decimalToScaled(result,4)<=0n))throw new Error('Enter an explicit valid decimal. / أدخل رقمًا عشريًا واضحًا.');return result; }
export function moneyString(value:bigint):string {const a=value<0n?-value:value;return (value<0n?'-':'')+a/100n+'.'+String(a%100n).padStart(2,'0');}
function currency(value:string):string {if(!/^[A-Z]{3}$/.test(value))throw new Error('Use a three-letter currency.');return value;}
/** The quote is a scenario, never an accounting posting. Missing cost stays unknown. */
export function commercialScenario(vault:VaultPayload,input:ScenarioInput):CommercialScenario {
  const v=scopeVault(vault),i={...input,quantity:decimal(input.quantity,true),unitPrice:decimal(input.unitPrice),currency:currency(input.currency),freight:decimal(input.freight),duty:decimal(input.duty),otherCosts:decimal(input.otherCosts)};
  if(!isIsoDate(i.date))throw new Error('An explicit valid valuation date is required.');
  if(i.unitCost)i.unitCost=decimal(i.unitCost);
  const revenue=lineTotal(i.quantity,i.unitPrice),goods=i.unitCost?lineTotal(i.quantity,i.unitCost):'',charges=decimalToScaled(i.freight,2)+decimalToScaled(i.duty,2)+decimalToScaled(i.otherCosts,2),landed=goods?moneyString(decimalToScaled(goods,2)+charges):'';
  const r=decimalToScaled(revenue,2),p=landed?r-decimalToScaled(landed,2):null;
  const out:CommercialScenario={input:i,goods,landed,revenue,profit:p===null?null:moneyString(p),margin:p===null||r===0n?null:moneyString((p*10000n+(p>=0n?r/2n:-r/2n))/r),converted:null,assumptions:['Scenario inputs are user supplied; no tax, insurance or omitted charge is inferred.','All costs must use the stated currency and quantity unit.']};
  if(i.toCurrency){currency(i.toCurrency);if(i.toCurrency===i.currency)out.converted=revenue;else{const match=fxRateMatchForDate(v.fxRates,i.currency,i.toCurrency,i.date);if(match){out.converted=convertWithFxMatch(revenue,match);out.fx={id:match.rate.id,rate:match.rate.rate,date:match.rate.date,source:match.rate.sourceLabel,inverse:match.inverse};}else out.assumptions.push('No recorded FX rate on or before this date; conversion unavailable.');}}
  if(!goods)out.assumptions.push('Cost is missing; landed cost, profit and margin are unknown.');return out;
}
export function convertPack(cartons:string,unitsPerCarton:string){const c=decimal(cartons,true),u=decimal(unitsPerCarton,true);if(!/^\d+$/.test(c)||!/^\d+$/.test(u))throw new Error('Whole cartons and whole units per carton are required.');return {cartons:c,unitsPerCarton:u,units:(BigInt(c)*BigInt(u)).toString()};}
/** Obligation changes do not imply a price conversion. Only reviewed terms may edit a draft. */
export function compareIncoterms(from:string,to:string){
  const code=(value:string)=>value.trim().toUpperCase().match(/^(EXW|FCA|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)(?:\s|$)/)?.[1];
  const a=code(from),b=code(to);if(!b)throw new Error('Use a supported Incoterm and an explicit named place.');
  const warnings=['No price, freight or margin is converted by changing delivery terms.','Confirm the named place, transport mode and Incoterms 2020 contract.'];
  if(!a)warnings.push('Previous delivery term was missing or unrecognized; no prior obligations are assumed.');
  if(a!==b)warnings.push('Cost and risk obligations change; review the contract before approval.');
  if(b==='EXW')warnings.push('Buyer generally arranges loading, export clearance and carriage; confirm export feasibility.');
  if(['CFR','CIF'].includes(b))warnings.push('Sea/inland waterway only; seller pays carriage to the named port, while risk transfers on board at shipment.');
  if(b==='CFR')warnings.push('Seller has no obligation to arrange insurance under CFR.');
  if(!from.trim().includes(' ')||!to.trim().includes(' '))warnings.push('A named place/port is missing.');
  return {from:from.trim(),to:to.trim(),warnings,source:ICC_SOURCE,checkedAt:'2026-10-11'};
}
export function externalQuote(vault:VaultPayload,value:Omit<ExternalQuote,'id'|'capturedAt'|'reliability'>):ExternalQuote {
  if(!scopeVault(vault).savedItems.some(row=>row.id===value.productId))throw new Error('Choose an exact scoped product.');
  if(!value.supplier.trim()||value.supplier.length>160||!value.unit.trim()||value.unit.length>40||!value.excerpt.trim()||value.excerpt.length>2800)throw new Error('Supplier, unit and a bounded source excerpt are required.');
  if(!isIsoDate(value.date))throw new Error('Source date is required.');
  if(!/^https:\/\/[^\s]+$/.test(value.source))throw new Error('An HTTPS source URL is required.');
  const url=new URL(value.source);if(url.username||url.password)throw new Error('Source URLs cannot contain credentials.');
  return {...value,supplier:value.supplier.trim(),unit:value.unit.trim(),unitCost:decimal(value.unitCost),quantity:decimal(value.quantity,true),currency:currency(value.currency),id:crypto.randomUUID(),capturedAt:new Date().toISOString(),reliability:'external-unverified'};
}
export interface SupplierComparisonRow {id:string;supplier:string;currency:string;unit:string;unitCost:string;quantity:string;date:string;source:string;reliability:'posted-purchase'|'external-unverified';}
/** Exact product IDs, posted purchases only, separate currencies and units. No ranking across them. */
export function compareSuppliers(vault:VaultPayload,productId:string,sources:ExternalQuote[]):SupplierComparisonRow[]{
  const v=scopeVault(vault);if(!v.savedItems.some(row=>row.id===productId))throw new Error('Product is not available in this scope.');
  const rows:SupplierComparisonRow[]=v.purchases.filter(p=>p.status==='posted'&&!p.reversedAt).flatMap(p=>p.items.filter(i=>i.savedItemId===productId).map(i=>({id:p.id+':'+i.id,supplier:p.supplierSnapshot?.nameEn||p.supplierSnapshot?.nameAr||'',currency:p.currency,unit:i.unit,unitCost:i.unitCost,quantity:i.quantity,date:p.date,source:'LOUREX '+p.number+' ['+p.id+']',reliability:'posted-purchase' as const})));
  return [...rows,...sources.filter(s=>s.productId===productId).map(s=>({...s,reliability:'external-unverified' as const}))].sort((a,b)=>a.currency.localeCompare(b.currency)||a.unit.localeCompare(b.unit)||b.date.localeCompare(a.date));
}
