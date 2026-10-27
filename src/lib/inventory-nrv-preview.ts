import {isIsoDate} from './id.js';
import {decimalToScaled,normalizeDecimalInput} from './money.js';
import {calculateMovingWeightedAverage,type MovingAverageEvent,type MovingAverageScope} from './inventory-moving-average.js';

/**
 * IAS 2 NRV calculation PREVIEW only. Nothing is persisted or journalled.
 * Source documents, cost-to-sell completeness, balance opening and approval
 * still require independent accounting / trusted-server verification.
 */
export interface NrvEstimateEvidence {
  id:string;
  asOfDate:string;
  currency:string;
  inventoryClass:'ordinary-saleable-goods'|'work-in-progress'|'raw-material'|'contract-specific';
  /** Evidence for ordinary-course expected selling price PER physical unit. */
  expectedSalePricePerUnit:string;
  salePriceEvidenceId:string;
  /** Estimates PER physical unit. All costs necessary for sale must be assessed. */
  costToCompletePerUnit:string;
  completionCostEvidenceId:string;
  necessarySellingCostPerUnit:string;
  sellingCostEvidenceId:string;
}
export interface NrvPriorAllowance {
  id:string;
  asOfDate:string;
  currency:string;
  workspaceId:string;
  branchId:string;
  warehouseId:string;
  itemId:string;
  /** Previous allowance only applies to the SAME unchanged cost and quantity. */
  quantity:string;
  grossCostValue:string;
  allowanceValue:string;
  journalEvidenceId:string;
}
export interface NrvPreviewInput {
  scope:MovingAverageScope;
  history:readonly MovingAverageEvent[];
  estimate:NrvEstimateEvidence;
  /** Mandatory proof reference asserting no previous allowance, when absent. */
  zeroPriorAllowanceEvidenceId?:string;
  priorAllowance?:NrvPriorAllowance;
}
export interface NrvWriteDownPreview {
  scope:MovingAverageScope;
  estimateId:string;
  asOfDate:string;
  currency:string;
  quantity:string;
  grossCostValue:string;
  nrvPerUnit:string;
  totalNrv:string;
  lowerOfCostAndNrv:string;
  priorAllowance:string;
  proposedClosingAllowance:string;
  allowanceChange:string;
  treatment:'write-down'|'reversal'|'unchanged';
  proposedWriteDownExpense:string;
  proposedReversalExpenseReduction:string;
  /** Historical WAC remains untouched by an NRV expense proposal. */
  priorSalesCostOfGoodsSold:string;
  sourceEvidenceAuthenticated:false;
  priorJournalAuthenticated:false;
  posted:false;
  approved:false;
  productionReady:false;
}
const QTY_SCALE=10_000n;
const VALUE_SCALE=1_000_000_000_000n;
function fail(reason:string):never{throw new Error('ALIF_22_NRV_NOT_APPROVED: '+reason);}
function amount(raw:string,label:string):bigint{
  if(typeof raw!=='string')fail(label+' must be an exact decimal.');
  const normalized=normalizeDecimalInput(raw);
  if(!/^(?:\d+(?:\.\d{1,12})?|\.\d{1,12})$/.test(normalized))
    fail(label+' must be nonnegative with at most twelve decimals.');
  return decimalToScaled(normalized,12);
}
function canonical(value:string):string{
  const result=value?.trim().toUpperCase()||'';
  if(!/^[A-Z]{3}$/.test(result))fail('Explicit three-letter functional currency required.');
  return result;
}
function format(value:bigint):string{
  const negative=value<0n,abs=negative?-value:value;
  return (negative?'-':'')+(abs/VALUE_SCALE).toString()+'.'+
    (abs%VALUE_SCALE).toString().padStart(12,'0');
}
function multiplyUnitByStock(unitAmount:bigint,quantity:bigint):bigint{
  const raw=unitAmount*quantity;
  return (raw+QTY_SCALE/2n)/QTY_SCALE;
}

/**
 * Prior allowance must be identified from a separately authorized ledger.
 * If quantity/cost has changed since the last assessment, the preview refuses
 * to guess which impairment portion follows sold or transferred units.
 */
export function previewInventoryNrvAllowance(input:NrvPreviewInput):NrvWriteDownPreview{
  const {scope,history,estimate,priorAllowance:prior}=input;
  const currency=canonical(scope.functionalCurrency);
  if(!scope.workspaceId?.trim()||!scope.branchId?.trim()
    ||!scope.warehouseId?.trim()||!scope.itemId?.trim())
    fail('Complete company, branch, warehouse and stock identity required.');
  if(!estimate.id?.trim()||!isIsoDate(estimate.asOfDate)
    ||canonical(estimate.currency)!==currency)
    fail('Dated, identified estimate must use the documented functional currency.');
  if(estimate.inventoryClass!=='ordinary-saleable-goods')
    fail('Raw materials, production, contracted or unique stock require a separate IAS 2 policy.');
  if(!estimate.salePriceEvidenceId?.trim()||!estimate.completionCostEvidenceId?.trim()
    ||!estimate.sellingCostEvidenceId?.trim())
    fail('Sale price, completion and necessary selling cost each require source evidence.');
  if(history.some(e=>e.date>estimate.asOfDate))
    fail('Estimates cannot predate inventory movements included in their valuation.');
  if(history.some(e=>e.kind!=='receipt'&&e.kind!=='issue'))
    fail('Returns, opening, transfers and corrections need approved book-value rules.');
  const valued=calculateMovingWeightedAverage(scope,history);
  const stock=decimalToScaled(valued.balanceQuantity,4);
  if(stock<=0n)fail('NRV allowance on an empty or unverified stock balance is unsupported.');
  const gross=amount(valued.balanceValue,'Gross stock carrying cost');
  const price=amount(estimate.expectedSalePricePerUnit,'Expected selling price');
  const finish=amount(estimate.costToCompletePerUnit,'Necessary completion cost');
  const sell=amount(estimate.necessarySellingCostPerUnit,'Necessary selling cost');
  if(finish+sell>price)
    fail('Estimated costs exceed selling price; negative NRV / obligations need a separate assessment.');
  const netUnit=price-finish-sell;
  const totalNrv=multiplyUnitByStock(netUnit,stock);
  const lower=gross<totalNrv?gross:totalNrv;
  const targetAllowance=gross-lower;
  let previous=0n;
  if(prior){
    if(input.zeroPriorAllowanceEvidenceId?.trim())fail('Conflicting prior allowance and zero-attestation claims.');
    if(!prior.id?.trim()||!prior.journalEvidenceId?.trim()
      ||!isIsoDate(prior.asOfDate)||prior.asOfDate>=estimate.asOfDate
      ||canonical(prior.currency)!==currency
      ||prior.workspaceId!==scope.workspaceId||prior.branchId!==scope.branchId
      ||prior.warehouseId!==scope.warehouseId||prior.itemId!==scope.itemId
      ||amount(prior.grossCostValue,'Prior cost basis')!==gross
      ||prior.quantity!==valued.balanceQuantity)
      fail('Prior NRV allowance does not match unchanged dated cost/quantity/scope.');
    previous=amount(prior.allowanceValue,'Previous allowance');
    if(previous>gross)fail('Previously recognized allowance exceeds supported gross inventory cost.');
  }else if(!input.zeroPriorAllowanceEvidenceId?.trim()){
    fail('Missing evidence of zero prior allowance; do not invent an opening write-down.');
  }
  const delta=targetAllowance-previous;
  return {
    scope:{...scope},estimateId:estimate.id,asOfDate:estimate.asOfDate,currency,
    quantity:valued.balanceQuantity,grossCostValue:format(gross),
    nrvPerUnit:format(netUnit),totalNrv:format(totalNrv),
    lowerOfCostAndNrv:format(lower),priorAllowance:format(previous),
    proposedClosingAllowance:format(targetAllowance),allowanceChange:format(delta),
    treatment:delta>0n?'write-down':delta<0n?'reversal':'unchanged',
    proposedWriteDownExpense:format(delta>0n?delta:0n),
    proposedReversalExpenseReduction:format(delta<0n?-delta:0n),
    priorSalesCostOfGoodsSold:valued.costOfGoodsSold,
    sourceEvidenceAuthenticated:false,priorJournalAuthenticated:false,
    posted:false,approved:false,productionReady:false
  };
}
