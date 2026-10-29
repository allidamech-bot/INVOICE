import type {VaultPayload} from '../types.js';
import {isIsoDate} from './id.js';
import {validateManualMovementEvidence} from './inventory-evidence.js';
import {reconcilePostedInvoiceCostsToWac} from './inventory-cost-reconciliation.js';
import type {PostedValuationEvidence} from './inventory-valuation-evidence.js';

/**
 * Alif 22: pure, fail-closed INVENTORY EVIDENCE audit.
 * All strings in proposedPolicy are UNAUTHENTICATED assertions from a caller.
 * Neither client-side claims nor a successful WAC replay approve a cost cutover.
 */
export interface ProposedInventoryValuationPolicy {
  workspaceId:string;
  branchId:string;
  itemId:string;
  warehouseId:string;
  functionalCurrency:string;
  proposedBy:string;
  policyEvidenceId:string;
  proposedAsOfDate:string;
  costingMethod:'moving-weighted-average'|'specific-identification';
  itemClass:'interchangeable'|'non-interchangeable';
  openingBasis:'documented-opening'|'verified-zero';
  openingEvidenceId:string;
}
export type InventoryCutoverBlockerCode=
  'MISSING_POLICY_EVIDENCE'|'SCOPE_NOT_FOUND'|'UNSUPPORTED_ITEM_CLASS'
  |'UNVERIFIED_OPENING'|'INCOMPLETE_CHRONOLOGY'|'UNVERIFIED_MOVEMENTS'
  |'SOURCE_RECONCILIATION_FAILED'|'NO_POSTED_GENERAL_LEDGER'
  |'UNVERIFIED_PERIOD_AUTHORITY'|'UNVERIFIED_OWNER_SIGNATURE'
  |'UNVERIFIED_NET_REALISABLE_VALUE';
export interface InventoryCutoverBlocker {
  code:InventoryCutoverBlockerCode;
  detail:string;
}
export interface InventoryCutoverAuditResult {
  scope:PostedValuationEvidence['scope'];
  evaluatedMovementCount:number;
  evidenceCoverage:'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS'|'INCOMPLETE';
  calculatedQuantity?:string;
  calculatedCarryingValue?:string;
  frozenInvoiceCOGS?:string;
  modeledSaleCOGS?:string;
  historicInvoiceDifference?:string;
  ownerApprovalAuthenticated:false;
  accountingJournalVerified:false;
  productionReady:false;
  blockers:InventoryCutoverBlocker[];
}
type CutoverVault=Pick<VaultPayload,'workspaces'|'branches'|'savedItems'|'inventoryMovements'|'purchases'|'documents'>;
export interface InventoryCostAuditInput {
  vault:CutoverVault;
  policy?:ProposedInventoryValuationPolicy;
  /** These must represent ALL historical events, not a filtered date range. */
  evidence:PostedValuationEvidence;
}
const permanent:InventoryCutoverBlocker[]=[
  {code:'NO_POSTED_GENERAL_LEDGER',detail:'No independently verified inventory/COGS journal and trial balance.'},
  {code:'UNVERIFIED_PERIOD_AUTHORITY',detail:'Trusted period-close/write lock and cutover are not verified.'},
  {code:'UNVERIFIED_OWNER_SIGNATURE',detail:'Caller-supplied policy text is not authenticated owner approval.'},
  {code:'UNVERIFIED_NET_REALISABLE_VALUE',detail:'Cost versus net realisable value has not been evidenced.'}
];
function required(value:string|undefined):boolean{return typeof value==='string'&&value.trim().length>0;}
function matching(a:string,b:string):boolean{return a.trim().toUpperCase()===b.trim().toUpperCase();}
function sameScope(policy:ProposedInventoryValuationPolicy,scope:PostedValuationEvidence['scope']):boolean{
  return ['workspaceId','branchId','warehouseId','itemId'].every(k=>
    policy[k as keyof ProposedInventoryValuationPolicy]===scope[k as keyof typeof scope])
    &&matching(policy.functionalCurrency,scope.functionalCurrency);
}
function strictCostPolicy(policy:ProposedInventoryValuationPolicy|undefined,scope:PostedValuationEvidence['scope']):boolean{
  if(!policy||!sameScope(policy,scope)||!isIsoDate(policy.proposedAsOfDate)
    ||!required(policy.proposedBy)||!required(policy.policyEvidenceId)
    ||!required(policy.openingEvidenceId))return false;
  return policy.costingMethod==='moving-weighted-average'
    &&policy.itemClass==='interchangeable';
}
/**
 * Audit the evidence necessary to begin an authenticated accounting cutover.
 * The calculated side can be COMPLETE; the production decision cannot.
 */
export function auditInventoryValuationCutover(input:InventoryCostAuditInput):InventoryCutoverAuditResult{
  const {vault,evidence,policy}=input,scope=evidence.scope;
  const blockers:InventoryCutoverBlocker[]=[];
  const add=(code:InventoryCutoverBlockerCode,detail:string):void=>{blockers.push({code,detail});};
  const rows=vault.inventoryMovements.filter(row=>row.itemId===scope.itemId
    &&(!row.workspaceId||row.workspaceId===scope.workspaceId)
    &&(!row.branchId||row.branchId===scope.branchId));
  if(!strictCostPolicy(policy,scope))
    add('MISSING_POLICY_EVIDENCE','Explicit scoped proposed functional currency, date, method and opening evidence are required.');
  if(policy&&(policy.costingMethod!=='moving-weighted-average'
    ||policy.itemClass!=='interchangeable'))
    add('UNSUPPORTED_ITEM_CLASS','This WAC projection must not be applied to non-interchangeable assets.');
  // A stock item's ID must identify exactly one catalog record in the
  // complete vault, and that record must belong to this SAME branch.
  // Merely matching its parent workspace can let a different branch's
  // product masquerade as a valued in-branch item.
  const catalogMatches=vault.savedItems.filter(i=>i.id===scope.itemId);
  if(vault.workspaces.filter(w=>w.id===scope.workspaceId).length!==1
    ||vault.branches.filter(b=>b.id===scope.branchId&&b.workspaceId===scope.workspaceId).length!==1
    ||catalogMatches.length!==1
    ||catalogMatches[0]?.workspaceId!==scope.workspaceId
    ||catalogMatches[0]?.branchId!==scope.branchId)
    add('SCOPE_NOT_FOUND','Verified unique company, branch and catalog item records are required.');
  const openings=rows.filter(r=>r.type==='opening');
  if(policy){
    if(policy.openingBasis==='verified-zero'){
      if(openings.length) add('UNVERIFIED_OPENING','Zero-opening evidence contradicts a recorded stock opening.');
    }else if(policy.openingBasis==='documented-opening'){
      if(openings.length!==1||!evidence.orderedMovementIds.length
        ||evidence.orderedMovementIds[0]!==openings[0]?.id
        ||openings[0]?.evidence?.id!==policy.openingEvidenceId)
        add('UNVERIFIED_OPENING','Exactly one fully supported original opening must lead the stream.');
      else {
        try{validateManualMovementEvidence(openings[0]!);}
        catch{add('UNVERIFIED_OPENING','Opening file, operator or movement reason failed local structural validation.');}
      }
    }else add('UNVERIFIED_OPENING','Opening-balance control was not identified.');
  }
  if(policy&&rows.some(r=>r.date>policy.proposedAsOfDate))
    add('INCOMPLETE_CHRONOLOGY','The scope has movements after the proposed complete-history as-of date.');
  if(JSON.stringify(evidence.movements)!==JSON.stringify(vault.inventoryMovements))
    add('INCOMPLETE_CHRONOLOGY','Input must reference the complete unchanged vault movement stream.');
  if(JSON.stringify(evidence.purchases)!==JSON.stringify(vault.purchases)
    ||JSON.stringify(evidence.documents)!==JSON.stringify(vault.documents))
    add('UNVERIFIED_MOVEMENTS','The supplied purchase and document sources do not match the vault.');
  let result:ReturnType<typeof reconcilePostedInvoiceCostsToWac>|undefined;
  // Never issue inventory/cost figures against a missing, duplicate, or
  // wrong-branch catalog identity, even as an unposted diagnostic.
  if(!blockers.some(b=>b.code==='INCOMPLETE_CHRONOLOGY'
    ||b.code==='UNVERIFIED_MOVEMENTS'||b.code==='SCOPE_NOT_FOUND')){
    try{result=reconcilePostedInvoiceCostsToWac(evidence);}
    catch(err){
      add('SOURCE_RECONCILIATION_FAILED',
        err instanceof Error?err.message:'Source or FX cost valuation evidence could not be verified.');
    }
  }
  return{
    scope:{...scope},evaluatedMovementCount:rows.length,
    evidenceCoverage:blockers.length?'INCOMPLETE':'COMPLETE_FOR_SUPPORTED_SCOPED_EVENTS',
    ...(result?{
      calculatedQuantity:result.balanceQuantity,
      calculatedCarryingValue:result.balanceValue,
      frozenInvoiceCOGS:result.totalFrozenInvoiceCost,
      modeledSaleCOGS:result.totalRoundedMovingAverageCost,
      historicInvoiceDifference:result.totalInvoiceCostOverValuation
    }:{}),
    ownerApprovalAuthenticated:false,accountingJournalVerified:false,
    productionReady:false,blockers:[...blockers,...permanent]
  };
}
