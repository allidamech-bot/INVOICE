import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryLedgerRecord, TreasuryReconciliationRecord } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

export type TreasuryProjectionSource='collection'|'supplier-payment'|'expense'|'deposit'|'withdrawal'|'transfer';
export interface TreasuryProjectionRow {
  key:string;id:string;date:string;createdAt:string;source:TreasuryProjectionSource;direction:'in'|'out'|'internal';currency:string;amount:string;
  label:string;reference:string;method:string;fromAccountId:string;toAccountId:string;reconciled:boolean;reconciledAt:string;
}

function currency(value:string,fallback='USD'):string{return value.trim().toUpperCase()||fallback;}
function amountIsPositive(value:string):boolean{return isNonNegativeDecimalInput(value)&&decimalToScaled(value,2)>0n;}

export function createTreasuryEntry(type:TreasuryLedgerRecord['type'],currencyCode='USD'):TreasuryLedgerRecord{
  const now=new Date().toISOString();
  return{id:makeId('treasury'),workspaceId:'',branchId:'',type,date:todayIso(),currency:currency(currencyCode),amount:'',fromAccountId:'',toAccountId:'',reference:'',notes:'',createdAt:now,updatedAt:now};
}

export function validateTreasuryEntry(entry:TreasuryLedgerRecord):string[]{
  const errors:string[]=[];
  if(!['deposit','withdrawal','transfer'].includes(entry.type))errors.push('Treasury entry type is invalid.');
  if(!isIsoDate(entry.date))errors.push('Treasury date is invalid.');
  if(!entry.currency.trim())errors.push('Treasury currency is required.');
  if(!amountIsPositive(entry.amount))errors.push('Treasury amount must be greater than zero.');
  if(entry.type==='deposit'&&!entry.toAccountId.trim())errors.push('Deposit destination account is required.');
  if(entry.type==='withdrawal'&&!entry.fromAccountId.trim())errors.push('Withdrawal source account is required.');
  if(entry.type==='transfer'){
    if(!entry.fromAccountId.trim()||!entry.toAccountId.trim())errors.push('Transfer source and destination accounts are required.');
    if(entry.fromAccountId.trim()&&entry.fromAccountId===entry.toAccountId)errors.push('Transfer source and destination must be different.');
  }
  return errors;
}

export function assertTreasuryEntry(entry:TreasuryLedgerRecord):void{const errors=validateTreasuryEntry(entry);if(errors.length)throw new Error(errors[0]);}

export function createTreasuryReconciliation(movementKey:string,note=''):TreasuryReconciliationRecord{
  const now=new Date().toISOString();
  if(!movementKey.trim())throw new Error('Treasury movement key is required.');
  return{id:makeId('reconcile'),workspaceId:'',branchId:'',movementKey:movementKey.trim(),reconciledAt:now,note:note.trim(),createdAt:now,updatedAt:now};
}

export function treasuryProjection(
  payments:PaymentRecord[],supplierPayments:SupplierPaymentRecord[],expenses:ExpenseRecord[],entries:TreasuryLedgerRecord[],reconciliations:TreasuryReconciliationRecord[],defaultCurrency='USD'
):TreasuryProjectionRow[]{
  const reconciled=new Map(reconciliations.map(item=>[item.movementKey,item]));
  const rows:TreasuryProjectionRow[]=[];
  const attach=(row:Omit<TreasuryProjectionRow,'reconciled'|'reconciledAt'>)=>{const rec=reconciled.get(row.key);rows.push({...row,reconciled:Boolean(rec),reconciledAt:rec?.reconciledAt||''});};
  for(const item of payments)attach({key:`collection:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'collection',direction:'in',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.customerNameEn||item.customerNameAr||item.invoiceNumber,reference:item.reference||item.invoiceNumber,method:item.method,fromAccountId:'',toAccountId:''});
  for(const item of supplierPayments)attach({key:`supplier-payment:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'supplier-payment',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.supplierNameEn||item.supplierNameAr||item.purchaseNumber,reference:item.reference||item.purchaseNumber,method:item.method,fromAccountId:'',toAccountId:''});
  for(const item of expenses)attach({key:`expense:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'expense',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.description||item.category||'Expense',reference:item.reference,method:'other',fromAccountId:'',toAccountId:''});
  for(const item of entries){
    const direction=item.type==='deposit'?'in':item.type==='withdrawal'?'out':'internal';
    attach({key:`treasury:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:item.type,direction,currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.notes||item.reference||item.type,reference:item.reference,method:'ledger',fromAccountId:item.fromAccountId,toAccountId:item.toAccountId});
  }
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||a.key.localeCompare(b.key));
}

export function treasuryTotals(rows:TreasuryProjectionRow[],currencyCode:string):{inflow:string;outflow:string;net:string;internalTransfers:string;reconciled:number;unreconciled:number}{
  const code=currency(currencyCode),selected=rows.filter(row=>row.currency===code);let inflow=0n,outflow=0n,internal=0n;
  for(const row of selected){const amount=decimalToScaled(row.amount,2);if(row.direction==='in')inflow+=amount;else if(row.direction==='out')outflow+=amount;else internal+=amount;}
  const fixed=(value:bigint)=>{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;};
  return{inflow:fixed(inflow),outflow:fixed(outflow),net:fixed(inflow-outflow),internalTransfers:fixed(internal),reconciled:selected.filter(row=>row.reconciled).length,unreconciled:selected.filter(row=>!row.reconciled).length};
}
