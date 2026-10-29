/**
 * Alif 22 — isolated, read-only, single-currency Inventory/COGS/NRV ledger rehearsal.
 * This is NOT a live journal writer or a verified financial General Ledger.
 * Sources, mappings, functional currency, approvals and period boundaries are
 * provided by the caller; this module cannot authenticate those assertions.
 */
export type FinanceGlSourceKind=
  'purchase-receipt'|'sales-stock-issue'|'nrv-write-down'|'nrv-reversal';
export interface FinanceGlLine {
  accountId:string;
  direction:'debit'|'credit';
  amount:string;
}
export interface FinanceGlJournal {
  id:string;
  sourceKind:FinanceGlSourceKind;
  sourceMovementId:string;
  effectiveDate:string;
  workspaceId:string;
  branchId:string;
  currency:string;
  lines:readonly FinanceGlLine[];
}
export interface FinanceGlControls {
  workspaceId:string;
  branchId:string;
  /** Caller assertion only; not independent IAS 21 determination. */
  functionalCurrency:string;
  asOfDate:string;
  currencyMinorDigits:0|2|3;
  inventoryAssetAccountId:string;
  supplierPayableAccountId:string;
  salesCogsAccountId:string;
  inventoryAllowanceAccountId:string;
  impairmentExpenseAccountId:string;
}
export interface FinanceGlTrialBalanceLine {
  accountId:string;
  debitBalance:string;
  creditBalance:string;
}
export interface FinanceGlTrialBalancePreview {
  scope:{workspaceId:string;branchId:string;currency:string;asOfDate:string};
  sourceJournalCount:number;
  trialBalance:FinanceGlTrialBalanceLine[];
  totalDebitBalances:string;
  totalCreditBalances:string;
  grossInventoryAsset:string;
  inventoryAllowance:string;
  netInventoryAsset:string;
  salesCogsExpense:string;
  impairmentExpenseNet:string;
  /** These flags cannot be made true by passing caller-supplied journal data. */
  sourceAuthenticated:false;
  approvalsAuthenticated:false;
  periodAuthorityVerified:false;
  trustedPostingCommitted:false;
  independentTrialBalanceVerified:false;
  productionReady:false;
}
function fail(reason:string):never{
  throw new Error('ALIF_22_GL_UNTRUSTED: '+reason);
}
function strictDate(value:string):boolean{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function positiveAmount(value:string,digits:number):bigint{
  if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value)
    ||(value.split('.')[1]?.length??0)>digits)fail('Only exact positive currency minor units are allowed.');
  const [whole,fraction='']=value.split('.');
  const amount=BigInt(whole!)*(10n**BigInt(digits))+BigInt(fraction.padEnd(digits,'0')||'0');
  if(amount<=0n)fail('A posted source journal cannot have a zero-valued line.');
  return amount;
}
function fixed(value:bigint,digits:number):string{
  const negative=value<0n,absolute=negative?-value:value,den=10n**BigInt(digits);
  return (negative?'-':'')+String(absolute/den)+
    (digits?'.'+String(absolute%den).padStart(digits,'0'):'');
}
function required(value:string):boolean{return typeof value==='string'&&value.trim()!==''&&value===value.trim();}
function validateControls(c:FinanceGlControls):void{
  const ids=[c.inventoryAssetAccountId,c.supplierPayableAccountId,c.salesCogsAccountId,
    c.inventoryAllowanceAccountId,c.impairmentExpenseAccountId];
  if(!required(c.workspaceId)||!required(c.branchId)||!required(c.functionalCurrency)
    ||!strictDate(c.asOfDate)||![0,2,3].includes(c.currencyMinorDigits)
    ||ids.some(x=>!required(x))||new Set(ids).size!==ids.length)
    fail('Unique, explicit company/branch, accounts, date, precision and currency are required.');
}
function journalMap(c:FinanceGlControls,k:FinanceGlSourceKind):{debit:string;credit:string}{
  switch(k){
    case 'purchase-receipt':return {debit:c.inventoryAssetAccountId,credit:c.supplierPayableAccountId};
    case 'sales-stock-issue':return {debit:c.salesCogsAccountId,credit:c.inventoryAssetAccountId};
    case 'nrv-write-down':return {debit:c.impairmentExpenseAccountId,credit:c.inventoryAllowanceAccountId};
    case 'nrv-reversal':return {debit:c.inventoryAllowanceAccountId,credit:c.impairmentExpenseAccountId};
    default:fail('Unsupported source kind requires a separately approved ledger policy.');
  }
}
/**
 * Recomputes a purely illustrative trial balance, not a trusted GL snapshot.
 * The caller must supply complete, independently verified historical journals.
 * Empty history cannot attest a zero opening balance.
 */
export function previewFinanceInventoryTrialBalance(
  controls:FinanceGlControls,
  journals:readonly FinanceGlJournal[]
):FinanceGlTrialBalancePreview{
  validateControls(controls);
  // A zero-row ledger has no verified opening source. Returning a balanced
  // zero trial balance would make missing evidence look like a 0/0 audit.
  if(journals.length===0)
    fail('Empty journal history cannot substantiate opening balances.');
  const digits=controls.currencyMinorDigits;
  const mapping=[controls.inventoryAssetAccountId,controls.supplierPayableAccountId,
    controls.salesCogsAccountId,controls.inventoryAllowanceAccountId,
    controls.impairmentExpenseAccountId];
  const nets=new Map(mapping.map(id=>[id,0n]));
  const ids=new Set<string>(),sources=new Set<string>();
  let previousDate='';
  for(const j of journals){
    if(!required(j.id)||!required(j.sourceMovementId)
      ||!strictDate(j.effectiveDate)||j.effectiveDate>controls.asOfDate
      ||j.effectiveDate<previousDate)fail('Journal identity, complete chronological date and as-of cutoff must be exact.');
    previousDate=j.effectiveDate;
    if(j.workspaceId!==controls.workspaceId||j.branchId!==controls.branchId
      ||j.currency!==controls.functionalCurrency)
      fail('Cross-company, branch or currency journals cannot enter a scoped trial balance.');
    // One physical movement/estimate must never produce two journals by
    // relabelling its sourceKind. Source IDs are globally unique within this
    // isolated per-company/branch preview, not merely per account mapping.
    if(ids.has(j.id)||sources.has(j.sourceMovementId))
      fail('Repeated journal or source movement would duplicate a posting.');
    ids.add(j.id);sources.add(j.sourceMovementId);
    const expected=journalMap(controls,j.sourceKind);
    if(j.lines.length!==2)fail('Only one exact debit and one exact credit per supported stock event.');
    let debit:bigint|undefined,credit:bigint|undefined;
    for(const line of j.lines){
      if(line.direction==='debit'&&line.accountId===expected.debit&&debit===undefined)
        debit=positiveAmount(line.amount,digits);
      else if(line.direction==='credit'&&line.accountId===expected.credit&&credit===undefined)
        credit=positiveAmount(line.amount,digits);
      else fail('Journal debit/credit account, direction or uniqueness is invalid.');
    }
    if(debit===undefined||credit===undefined||debit!==credit)
      fail('Journal must have exactly balanced, source-specific debit and credit amounts.');
    nets.set(expected.debit,nets.get(expected.debit)!+debit);
    nets.set(expected.credit,nets.get(expected.credit)!-credit);
    const gross=nets.get(controls.inventoryAssetAccountId)!;
    const allowance=-nets.get(controls.inventoryAllowanceAccountId)!;
    if(gross<0n||allowance<0n||allowance>gross)
      fail('Source history would create negative inventory or an allowance exceeding gross cost.');
  }
  let trialDebits=0n,trialCredits=0n;
  const trialBalance=[...nets.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([accountId,net])=>{
    const debit=net>0n?net:0n,credit=net<0n?-net:0n;
    trialDebits+=debit;trialCredits+=credit;
    return{accountId,debitBalance:fixed(debit,digits),creditBalance:fixed(credit,digits)};
  });
  if(trialDebits!==trialCredits)fail('Unbalanced resulting trial balance.');
  const gross=nets.get(controls.inventoryAssetAccountId)!;
  const allowance=-nets.get(controls.inventoryAllowanceAccountId)!;
  return {
    scope:{workspaceId:controls.workspaceId,branchId:controls.branchId,
      currency:controls.functionalCurrency,asOfDate:controls.asOfDate},
    sourceJournalCount:journals.length,trialBalance,
    totalDebitBalances:fixed(trialDebits,digits),totalCreditBalances:fixed(trialCredits,digits),
    grossInventoryAsset:fixed(gross,digits),inventoryAllowance:fixed(allowance,digits),
    netInventoryAsset:fixed(gross-allowance,digits),
    salesCogsExpense:fixed(nets.get(controls.salesCogsAccountId)!,digits),
    impairmentExpenseNet:fixed(nets.get(controls.impairmentExpenseAccountId)!,digits),
    sourceAuthenticated:false,approvalsAuthenticated:false,
    periodAuthorityVerified:false,trustedPostingCommitted:false,
    independentTrialBalanceVerified:false,productionReady:false
  };
}
/** Only rehearses an append. A caller supplied date is NOT trusted period authority. */
export function previewAppendFinanceInventoryJournal(
  controls:FinanceGlControls,
  journals:readonly FinanceGlJournal[],
  proposed:FinanceGlJournal,
  closedThrough:string
):FinanceGlTrialBalancePreview{
  if(!strictDate(closedThrough))fail('A structurally valid close date is required.');
  if(proposed.effectiveDate<=closedThrough)
    fail('Proposed journal cannot enter a closed period without independently authorized reopen.');
  return previewFinanceInventoryTrialBalance(controls,[...journals,proposed]);
}
