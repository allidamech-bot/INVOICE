import {decimalToScaled} from './money.js';
import {projectPostedValuationEvidence,type PostedValuationEvidence} from './inventory-valuation-evidence.js';

/**
 * Alif 22: Validate illustrative DOUBLE-ENTRY JOURNAL PROPOSALS only.
 * This application does NOT yet have a posted Inventory/COGS general ledger.
 * Account identifiers and source journals are supplied, never fabricated.
 */
export interface IllustrativeJournalLine {
  accountId:string;
  direction:'debit'|'credit';
  amount:string;
}
export interface IllustrativeInventoryJournal {
  id:string;
  sourceMovementId:string;
  date:string;
  workspaceId:string;
  branchId:string;
  currency:string;
  lines:readonly IllustrativeJournalLine[];
}
export interface IllustrativeJournalControls {
  inventoryAccountId:string;
  salesCogsAccountId:string;
  /** Supported accounting minor-unit precision must be explicitly selected. */
  currencyMinorDigits:0|2|3;
}
export interface IllustrativeJournalAudit {
  checkedEntries:number;
  balanceQuantity:string;
  carryingValue:string;
  illustrativeNetInventory:string;
  illustrativeTotalSalesCOGS:string;
  evidenceMatched:true;
  /** Proposals have no attested writer, posted GL or trusted trial balance. */
  posted:false;
  approved:false;
  productionReady:false;
}
function refuse(reason:string):never{
  throw new Error('ALIF_22_JOURNAL_NOT_READY: '+reason);
}
function value(input:string,digits:number):bigint{
  if(typeof input!=='string'||!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)
    ||(input.split('.')[1]?.length??0)>digits)
    refuse('Journal amounts must use valid nonnegative currency minor units.');
  return decimalToScaled(input,digits);
}
function exactCurrencyUnits(scaled:string,minorDigits:number):bigint{
  if(!/^-?\d+\.\d{12}$/.test(scaled))refuse('Modeled value is not a canonical 12-decimal money value.');
  const original=decimalToScaled(scaled,12),factor=10n**BigInt(12-minorDigits);
  if(original%factor!==0n)
    refuse('Valuation has fractional minor currency units; approved rounding journal policy is missing.');
  return original/factor;
}
function canonical(scope:PostedValuationEvidence['scope'],a:string):boolean{
  return a.trim().toUpperCase()===scope.functionalCurrency.trim().toUpperCase();
}
export function inspectIllustrativeInventoryJournals(
  evidence:PostedValuationEvidence,
  entries:readonly IllustrativeInventoryJournal[],
  controls:IllustrativeJournalControls
):IllustrativeJournalAudit{
  const projected=projectPostedValuationEvidence(evidence);
  const scope=evidence.scope,digits=controls.currencyMinorDigits;
  if(![0,2,3].includes(digits)||!controls.inventoryAccountId?.trim()
    ||!controls.salesCogsAccountId?.trim()
    ||controls.inventoryAccountId===controls.salesCogsAccountId)
    refuse('Two distinct explicitly mapped ledger accounts and currency precision are required.');
  if(projected.steps.some(step=>step.kind!=='receipt'&&step.kind!=='issue'))
    refuse('Opening, return, reversal, transfer and adjustment journals need separate authoritative rules.');
  if(projected.steps.length!==entries.length)
    refuse('Every valued receipt and issue must have exactly one illustrative journal.');
  const bySource=new Map<string,IllustrativeInventoryJournal>();
  const identities=new Set<string>();
  for(const journal of entries){
    if(!journal.id?.trim()||identities.has(journal.id)||!journal.sourceMovementId?.trim()
      ||bySource.has(journal.sourceMovementId))
      refuse('Duplicate or missing journal/source identity.');
    identities.add(journal.id);bySource.set(journal.sourceMovementId,journal);
  }
  let inventory=0n,cogs=0n;
  for(const step of projected.steps){
    const journal=bySource.get(step.id);
    const movement=evidence.movements.find(row=>row.id===step.id);
    if(!journal||!movement||journal.date!==movement.date
      ||journal.workspaceId!==scope.workspaceId
      ||journal.branchId!==scope.branchId||!canonical(scope,journal.currency))
      refuse('Journal is missing or disagrees with its verified financial source/date/currency.');
    if(journal.lines.length<2)refuse('Double entry must have at least two account lines.');
    let debits=0n,credits=0n,inv=0n,salesCost=0n;
    for(const line of journal.lines){
      if(!line.accountId?.trim()||(line.direction!=='debit'&&line.direction!=='credit'))
        refuse('Account and debit/credit direction are mandatory.');
      const amount=value(line.amount,digits);
      if(amount<=0n)refuse('Zero or negative general ledger lines are not permitted.');
      const signed=line.direction==='debit'?amount:-amount;
      if(signed>0n)debits+=amount;else credits+=amount;
      if(line.accountId===controls.inventoryAccountId)inv+=signed;
      if(line.accountId===controls.salesCogsAccountId)salesCost+=signed;
    }
    if(debits!==credits)refuse('Debits and credits are not balanced in the candidate journal.');
    const expectedAsset=exactCurrencyUnits(step.valueChange,digits);
    const expectedCogs=exactCurrencyUnits(step.costOfGoodsSold,digits);
    if(inv!==expectedAsset||salesCost!==expectedCogs)
      refuse('Candidate Inventory/COGS account deltas differ from the underlying valued stock movement.');
    inventory+=inv;cogs+=salesCost;
  }
  if(inventory!==exactCurrencyUnits(projected.balanceValue,digits)
    ||cogs!==exactCurrencyUnits(projected.costOfGoodsSold,digits))
    refuse('Candidate inventory and sales cost control accounts do not reconcile to the valued history.');
  const fixed=(amount:bigint):string=>{
    const neg=amount<0n,a=neg?-amount:amount,denom=10n**BigInt(digits);
    return (neg?'-':'')+(a/denom).toString()+(digits?'.'+(a%denom).toString().padStart(digits,'0'):'');
  };
  return{
    checkedEntries:entries.length,balanceQuantity:projected.balanceQuantity,
    carryingValue:projected.balanceValue,
    illustrativeNetInventory:fixed(inventory),
    illustrativeTotalSalesCOGS:fixed(cogs),
    evidenceMatched:true,posted:false,approved:false,productionReady:false
  };
}
