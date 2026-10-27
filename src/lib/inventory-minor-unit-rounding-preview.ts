import {decimalToScaled} from './money.js';
import {
  calculateMovingWeightedAverage,
  type MovingAverageEvent,type MovingAverageScope
} from './inventory-moving-average.js';

/**
 * Alif 22: READ-ONLY evaluation of an explicitly proposed minor-unit policy.
 *
 * This algorithm rounds the running inventory asset position at every event;
 * the change between two rounded positions is the candidate journal amount.
 * No live posting, rounding policy authorization or ledger authority is implied.
 */
export interface RoundedInventoryCostStep {
  sourceMovementId:string;
  kind:'receipt'|'issue';
  quantity:string;
  /** Exact 12-decimal modeled value change, never overwritten by rounding. */
  modeledValueChange:string;
  modeledBalanceValue:string;
  candidateInventoryAssetChange:string;
  candidatePurchaseCost:string;
  candidateSalesCOGS:string;
  candidateInventoryBalance:string;
}
export interface RoundedInventoryCostPreview {
  currency:string;
  minorDigits:0|2|3;
  policy:'cumulative-rounded-balance-v1';
  endingQuantity:string;
  exactEndingInventory:string;
  roundedEndingInventory:string;
  exactModeledSalesCOGS:string;
  roundedModeledSalesCOGS:string;
  candidatePurchaseCostTotal:string;
  candidateSalesCOGSTotal:string;
  /** Difference between candidate total sales COGS and rounded modeled COGS. */
  unresolvedSalesCOGSRoundingDifference:string;
  hasUnresolvedRoundingDifference:boolean;
  steps:RoundedInventoryCostStep[];
  /** This has not been authorized by an accountant or a trusted server. */
  journalPosted:false;
  policyApproved:false;
  productionReady:false;
}
function fail(message:string):never{
  throw new Error('ALIF_22_MINOR_UNIT_POLICY_NOT_APPROVED: '+message);
}
function round(value:bigint,divisor:bigint):bigint{
  if(divisor<=0n)fail('Invalid monetary scale.');
  const sign=value<0n?-1n:1n,abs=value<0n?-value:value;
  return sign*((abs+divisor/2n)/divisor);
}
function format(value:bigint,digits:number):string{
  const neg=value<0n,abs=neg?-value:value,denom=10n**BigInt(digits);
  return(neg?'-':'')+(abs/denom).toString()+(digits?'.'+(abs%denom).toString().padStart(digits,'0'):'');
}
function modeledUnits(value:string,digits:number):bigint{
  if(!/^-?\d+\.\d{12}$/.test(value))
    fail('Stock valuation must provide exact twelve-decimal amounts.');
  return round(decimalToScaled(value,12),10n**BigInt(12-digits));
}

/**
 * Accepted inputs: ordinary receipts and issues with complete, authenticated
 * chronology supplied by a caller (this module does not authenticate it).
 *
 * No return, opening, transfer, reversal, manual adjustment or FX journal here.
 * Tiny movements that round to a zero book amount need a separate explicit
 * memo/aggregation policy and MUST NOT be silently dropped as journal lines.
 */
export function previewCumulativeInventoryMinorUnitRounding(
  scope:MovingAverageScope,events:readonly MovingAverageEvent[],
  minorDigits:0|2|3
):RoundedInventoryCostPreview{
  if(![0,2,3].includes(minorDigits))
    fail('The currency minor-unit precision must be 0, 2, or 3.');
  const computed=calculateMovingWeightedAverage(scope,events);
  const steps:RoundedInventoryCostStep[]=[];
  let asset=0n,receipts=0n,cogs=0n;
  for(const movement of computed.steps){
    if(movement.kind!=='receipt'&&movement.kind!=='issue')
      fail('Openings, returns and stock corrections need separately approved journal rules.');
    const roundedBalance=modeledUnits(movement.balanceValue,minorDigits);
    const delta=roundedBalance-asset;
    if(movement.kind==='receipt'&&delta<=0n)
      fail('Receipt has zero or negative journal value after rounding; separate memo policy is required.');
    if(movement.kind==='issue'&&delta>=0n)
      fail('Issue has zero or positive asset impact after rounding; separate memo policy is required.');
    const received=movement.kind==='receipt'?delta:0n;
    const sold=movement.kind==='issue'?-delta:0n;
    receipts+=received;cogs+=sold;asset=roundedBalance;
    steps.push({
      sourceMovementId:movement.id,kind:movement.kind,
      quantity:movement.quantity,
      modeledValueChange:movement.valueChange,
      modeledBalanceValue:movement.balanceValue,
      candidateInventoryAssetChange:format(delta,minorDigits),
      candidatePurchaseCost:format(received,minorDigits),
      candidateSalesCOGS:format(sold,minorDigits),
      candidateInventoryBalance:format(asset,minorDigits)
    });
  }
  const modelTotal=modeledUnits(computed.costOfGoodsSold,minorDigits);
  const diff=cogs-modelTotal;
  if(asset!==receipts-cogs
    ||asset!==modeledUnits(computed.balanceValue,minorDigits))
    fail('Ending candidate inventory fails the cumulative value reconciliation.');
  return{
    currency:computed.currency,minorDigits,
    policy:'cumulative-rounded-balance-v1',
    endingQuantity:computed.balanceQuantity,
    exactEndingInventory:computed.balanceValue,
    roundedEndingInventory:format(asset,minorDigits),
    exactModeledSalesCOGS:computed.costOfGoodsSold,
    roundedModeledSalesCOGS:format(modelTotal,minorDigits),
    candidatePurchaseCostTotal:format(receipts,minorDigits),
    candidateSalesCOGSTotal:format(cogs,minorDigits),
    unresolvedSalesCOGSRoundingDifference:format(diff,minorDigits),
    hasUnresolvedRoundingDifference:diff!==0n,
    steps,journalPosted:false,policyApproved:false,productionReady:false
  };
}
