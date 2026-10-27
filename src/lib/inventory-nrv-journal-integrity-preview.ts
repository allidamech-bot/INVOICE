import {decimalToScaled} from './money.js';
import {
  previewInventoryNrvAllowance,
  type NrvPreviewInput
} from './inventory-nrv-preview.js';
import type {IllustrativeJournalLine} from './inventory-journal-integrity-preview.js';

/**
 * Alif 22: read-only, strictly matched IAS 2 impairment journal QA.
 *
 * A prior allowance ID, an estimate ID and accounting account IDs supplied
 * by a caller are NOT authenticated accounting journals or approvals.
 * Never send this proposed entry to a real ledger without separate controls.
 */
export interface NrvIllustrativeJournal {
  id:string;
  sourceEstimateId:string;
  date:string;
  workspaceId:string;
  branchId:string;
  warehouseId:string;
  itemId:string;
  currency:string;
  lines:readonly IllustrativeJournalLine[];
}
export interface NrvIllustrativeAccounts {
  inventoryAssetAccountId:string;
  inventoryAllowanceAccountId:string;
  impairmentExpenseAccountId:string;
  currencyMinorDigits:0|2|3;
}
export interface NrvIllustrativeJournalInspection {
  sourceEstimateId:string;
  treatment:'write-down'|'reversal'|'unchanged';
  currency:string;
  grossInventoryCost:string;
  priorAllowance:string;
  closingAllowance:string;
  illustrativeNetInventory:string;
  illustrativeAllowanceChange:string;
  matchedJournalCount:0|1;
  matchedDebitAmount:string;
  matchedCreditAmount:string;
  /** Complete proof of real book accounts, previous allowance and NRV are absent. */
  journalPosted:false;
  approvalAuthenticated:false;
  generalLedgerReconciled:false;
  productionReady:false;
}
function refuse(message:string):never{
  throw new Error('ALIF_22_NRV_JOURNAL_NOT_READY: '+message);
}
function exactMoney(value:string,digits:number):bigint{
  if(typeof value!=='string'||!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)
    ||(value.split('.')[1]?.length??0)>digits)
    refuse('Journal amounts must be exact non-negative currency minor units.');
  return decimalToScaled(value,digits);
}
function exactValuation(value:string,digits:number):bigint{
  if(!/^-?\d+\.\d{12}$/.test(value))
    refuse('Expected valuation amount is not a complete 12-decimal value.');
  const raw=decimalToScaled(value,12),factor=10n**BigInt(12-digits);
  if(raw%factor!==0n)
    refuse('Fractional minor-unit NRV cost requires an approved rounding and residual policy.');
  return raw/factor;
}
function money(value:bigint,digits:number):string{
  const abs=value<0n?-value:value,mul=10n**BigInt(digits);
  return (value<0n?'-':'')+(abs/mul).toString()+
    (digits?'.'+(abs%mul).toString().padStart(digits,'0'):'');
}
/**
 * The resulting journal must be exactly:
 *  - Write-down: Dr impairment expense, Cr inventory valuation allowance;
 *  - Reversal:   Dr inventory valuation allowance, Cr impairment expense.
 * The historical gross-cost inventory asset is NOT credited by this proposal.
 * No adjustment means exactly ZERO journals.
 */
export function inspectIllustrativeNrvJournal(
  input:NrvPreviewInput,
  candidate:readonly NrvIllustrativeJournal[],
  accounts:NrvIllustrativeAccounts
):NrvIllustrativeJournalInspection{
  const proposal=previewInventoryNrvAllowance(input);
  const {scope}=proposal,digits=accounts.currencyMinorDigits;
  if(![0,2,3].includes(digits)||!accounts.inventoryAssetAccountId?.trim()
    ||!accounts.inventoryAllowanceAccountId?.trim()
    ||!accounts.impairmentExpenseAccountId?.trim()
    ||new Set([accounts.inventoryAssetAccountId,accounts.inventoryAllowanceAccountId,
      accounts.impairmentExpenseAccountId]).size!==3)
    refuse('Three distinct explicit inventory, allowance and expense accounts and currency precision required.');
  const delta=exactValuation(proposal.allowanceChange,digits);
  const opening=exactValuation(proposal.priorAllowance,digits);
  const closing=exactValuation(proposal.proposedClosingAllowance,digits);
  const gross=exactValuation(proposal.grossCostValue,digits);
  const net=exactValuation(proposal.lowerOfCostAndNrv,digits);
  if(opening+delta!==closing||gross-closing!==net||closing<0n||net<0n
    ||proposal.treatment!==(delta>0n?'write-down':delta<0n?'reversal':'unchanged'))
    refuse('Candidate allowance does not reconcile to IAS 2 gross inventory and NRV.');
  if(delta===0n){
    if(candidate.length!==0)refuse('Unchanged allowance cannot create a financial journal.');
    return{
      sourceEstimateId:proposal.estimateId,treatment:proposal.treatment,
      currency:proposal.currency,grossInventoryCost:money(gross,digits),
      priorAllowance:money(opening,digits),closingAllowance:money(closing,digits),
      illustrativeNetInventory:money(net,digits),
      illustrativeAllowanceChange:money(delta,digits),
      matchedJournalCount:0,matchedDebitAmount:money(0n,digits),
      matchedCreditAmount:money(0n,digits),
      journalPosted:false,approvalAuthenticated:false,
      generalLedgerReconciled:false,productionReady:false
    };
  }
  if(candidate.length!==1)refuse('Exactly one illustrative journal is required for a nonzero NRV change.');
  const journal=candidate[0]!;
  if(!journal.id?.trim()||journal.sourceEstimateId!==proposal.estimateId
    ||journal.date!==proposal.asOfDate||journal.currency!==proposal.currency
    ||journal.workspaceId!==scope.workspaceId||journal.branchId!==scope.branchId
    ||journal.warehouseId!==scope.warehouseId||journal.itemId!==scope.itemId)
    refuse('Journal provenance, date, currency and inventory scope do not match the NRV estimate.');
  if(journal.lines.length!==2)
    refuse('NRV journal must contain the exact two approved illustrative account directions.');
  const debitAccount=delta>0n?accounts.impairmentExpenseAccountId:accounts.inventoryAllowanceAccountId;
  const creditAccount=delta>0n?accounts.inventoryAllowanceAccountId:accounts.impairmentExpenseAccountId;
  let debits=0n,credits=0n;
  for(const line of journal.lines){
    if(!line.accountId?.trim()||(line.direction!=='debit'&&line.direction!=='credit'))
      refuse('Journal account and debit/credit direction are mandatory.');
    const amt=exactMoney(line.amount,digits);
    if(amt<=0n)refuse('Zero or negative candidate NRV journal lines are unsupported.');
    if(line.direction==='debit'){
      if(line.accountId!==debitAccount||debits!==0n)
        refuse('Incorrect NRV expense/allowance debit account or duplicate debit.');
      debits+=amt;
    }else{
      if(line.accountId!==creditAccount||credits!==0n)
        refuse('Incorrect NRV expense/allowance credit account or duplicate credit.');
      credits+=amt;
    }
  }
  const expected=delta<0n?-delta:delta;
  if(debits!==expected||credits!==expected)
    refuse('Balanced candidate NRV journal still differs from the independently recomputed allowance.');
  return{
    sourceEstimateId:proposal.estimateId,treatment:proposal.treatment,
    currency:proposal.currency,grossInventoryCost:money(gross,digits),
    priorAllowance:money(opening,digits),closingAllowance:money(closing,digits),
    illustrativeNetInventory:money(net,digits),
    illustrativeAllowanceChange:money(delta,digits),
    matchedJournalCount:1,matchedDebitAmount:money(debits,digits),
    matchedCreditAmount:money(credits,digits),
    journalPosted:false,approvalAuthenticated:false,
    generalLedgerReconciled:false,productionReady:false
  };
}
