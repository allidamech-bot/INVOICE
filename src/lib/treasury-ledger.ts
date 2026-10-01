import type { TreasuryAccountRecord, TreasuryLedgerEntry, TreasuryEntryType } from '../types.js';
import { isIsoDate, makeId } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

const CREDIT_TYPES=new Set<TreasuryEntryType>(['opening-balance','deposit','collection']);
const DEBIT_TYPES=new Set<TreasuryEntryType>(['withdrawal','supplier-payment']);

export function treasuryMoneyScaled(value:string):bigint{return decimalToScaled(value,2);}
export function treasuryMoneyString(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
export function cleanTreasuryCurrency(value:string):string{return value.trim().toUpperCase();}

export function assertTreasuryAccount(account:TreasuryAccountRecord):void{
  if(!account.id||!account.label.trim())throw new Error('Treasury account label is required.');
  if(account.kind!=='cash'&&account.kind!=='bank')throw new Error('Treasury account type is invalid.');
  if(!/^[A-Z]{3}$/.test(cleanTreasuryCurrency(account.currency)))throw new Error('Treasury account currency must be a three-letter currency code.');
  if(!account.workspaceId||!account.branchId)throw new Error('Treasury account scope is missing.');
}

export function assertTreasuryEntry(entry:TreasuryLedgerEntry,accounts:TreasuryAccountRecord[]):void{
  if(!entry.id||!isIsoDate(entry.date))throw new Error('Treasury entry date is invalid.');
  if(!isNonNegativeDecimalInput(entry.amount)||treasuryMoneyScaled(entry.amount)<=0n)throw new Error('Treasury amount must be greater than zero.');
  const currency=cleanTreasuryCurrency(entry.currency);if(!/^[A-Z]{3}$/.test(currency))throw new Error('Treasury currency is invalid.');
  const from=entry.fromAccountId?accounts.find(item=>item.id===entry.fromAccountId):undefined;
  const to=entry.toAccountId?accounts.find(item=>item.id===entry.toAccountId):undefined;
  if(entry.fromAccountId&&!from)throw new Error('Treasury source account was not found.');
  if(entry.toAccountId&&!to)throw new Error('Treasury destination account was not found.');
  if(from&&cleanTreasuryCurrency(from.currency)!==currency)throw new Error('Treasury source account currency does not match the entry.');
  if(to&&cleanTreasuryCurrency(to.currency)!==currency)throw new Error('Treasury destination account currency does not match the entry.');
  if(entry.type==='transfer'){
    if(!from||!to||from.id===to.id)throw new Error('Transfer requires two different treasury accounts.');
  }else if(CREDIT_TYPES.has(entry.type)){
    if(from||!to)throw new Error('This treasury entry must credit one destination account.');
  }else if(DEBIT_TYPES.has(entry.type)){
    if(!from||to)throw new Error('This treasury entry must debit one source account.');
  }else if(entry.type==='reconciliation'){
    if(Boolean(from)===Boolean(to))throw new Error('Reconciliation must adjust exactly one treasury account.');
  }
  if(entry.type==='collection'&&(!entry.sourceId||entry.sourceType!=='customer-payment'))throw new Error('Collection must link to a customer payment.');
  if(entry.type==='supplier-payment'&&(!entry.sourceId||entry.sourceType!=='supplier-payment'))throw new Error('Supplier payment must link to a supplier payment record.');
}

export function treasuryAccountBalanceScaled(accountId:string,entries:TreasuryLedgerEntry[]):bigint{
  let balance=0n;
  for(const entry of entries){
    if(entry.voidedAt)continue;
    const amount=treasuryMoneyScaled(entry.amount);
    if(entry.toAccountId===accountId)balance+=amount;
    if(entry.fromAccountId===accountId)balance-=amount;
  }
  return balance;
}
export function treasuryAccountBalance(accountId:string,entries:TreasuryLedgerEntry[]):string{return treasuryMoneyString(treasuryAccountBalanceScaled(accountId,entries));}

export function treasuryLinkedSourceUsed(entries:TreasuryLedgerEntry[],sourceType:TreasuryLedgerEntry['sourceType'],sourceId:string,ignoreId=''):boolean{
  return entries.some(entry=>entry.id!==ignoreId&&!entry.voidedAt&&entry.sourceType===sourceType&&entry.sourceId===sourceId);
}

export function createTreasuryAccount(input:{label:string;kind:'cash'|'bank';currency:string;bankAccountId?:string;workspaceId:string;branchId:string}):TreasuryAccountRecord{
  const now=new Date().toISOString();const account:TreasuryAccountRecord={id:makeId('treasury-account'),label:input.label.trim(),kind:input.kind,currency:cleanTreasuryCurrency(input.currency),bankAccountId:input.bankAccountId||'',active:true,workspaceId:input.workspaceId,branchId:input.branchId,createdAt:now,updatedAt:now};assertTreasuryAccount(account);return account;
}

export function createTreasuryEntry(input:{type:TreasuryEntryType;date:string;amount:string;currency:string;fromAccountId?:string;toAccountId?:string;sourceType?:TreasuryLedgerEntry['sourceType'];sourceId?:string;reference?:string;notes?:string;workspaceId:string;branchId:string},accounts:TreasuryAccountRecord[]):TreasuryLedgerEntry{
  const now=new Date().toISOString();const entry:TreasuryLedgerEntry={id:makeId('treasury-entry'),type:input.type,date:input.date,amount:treasuryMoneyString(treasuryMoneyScaled(input.amount)),currency:cleanTreasuryCurrency(input.currency),fromAccountId:input.fromAccountId||'',toAccountId:input.toAccountId||'',sourceType:input.sourceType||'manual',sourceId:input.sourceId||'',reference:(input.reference||'').trim(),notes:(input.notes||'').trim(),reconciledAt:'',voidedAt:'',voidReason:'',workspaceId:input.workspaceId,branchId:input.branchId,createdAt:now,updatedAt:now};assertTreasuryEntry(entry,accounts);return entry;
}

export function voidTreasuryEntry(entry:TreasuryLedgerEntry,reason:string):TreasuryLedgerEntry{
  const clean=reason.trim();if(!clean)throw new Error('Enter a reason before voiding this treasury entry.');if(entry.voidedAt)throw new Error('Treasury entry is already voided.');const now=new Date().toISOString();return{...entry,voidedAt:now,voidReason:clean,updatedAt:now};
}

export function markTreasuryEntryReconciled(entry:TreasuryLedgerEntry,reconciled:boolean):TreasuryLedgerEntry{
  if(entry.voidedAt)throw new Error('A voided treasury entry cannot be reconciled.');return{...entry,reconciledAt:reconciled?new Date().toISOString():'',updatedAt:new Date().toISOString()};
}
