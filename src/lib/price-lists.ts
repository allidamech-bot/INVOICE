import type { DocumentItem, SavedItem } from '../types.js';
import { decimalToScaled, isNonNegativeDecimalInput, normalizeDecimalInput } from './money.js';

export type PriceTier='retail'|'wholesale'|'distributor';
export interface ProductPricingPolicy{
  retail:string;
  wholesale:string;
  distributor:string;
  wholesaleMinQty:string;
  distributorMinQty:string;
  minimumMarginPercent:string;
}
export interface PriceResolution{
  price:string;
  currency:string;
  source:'retail'|'wholesale'|'distributor'|'legacy'|'none';
  minimumMarginPercent:string;
  marginWarning:boolean;
}

const PREFIX='@lourex:pricing:v1:';
const SCALE=10_000n;
function clean(value:unknown,max=40):string{return String(value??'').trim().slice(0,max);}
function money(value:unknown):string{const text=clean(value);return text&&isNonNegativeDecimalInput(text)?normalizeDecimalInput(text):'';}
function qty(value:unknown):string{const text=clean(value);return text&&isNonNegativeDecimalInput(text)?normalizeDecimalInput(text):'';}
function percent(value:unknown):string{const text=clean(value);if(!text||!isNonNegativeDecimalInput(text))return '';const scaled=decimalToScaled(text,4);return scaled<=100n*SCALE?normalizeDecimalInput(text):'';}
function tagFor(policy:ProductPricingPolicy):string{return `${PREFIX}${JSON.stringify(policy)}`;}

export function pricingPolicyFromItem(item:SavedItem):ProductPricingPolicy{
  const raw=(item.tags??[]).find(tag=>tag.startsWith(PREFIX));
  if(raw){try{const parsed=JSON.parse(raw.slice(PREFIX.length));return{retail:money(parsed.retail),wholesale:money(parsed.wholesale),distributor:money(parsed.distributor),wholesaleMinQty:qty(parsed.wholesaleMinQty),distributorMinQty:qty(parsed.distributorMinQty),minimumMarginPercent:percent(parsed.minimumMarginPercent)};}catch{}}
  return{retail:money(item.lastUnitPrice),wholesale:'',distributor:'',wholesaleMinQty:'',distributorMinQty:'',minimumMarginPercent:''};
}
export function withPricingPolicy(item:SavedItem,policy:ProductPricingPolicy):SavedItem{
  const next={retail:money(policy.retail),wholesale:money(policy.wholesale),distributor:money(policy.distributor),wholesaleMinQty:qty(policy.wholesaleMinQty),distributorMinQty:qty(policy.distributorMinQty),minimumMarginPercent:percent(policy.minimumMarginPercent)};
  const tags=(item.tags??[]).filter(tag=>!tag.startsWith(PREFIX));
  return{...item,lastUnitPrice:next.retail||item.lastUnitPrice,tags:[...tags,tagFor(next)]};
}
export function validatePricingPolicy(policy:ProductPricingPolicy):string{
  for(const [label,value] of [['Retail price',policy.retail],['Wholesale price',policy.wholesale],['Distributor price',policy.distributor],['Wholesale MOQ',policy.wholesaleMinQty],['Distributor MOQ',policy.distributorMinQty]] as const)if(value&&!isNonNegativeDecimalInput(value))return `${label} must be zero or greater.`;
  if(policy.minimumMarginPercent&&(!isNonNegativeDecimalInput(policy.minimumMarginPercent)||decimalToScaled(policy.minimumMarginPercent,4)>100n*SCALE))return 'Minimum margin must be between 0 and 100 percent.';
  if(policy.wholesale&&policy.retail&&decimalToScaled(policy.wholesale,4)>decimalToScaled(policy.retail,4))return 'Wholesale price cannot exceed retail price.';
  if(policy.distributor&&policy.wholesale&&decimalToScaled(policy.distributor,4)>decimalToScaled(policy.wholesale,4))return 'Distributor price cannot exceed wholesale price.';
  return '';
}
function marginWarning(item:SavedItem,price:string,minimum:string,currency:string):boolean{
  if(!price||!minimum||!item.lastUnitCost||!item.lastCostCurrency||item.lastCostCurrency!==currency)return false;
  const sale=decimalToScaled(price,4),cost=decimalToScaled(item.lastUnitCost,4);if(sale<=0n)return cost>0n;
  const margin=((sale-cost)*100n*SCALE)/sale;return margin<decimalToScaled(minimum,4);
}
export function resolveProductPrice(item:SavedItem,quantity:string,currency:string,preferred?:PriceTier):PriceResolution{
  if(item.lastCurrency&&item.lastCurrency!==currency)return{price:'',currency:item.lastCurrency,source:'none',minimumMarginPercent:'',marginWarning:false};
  const policy=pricingPolicyFromItem(item),q=isNonNegativeDecimalInput(quantity)?decimalToScaled(quantity,4):SCALE;
  const wholesaleMin=policy.wholesaleMinQty?decimalToScaled(policy.wholesaleMinQty,4):0n,distributorMin=policy.distributorMinQty?decimalToScaled(policy.distributorMinQty,4):0n;
  let source:PriceResolution['source']='none',price='';
  if(preferred&&policy[preferred]){source=preferred;price=policy[preferred];}
  else if(policy.distributor&&distributorMin>0n&&q>=distributorMin){source='distributor';price=policy.distributor;}
  else if(policy.wholesale&&wholesaleMin>0n&&q>=wholesaleMin){source='wholesale';price=policy.wholesale;}
  else if(policy.retail){source='retail';price=policy.retail;}
  else if(item.lastUnitPrice){source='legacy';price=item.lastUnitPrice;}
  return{price,currency:item.lastCurrency||currency,source,minimumMarginPercent:policy.minimumMarginPercent,marginWarning:marginWarning(item,price,policy.minimumMarginPercent,currency)};
}
export function applyResolvedPrice(line:DocumentItem,item:SavedItem,currency:string,preferred?:PriceTier):{item:DocumentItem;resolution:PriceResolution}{
  const resolution=resolveProductPrice(item,line.quantity||'1',currency,preferred);
  return{item:resolution.price?{...line,unitPrice:resolution.price}:line,resolution};
}
export function pricingSourceLabel(source:PriceResolution['source']):string{return source==='retail'?'Retail price':source==='wholesale'?'Wholesale price':source==='distributor'?'Distributor price':source==='legacy'?'Last saved price':'No compatible price';}
