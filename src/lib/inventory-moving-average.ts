import {isIsoDate} from './id.js';
import {decimalToScaled, isExactStockQuantityInput, normalizeDecimalInput} from './money.js';

/**
 * Alif 22-B/C: prospective, pure cost-engine foundation ONLY.
 * Not connected to document issuance, accounting journals or stored inventory.
 * Input must be a complete, explicitly ordered, approved single-product/location
 * valuation stream. Never infer historical layers or an FX rate from the catalog.
 */
const QTY_SCALE=10_000n;
const COST_SCALE=1_000_000_000_000n;
const FX_SCALE=100_000_000n;
type EventKind='opening'|'receipt'|'issue'|'return';

export interface MovingAverageScope {
  workspaceId:string;
  branchId:string;
  warehouseId:string;
  itemId:string;
  functionalCurrency:string;
}
export interface ExplicitCostFxEvidence {
  id:string;
  date:string;
  fromCurrency:string;
  toCurrency:string;
  rate:string;
  sourceLabel:string;
}
export interface MovingAverageEvent {
  id:string;
  sequence:number;
  date:string;
  kind:EventKind;
  workspaceId:string;
  branchId:string;
  warehouseId:string;
  itemId:string;
  quantity:string;
  /** Mandatory only for opening/receipt, in costCurrency. */
  unitCost?:string;
  costCurrency?:string;
  /** Mandatory for a foreign-currency receipt; no inferred or cross-date FX. */
  fx?:ExplicitCostFxEvidence;
  /** Mandatory for physical returns: preserve original issue cost. */
  originalIssueId?:string;
}
export interface MovingAverageStep {
  id:string;
  kind:EventKind;
  quantity:string;
  recognizedUnitCost:string;
  valueChange:string;
  costOfGoodsSold:string;
  balanceQuantity:string;
  balanceValue:string;
  averageUnitCost:string;
}
export interface MovingAverageResult {
  currency:string;
  balanceQuantity:string;
  balanceValue:string;
  averageUnitCost:string;
  costOfGoodsSold:string;
  steps:MovingAverageStep[];
}
interface OriginalIssue {
  quantity:bigint;
  value:bigint;
  returnedQuantity:bigint;
  returnedValue:bigint;
}
function fail(reason:string):never{throw new Error('ALIF_22_COST_EVIDENCE_REQUIRED: '+reason);}
function canonicalCurrency(value:string):string{
  const code=value.trim().toUpperCase();
  if(!/^[A-Z]{3}$/.test(code))fail('Valid three-letter currency is required.');
  return code;
}
function positiveQty(input:string):bigint{
  if(!isExactStockQuantityInput(input))fail('Quantity needs an exact four-decimal-or-less input.');
  const value=decimalToScaled(input,4);
  if(value<=0n)fail('Quantity must be positive.');
  return value;
}
function nonNegativeExact(input:string|undefined,decimals:number,label:string):bigint{
  const normalized=normalizeDecimalInput(input??'');
  const re=decimals===8?/^(?:\d+(?:\.\d{1,8})?|\.\d{1,8})$/:/^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/;
  if(!re.test(normalized))fail(label+' must be a non-negative exact decimal.');
  return decimalToScaled(normalized,decimals);
}
function roundDivide(value:bigint,denominator:bigint):bigint{
  if(denominator<=0n)fail('Invalid cost denominator.');
  const negative=value<0n,absolute=negative?-value:value;
  const rounded=(absolute+denominator/2n)/denominator;
  return negative?-rounded:rounded;
}
function format(value:bigint,places:number):string{
  const negative=value<0n,absolute=negative?-value:value;
  const scale=10n**BigInt(places);
  return (negative?'-':'')+(absolute/scale).toString()+'.'+(absolute%scale).toString().padStart(places,'0');
}
function recognizedCost(event:MovingAverageEvent,functionalCurrency:string):bigint{
  const costCurrency=canonicalCurrency(event.costCurrency??'');
  const cost=nonNegativeExact(event.unitCost,12,'Receipt unit cost');
  if(costCurrency===functionalCurrency){
    if(event.fx)fail('Same-currency receipt must not attach a conversion.');
    return cost;
  }
  const fx=event.fx;
  if(!fx||!fx.id.trim()||!fx.sourceLabel.trim()||!isIsoDate(fx.date)
    ||fx.date!==event.date||canonicalCurrency(fx.fromCurrency)!==costCurrency
    ||canonicalCurrency(fx.toCurrency)!==functionalCurrency)
    fail('Foreign-currency receipt requires dated, identified, direct FX evidence.');
  const rate=nonNegativeExact(fx.rate,8,'FX rate');
  if(rate<=0n)fail('FX rate must be positive.');
  return roundDivide(cost*rate,FX_SCALE);
}
function assertEventScope(event:MovingAverageEvent,scope:MovingAverageScope):void{
  for(const key of ['workspaceId','branchId','warehouseId','itemId'] as const){
    if(!scope[key]?.trim()||event[key]!==scope[key])fail('Mixed or missing product/warehouse/workspace/branch scope: '+key);
  }
}

/**
 * One product + warehouse. Event order is immutable sequence and nondecreasing
 * transaction date. Opening valuation must be supplied as actual cost evidence.
 * Transfer, stock correction, purchase reversal, obsolescence/NRV and closed-
 * period handling are intentionally NOT accepted by this limited event model.
 */
export function calculateMovingWeightedAverage(scope:MovingAverageScope,events:readonly MovingAverageEvent[]):MovingAverageResult{
  const currency=canonicalCurrency(scope.functionalCurrency);
  const seen=new Set<string>();
  const issues=new Map<string,OriginalIssue>();
  const steps:MovingAverageStep[]=[];
  let quantity=0n,value=0n,totalCogs=0n,previousSequence=-1,previousDate='';
  for(const event of events){
    assertEventScope(event,scope);
    if(!event.id?.trim()||seen.has(event.id))fail('Missing or duplicate movement identity.');
    seen.add(event.id);
    if(!Number.isSafeInteger(event.sequence)||event.sequence<=previousSequence
      ||!isIsoDate(event.date)||event.date<previousDate)
      fail('A stable, chronological, strictly increasing movement sequence is required.');
    previousSequence=event.sequence;
    previousDate=event.date;
    const amount=positiveQty(event.quantity);
    let change=0n,cogs=0n,unitCost=0n;
    if(event.kind==='opening'||event.kind==='receipt'){
      if(event.kind==='opening'&&(steps.length!==0||quantity!==0n))fail('Opening cost must be the first movement.');
      if(event.originalIssueId)fail('Receipt cannot inherit an issue reference.');
      unitCost=recognizedCost(event,currency);
      change=roundDivide(amount*unitCost,QTY_SCALE);
      quantity+=amount;value+=change;
    }else if(event.kind==='issue'){
      if(event.unitCost!==undefined||event.costCurrency!==undefined||event.fx||event.originalIssueId)
        fail('Issue cost must be derived from available stock, never manually supplied.');
      if(amount>quantity)fail('Insufficient valued inventory; no negative stock.');
      change=amount===quantity?-value:-roundDivide(value*amount,quantity);
      unitCost=roundDivide(-change*QTY_SCALE,amount);
      quantity-=amount;value+=change;
      cogs=-change;totalCogs+=cogs;
      issues.set(event.id,{quantity:amount,value:cogs,returnedQuantity:0n,returnedValue:0n});
    }else if(event.kind==='return'){
      if(event.unitCost!==undefined||event.costCurrency!==undefined||event.fx)
        fail('Return cannot invent a new unit cost or FX valuation.');
      const issue=issues.get(event.originalIssueId??'');
      if(!issue)fail('Physical return requires its previously valued issue in this stream.');
      if(amount>issue.quantity-issue.returnedQuantity)fail('Returned quantity exceeds original issue.');
      // On the final partial return, restore the exact remaining original value.
      change=amount===issue.quantity-issue.returnedQuantity
        ?issue.value-issue.returnedValue
        :roundDivide(issue.value*amount,issue.quantity);
      issue.returnedQuantity+=amount;issue.returnedValue+=change;
      quantity+=amount;value+=change;
      cogs=-change;totalCogs+=cogs;
      unitCost=roundDivide(change*QTY_SCALE,amount);
    }else{
      fail('Unsupported stock event; transfer, correction and reversal need dedicated audited rules.');
    }
    if(quantity===0n&&value!==0n)fail('Empty inventory retained an unexplained carrying value.');
    steps.push({
      id:event.id,kind:event.kind,quantity:format(amount,4),
      recognizedUnitCost:format(unitCost,12),
      valueChange:format(change,12),costOfGoodsSold:format(cogs,12),
      balanceQuantity:format(quantity,4),balanceValue:format(value,12),
      averageUnitCost:format(quantity>0n?roundDivide(value*QTY_SCALE,quantity):0n,12)
    });
  }
  return {
    currency,balanceQuantity:format(quantity,4),balanceValue:format(value,12),
    averageUnitCost:format(quantity>0n?roundDivide(value*QTY_SCALE,quantity):0n,12),
    costOfGoodsSold:format(totalCogs,12),steps
  };
}
