import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryLedgerType, TreasuryReconciliationRecord, TreasurySourceType, VaultPayload } from '../types.js';
import { assertInvoicePaymentInvariant } from './payments.js';
import { normalizeSupplierPayment } from './payables.js';
import { t } from './i18n.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

export type TreasuryProjectionSource='opening-balance'|'collection'|'supplier-payment'|'expense'|'deposit'|'withdrawal'|'transfer'|'reconciliation';
export interface TreasuryProjectionRow {
  key:string;id:string;date:string;createdAt:string;source:TreasuryProjectionSource;direction:'in'|'out'|'internal';currency:string;amount:string;
  label:string;reference:string;method:string;fromAccountId:string;toAccountId:string;reconciled:boolean;reconciledAt:string;
}

function currency(value:string,fallback='USD'):string{return value.trim().toUpperCase()||fallback;}
function positive(value:string):boolean{return isNonNegativeDecimalInput(value)&&decimalToScaled(value,2)>0n;}
function moneyString(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}

export function assertTreasuryAccount(account:TreasuryAccountRecord):void{
  if(!account.id||!account.label.trim())throw new Error('Treasury account label is required.');
  if(account.kind!=='cash'&&account.kind!=='bank')throw new Error('Treasury account type is invalid.');
  if(!/^[A-Z]{3}$/.test(currency(account.currency)))throw new Error('Treasury account currency must be a three-letter currency code.');
  if(!account.workspaceId||!account.branchId)throw new Error('Treasury account scope is missing.');
}

export function createTreasuryAccount(input:{label:string;kind:'cash'|'bank';currency:string;bankAccountId?:string;workspaceId:string;branchId:string}):TreasuryAccountRecord{
  const now=new Date().toISOString();
  const account:TreasuryAccountRecord={id:makeId('treasury-account'),label:input.label.trim(),kind:input.kind,currency:currency(input.currency),bankAccountId:input.bankAccountId||'',active:true,workspaceId:input.workspaceId,branchId:input.branchId,createdAt:now,updatedAt:now};
  assertTreasuryAccount(account);return account;
}

export function createTreasuryEntry(type:TreasuryLedgerType='deposit',currencyCode='USD'):TreasuryLedgerRecord{
  const now=new Date().toISOString();
  return{id:makeId('treasury'),workspaceId:'',branchId:'',type,date:todayIso(),currency:currency(currencyCode),amount:'',fromAccountId:'',toAccountId:'',sourceType:'manual',sourceId:'',reference:'',notes:'',reconciledAt:'',voidedAt:'',voidReason:'',createdAt:now,updatedAt:now};
}

export function validateTreasuryEntry(entry:TreasuryLedgerRecord,accounts:TreasuryAccountRecord[]=[]):string[]{
  const errors:string[]=[];
  if(!['opening-balance','deposit','withdrawal','transfer','collection','supplier-payment','reconciliation'].includes(entry.type))errors.push('Treasury entry type is invalid.');
  if(!isIsoDate(entry.date))errors.push('Treasury date is invalid.');
  if(!/^[A-Z]{3}$/.test(currency(entry.currency)))errors.push('Treasury currency must be a three-letter currency code.');
  if(!positive(entry.amount))errors.push('Treasury amount must be greater than zero.');
  if(!entry.workspaceId||!entry.branchId)errors.push('Treasury entry scope is missing.');
  const from=entry.fromAccountId?accounts.find(item=>item.id===entry.fromAccountId):undefined;
  const to=entry.toAccountId?accounts.find(item=>item.id===entry.toAccountId):undefined;
  if(accounts.length&&entry.fromAccountId&&!from)errors.push('Treasury source account was not found.');
  if(accounts.length&&entry.toAccountId&&!to)errors.push('Treasury destination account was not found.');
  if(from&&currency(from.currency)!==currency(entry.currency))errors.push('Treasury source account currency does not match the entry.');
  if(to&&currency(to.currency)!==currency(entry.currency))errors.push('Treasury destination account currency does not match the entry.');
  if(from&&(from.workspaceId!==entry.workspaceId||from.branchId!==entry.branchId))errors.push('Treasury source account scope does not match the entry.');
  if(to&&(to.workspaceId!==entry.workspaceId||to.branchId!==entry.branchId))errors.push('Treasury destination account scope does not match the entry.');
  if(entry.type==='transfer'){
    if(!entry.fromAccountId||!entry.toAccountId||entry.fromAccountId===entry.toAccountId)errors.push('Transfer requires two different treasury accounts.');
    if(from&&to&&currency(from.currency)!==currency(to.currency))errors.push('Transfer accounts must use the same currency.');
  }else if(entry.type==='deposit'||entry.type==='collection'){
    if(entry.fromAccountId||!entry.toAccountId)errors.push('This treasury entry must credit one destination account.');
  }else if(entry.type==='withdrawal'||entry.type==='supplier-payment'){
    if(!entry.fromAccountId||entry.toAccountId)errors.push('This treasury entry must debit one source account.');
  }else if(entry.type==='opening-balance'||entry.type==='reconciliation'){
    if(Boolean(entry.fromAccountId)===Boolean(entry.toAccountId))errors.push('This treasury entry must adjust exactly one account.');
  }
  if(entry.type==='collection'&&(!entry.sourceId||entry.sourceType!=='customer-payment'))errors.push('Collection must link to a customer payment.');
  if(entry.type==='supplier-payment'&&(!entry.sourceId||entry.sourceType!=='supplier-payment'))errors.push('Supplier payment must link to a supplier payment record.');
  if(entry.type!=='collection'&&entry.type!=='supplier-payment'&&(entry.sourceType!=='manual'||Boolean(entry.sourceId)))errors.push('Manual treasury entries cannot claim a payment source.');
  return errors;
}
export function assertTreasuryEntry(entry:TreasuryLedgerRecord,accounts:TreasuryAccountRecord[]=[]):void{const errors=validateTreasuryEntry(entry,accounts);if(errors.length)throw new Error(errors[0]);}

// Validate against the newest scoped Vault inside its existing encrypted write
// queue. A rendered payment/account snapshot is never posting authority.
export function appendTreasuryEntry(vault:VaultPayload,entry:TreasuryLedgerRecord):VaultPayload{
  function fail(en:string,ar:string):never{throw new Error(t(en,ar));}
  if(!entry.id||vault.treasuryEntries.some(item=>item.id===entry.id))fail('Treasury entry already exists.','قيد الخزينة موجود بالفعل.');
  if(entry.voidedAt||entry.reconciledAt)fail('New treasury entries must be active and unreconciled.','يجب أن يكون القيد الجديد ساريًا وغير مطابق.');
  if(entry.workspaceId!==vault.appSettings.activeWorkspaceId||entry.branchId!==vault.appSettings.activeBranchId)fail('Workspace changed. Reopen the treasury form.','تغيرت مساحة العمل. افتح نموذج الخزينة من جديد.');
  const inScope=(item:{workspaceId?:string;branchId?:string})=>(item.workspaceId||'default')===entry.workspaceId&&(item.branchId||'main')===entry.branchId;
  for(const id of [entry.fromAccountId,entry.toAccountId].filter(Boolean)){
    const matches=vault.treasuryAccounts.filter(item=>item.id===id);
    if(matches.length!==1||!matches[0]?.active||!inScope(matches[0]))fail('Treasury account changed or is unavailable. Choose an active account again.','تغير حساب الخزينة أو لم يعد متاحًا. اختر حسابًا ساريًا من جديد.');
  }
  if(!/^[A-Z]{3}$/.test(entry.currency.trim().toUpperCase()))fail('Treasury currency is required.','عملة الخزينة مطلوبة.');
  assertTreasuryEntry(entry,vault.treasuryAccounts);
  if(entry.sourceType!=='manual'){
    if(treasuryLinkedSourceUsed(vault.treasuryEntries,entry.sourceType,entry.sourceId))fail('This payment is already allocated to treasury.','تم تخصيص هذه الدفعة مسبقًا للخزينة.');
    const matches=entry.sourceType==='customer-payment'?vault.payments.filter(item=>item.id===entry.sourceId):vault.supplierPayments.filter(item=>item.id===entry.sourceId);
    const source=matches[0];
    if(entry.sourceType==='supplier-payment'&&(source as SupplierPaymentRecord|undefined)?.voidedAt)fail('Voided supplier payments cannot be allocated to cash or bank.','لا يمكن تخصيص دفعة مورد ملغاة للخزينة.');
    if(matches.length!==1||!source||!inScope(source))fail('The linked payment is unavailable. Choose a payment again.','الدفعة المرتبطة غير متاحة. اختر الدفعة من جديد.');
    if(!positive(source.amount)||source.currency.trim().toUpperCase()!==entry.currency.trim().toUpperCase()||decimalToScaled(source.amount,2)!==decimalToScaled(entry.amount,2))fail('The payment amount or currency changed. Select it again and review before saving.','تغير مبلغ الدفعة أو عملتها. اخترها من جديد وراجعها قبل الحفظ.');
    if(entry.sourceType==='customer-payment'){
      const payment=vault.payments.find(item=>item.id===entry.sourceId)!;
      const invoice=vault.documents.find(item=>item.id===payment.invoiceId);
      if(!invoice||!inScope(invoice))fail('The payment invoice is unavailable.','فاتورة الدفعة غير متاحة.');
      assertInvoicePaymentInvariant(invoice,vault.payments,vault.documents);
    }else{
      const payment=vault.supplierPayments.find(item=>item.id===entry.sourceId)!;
      const purchase=vault.purchases.find(item=>item.id===payment.purchaseId);
      if(!purchase||!inScope(purchase))fail('The payment purchase is unavailable.','مستند شراء الدفعة غير متاح.');
      normalizeSupplierPayment(purchase,vault.suppliers.find(item=>item.id===payment.supplierId)??null,vault.supplierPayments,payment);
    }
  }
  return{...vault,treasuryEntries:[...vault.treasuryEntries,entry]};
}

export function treasuryLinkedSourceUsed(entries:TreasuryLedgerRecord[],sourceType:TreasurySourceType,sourceId:string,ignoreId=''):boolean{
  return entries.some(entry=>entry.id!==ignoreId&&!entry.voidedAt&&entry.sourceType===sourceType&&entry.sourceId===sourceId);
}
export function voidTreasuryEntry(entry:TreasuryLedgerRecord,reason:string):TreasuryLedgerRecord{const clean=reason.trim();if(!clean)throw new Error('Enter a reason before voiding this treasury entry.');if(entry.voidedAt)throw new Error('Treasury entry is already voided.');const now=new Date().toISOString();return{...entry,voidedAt:now,voidReason:clean,updatedAt:now};}
export function markTreasuryEntryReconciled(entry:TreasuryLedgerRecord,reconciled:boolean):TreasuryLedgerRecord{if(entry.voidedAt)throw new Error('A voided treasury entry cannot be reconciled.');const now=new Date().toISOString();return{...entry,reconciledAt:reconciled?now:'',updatedAt:now};}
export function treasuryAccountBalanceScaled(accountId:string,entries:TreasuryLedgerRecord[],asOf=''):bigint{let total=0n;for(const entry of entries){if(asOf){if(entry.date>asOf||(entry.createdAt&&entry.createdAt.slice(0,10)>asOf)||(entry.voidedAt&&entry.voidedAt.slice(0,10)<=asOf))continue;}else if(entry.voidedAt)continue;const amount=decimalToScaled(entry.amount,2);if(entry.toAccountId===accountId)total+=amount;if(entry.fromAccountId===accountId)total-=amount;}return total;}
export function treasuryAccountBalance(accountId:string,entries:TreasuryLedgerRecord[],asOf=''):string{return moneyString(treasuryAccountBalanceScaled(accountId,entries,asOf));}

export function createTreasuryReconciliation(movementKey:string,note=''):TreasuryReconciliationRecord{const now=new Date().toISOString();if(!movementKey.trim())throw new Error('Treasury movement key is required.');return{id:makeId('reconcile'),workspaceId:'',branchId:'',movementKey:movementKey.trim(),reconciledAt:now,note:note.trim(),createdAt:now,updatedAt:now};}

export function treasuryProjection(payments:PaymentRecord[],supplierPayments:SupplierPaymentRecord[],expenses:ExpenseRecord[],entries:TreasuryLedgerRecord[],reconciliations:TreasuryReconciliationRecord[],defaultCurrency='USD',asOf=''):TreasuryProjectionRow[]{
  const active=entries.filter(entry=>asOf?entry.date<=asOf&&(!entry.createdAt||entry.createdAt.slice(0,10)<=asOf)&&(!entry.voidedAt||entry.voidedAt.slice(0,10)>asOf):!entry.voidedAt),customerLinks=new Set(active.filter(entry=>entry.sourceType==='customer-payment').map(entry=>entry.sourceId)),supplierLinks=new Set(active.filter(entry=>entry.sourceType==='supplier-payment').map(entry=>entry.sourceId)),reconciled=new Map(reconciliations.map(item=>[item.movementKey,item])),rows:TreasuryProjectionRow[]=[];
  const attach=(row:Omit<TreasuryProjectionRow,'reconciled'|'reconciledAt'>,entry?:TreasuryLedgerRecord)=>{const rec=reconciled.get(row.key);const entryReconciledAt=entry?.reconciledAt||'',recordReconciledAt=rec?.reconciledAt||'';const entryVisible=entryReconciledAt&&(!asOf||entryReconciledAt.slice(0,10)<=asOf),recordVisible=recordReconciledAt&&(!asOf||recordReconciledAt.slice(0,10)<=asOf);rows.push({...row,reconciled:Boolean(entryVisible||recordVisible),reconciledAt:entryVisible?entryReconciledAt:recordVisible?recordReconciledAt:''});};
  for(const item of payments){if(customerLinks.has(item.id))continue;attach({key:`collection:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'collection',direction:'in',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.customerNameEn||item.customerNameAr||item.invoiceNumber,reference:item.reference||item.invoiceNumber,method:item.method,fromAccountId:'',toAccountId:''});}
  for(const item of supplierPayments){if(asOf?(item.date>asOf||(item.createdAt&&item.createdAt.slice(0,10)>asOf)||(item.voidedAt&&item.voidedAt.slice(0,10)<=asOf)):(Boolean(item.voidedAt)))continue;if(supplierLinks.has(item.id))continue;attach({key:`supplier-payment:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'supplier-payment',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.supplierNameEn||item.supplierNameAr||item.purchaseNumber,reference:item.reference||item.purchaseNumber,method:item.method,fromAccountId:'',toAccountId:''});}
  for(const item of expenses)attach({key:`expense:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'expense',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.description||item.category||'Expense',reference:item.reference,method:'other',fromAccountId:'',toAccountId:''});
  for(const entry of active){const direction:TreasureDirection=entry.fromAccountId&&entry.toAccountId?'internal':entry.toAccountId?'in':'out';let label=entry.notes||entry.reference||entry.type;if(entry.sourceType==='customer-payment'){const item=payments.find(p=>p.id===entry.sourceId);label=item?.customerNameEn||item?.customerNameAr||item?.invoiceNumber||label;}else if(entry.sourceType==='supplier-payment'){const item=supplierPayments.find(p=>p.id===entry.sourceId);label=item?.supplierNameEn||item?.supplierNameAr||item?.purchaseNumber||label;}attach({key:`treasury:${entry.id}`,id:entry.id,date:entry.date,createdAt:entry.createdAt,source:entry.type,direction,currency:currency(entry.currency,defaultCurrency),amount:entry.amount,label,reference:entry.reference,method:'ledger',fromAccountId:entry.fromAccountId,toAccountId:entry.toAccountId},entry);}
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||a.key.localeCompare(b.key));
}
type TreasureDirection='in'|'out'|'internal';

export function treasuryTotals(rows:TreasuryProjectionRow[],currencyCode:string):{inflow:string;outflow:string;net:string;internalTransfers:string;reconciled:number;unreconciled:number}{
  const code=currency(currencyCode),selected=rows.filter(row=>row.currency===code);let inflow=0n,outflow=0n,internal=0n;
  for(const row of selected){if(row.source==='opening-balance')continue;const amount=decimalToScaled(row.amount,2);if(row.direction==='in')inflow+=amount;else if(row.direction==='out')outflow+=amount;else internal+=amount;}
  return{inflow:moneyString(inflow),outflow:moneyString(outflow),net:moneyString(inflow-outflow),internalTransfers:moneyString(internal),reconciled:selected.filter(row=>row.reconciled).length,unreconciled:selected.filter(row=>!row.reconciled).length};
}