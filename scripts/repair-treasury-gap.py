from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]

def read(path): return (ROOT/path).read_text(encoding='utf-8')
def write(path,text): (ROOT/path).write_text(text,encoding='utf-8')
def replace_once(text,old,new,label):
    if old not in text: raise SystemExit(f'missing replacement anchor: {label}')
    if text.count(old)!=1: raise SystemExit(f'non-unique replacement anchor: {label} ({text.count(old)})')
    return text.replace(old,new,1)
def regex_once(text,pattern,repl,label,flags=0):
    next_text,count=re.subn(pattern,repl,text,count=1,flags=flags)
    if count!=1: raise SystemExit(f'regex replacement failed: {label} ({count})')
    return next_text

# ---------------------------------------------------------------------------
# Types: real financial accounts + immutable ledger metadata.
# ---------------------------------------------------------------------------
p=Path('src/types.ts'); text=read(p)
text=replace_once(text,
"export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\n",
"export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';\nexport type TreasuryAccountKind = 'cash' | 'bank';\nexport type TreasuryLedgerType = 'opening-balance' | 'deposit' | 'withdrawal' | 'transfer' | 'collection' | 'supplier-payment' | 'reconciliation';\nexport type TreasurySourceType = 'manual' | 'customer-payment' | 'supplier-payment';\n",
'add treasury aliases')
old="""export type TreasuryLedgerType = 'deposit' | 'withdrawal' | 'transfer';
export interface TreasuryLedgerRecord extends WorkspaceScopeFields {
  id:string;type:TreasuryLedgerType;date:string;currency:string;amount:string;fromAccountId:string;toAccountId:string;reference:string;notes:string;createdAt:string;updatedAt:string;
}
export interface TreasuryReconciliationRecord extends WorkspaceScopeFields {
  id:string;movementKey:string;reconciledAt:string;note:string;createdAt:string;updatedAt:string;
}
"""
new="""export interface TreasuryAccountRecord extends WorkspaceScopeFields {
  id:string;label:string;kind:TreasuryAccountKind;currency:string;bankAccountId:string;active:boolean;createdAt:string;updatedAt:string;
}
export interface TreasuryLedgerRecord extends WorkspaceScopeFields {
  id:string;type:TreasuryLedgerType;date:string;currency:string;amount:string;fromAccountId:string;toAccountId:string;sourceType:TreasurySourceType;sourceId:string;reference:string;notes:string;reconciledAt:string;voidedAt:string;voidReason:string;createdAt:string;updatedAt:string;
}
export interface TreasuryReconciliationRecord extends WorkspaceScopeFields {
  id:string;movementKey:string;reconciledAt:string;note:string;createdAt:string;updatedAt:string;
}
"""
text=replace_once(text,old,new,'replace treasury interfaces')
text=replace_once(text,
"  inventoryMovements: InventoryMovementRecord[];\n  treasuryEntries: TreasuryLedgerRecord[];",
"  inventoryMovements: InventoryMovementRecord[];\n  treasuryAccounts: TreasuryAccountRecord[];\n  treasuryEntries: TreasuryLedgerRecord[];",
'vault treasury accounts')
write(p,text)

# ---------------------------------------------------------------------------
# Defaults/workspace scope.
# ---------------------------------------------------------------------------
p=Path('src/lib/defaults.ts'); text=read(p)
text=replace_once(text,
"inventoryMovements: [], treasuryEntries: [], treasuryReconciliations: [], fxRates: [],",
"inventoryMovements: [], treasuryAccounts: [], treasuryEntries: [], treasuryReconciliations: [], fxRates: [],",
'empty vault treasury accounts')
write(p,text)

p=Path('src/lib/workspaces.ts'); text=read(p)
text=replace_once(text,
"'inventoryMovements','treasuryEntries','treasuryReconciliations','warehouses'",
"'inventoryMovements','treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses'",
'branch scoped treasury accounts')
write(p,text)

# ---------------------------------------------------------------------------
# Vault v21 migration: retain legacy entries and synthesize explicit account
# definitions only when an existing ledger entry already references metadata.
# ---------------------------------------------------------------------------
p=Path('src/storage/vault.ts'); text=read(p)
pattern=r"  migrated\.treasuryEntries=Array\.isArray\(\(vault as any\)\.treasuryEntries\).*?\n  migrated\.treasuryReconciliations="
replacement="""  migrated.treasuryAccounts=Array.isArray((vault as any).treasuryAccounts)?(vault as any).treasuryAccounts.map((account:any)=>({id:stringValue(account?.id),workspaceId:stringValue(account?.workspaceId,'default')||'default',branchId:stringValue(account?.branchId,'main')||'main',label:stringValue(account?.label,'Treasury Account'),kind:account?.kind==='cash'?'cash':'bank',currency:cleanCurrency(account?.currency,migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:stringValue(account?.bankAccountId),active:booleanValue(account?.active,true),createdAt:stringValue(account?.createdAt,nowIso()),updatedAt:stringValue(account?.updatedAt,account?.createdAt?stringValue(account.createdAt):nowIso())})).filter((account:any)=>account.id):[];
  migrated.treasuryEntries=Array.isArray((vault as any).treasuryEntries)?(vault as any).treasuryEntries.map((entry:any)=>({id:stringValue(entry?.id),workspaceId:stringValue(entry?.workspaceId,'default')||'default',branchId:stringValue(entry?.branchId,'main')||'main',type:['opening-balance','deposit','withdrawal','transfer','collection','supplier-payment','reconciliation'].includes(entry?.type)?entry.type:'deposit',date:stringValue(entry?.date),currency:cleanCurrency(entry?.currency,migrated.appSettings.smartDefaults.currency||'USD'),amount:stringValue(entry?.amount,'0.00'),fromAccountId:stringValue(entry?.fromAccountId),toAccountId:stringValue(entry?.toAccountId),sourceType:['customer-payment','supplier-payment'].includes(entry?.sourceType)?entry.sourceType:'manual',sourceId:stringValue(entry?.sourceId),reference:stringValue(entry?.reference),notes:stringValue(entry?.notes),reconciledAt:stringValue(entry?.reconciledAt),voidedAt:stringValue(entry?.voidedAt),voidReason:stringValue(entry?.voidReason),createdAt:stringValue(entry?.createdAt,nowIso()),updatedAt:stringValue(entry?.updatedAt,entry?.createdAt?stringValue(entry.createdAt):nowIso())})).filter((entry:any)=>entry.id):[];
  for(const entry of migrated.treasuryEntries){for(const accountId of [entry.fromAccountId,entry.toAccountId]){if(!accountId||migrated.treasuryAccounts.some((account:any)=>account.id===accountId&&account.workspaceId===entry.workspaceId&&account.branchId===entry.branchId))continue;const metadata=accountId==='primary'?migrated.company.bank:(migrated.company.bankAccounts||[]).find((account:any)=>account.id===accountId);migrated.treasuryAccounts.push({id:accountId,workspaceId:entry.workspaceId||'default',branchId:entry.branchId||'main',label:stringValue((metadata as any)?.label,(metadata as any)?.bankName||accountId),kind:'bank',currency:cleanCurrency((metadata as any)?.currency,entry.currency||migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:accountId,active:true,createdAt:entry.createdAt||nowIso(),updatedAt:entry.updatedAt||entry.createdAt||nowIso()});}}
  migrated.treasuryReconciliations="""
text=regex_once(text,pattern,replacement,'vault treasury migration',re.S)
text=replace_once(text,
"'inventoryMovements','treasuryEntries','treasuryReconciliations','warehouses'",
"'inventoryMovements','treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses'",
'vault restore scope accounts')
text=replace_once(text,
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.treasuryEntries.map(m => m.id), 'treasury entry');",
"  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.treasuryAccounts.map(m => m.id), 'treasury account');\n  unique(migrated.treasuryEntries.map(m => m.id), 'treasury entry');",
'vault unique accounts')
write(p,text)

# ---------------------------------------------------------------------------
# Merge safety includes account definitions and validates entries against them.
# ---------------------------------------------------------------------------
p=Path('src/storage/vault-merge.ts'); text=read(p)
text=replace_once(text,
"import { assertTreasuryEntry } from '../lib/treasury-ledger.js';",
"import { assertTreasuryAccount, assertTreasuryEntry } from '../lib/treasury-ledger.js';",
'vault merge import')
text=replace_once(text,
"  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before saving this entry.');\n  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);\n  for(const entry of treasuryEntries)assertTreasuryEntry(entry);",
"  guardConcurrentRecordChanges(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts,'Treasury account','Reopen Cash & Bank before saving this account.');\n  const treasuryAccounts=mergeRecords(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts);\n  for(const account of treasuryAccounts)assertTreasuryAccount(account);\n  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before saving this entry.');\n  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);\n  for(const entry of treasuryEntries)assertTreasuryEntry(entry,treasuryAccounts);",
'vault merge treasury accounts')
text=replace_once(text,
"    inventoryMovements,\n    treasuryEntries,",
"    inventoryMovements,\n    treasuryAccounts,\n    treasuryEntries,",
'vault merge return accounts')
write(p,text)

# ---------------------------------------------------------------------------
# Treasury deterministic engine.
# ---------------------------------------------------------------------------
write(Path('src/lib/treasury-ledger.ts'),r'''import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryLedgerType, TreasuryReconciliationRecord, TreasurySourceType } from '../types.js';
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
  const from=entry.fromAccountId?accounts.find(item=>item.id===entry.fromAccountId):undefined;
  const to=entry.toAccountId?accounts.find(item=>item.id===entry.toAccountId):undefined;
  if(accounts.length&&entry.fromAccountId&&!from)errors.push('Treasury source account was not found.');
  if(accounts.length&&entry.toAccountId&&!to)errors.push('Treasury destination account was not found.');
  if(from&&currency(from.currency)!==currency(entry.currency))errors.push('Treasury source account currency does not match the entry.');
  if(to&&currency(to.currency)!==currency(entry.currency))errors.push('Treasury destination account currency does not match the entry.');
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
  return errors;
}
export function assertTreasuryEntry(entry:TreasuryLedgerRecord,accounts:TreasuryAccountRecord[]=[]):void{const errors=validateTreasuryEntry(entry,accounts);if(errors.length)throw new Error(errors[0]);}

export function treasuryLinkedSourceUsed(entries:TreasuryLedgerRecord[],sourceType:TreasurySourceType,sourceId:string,ignoreId=''):boolean{
  return entries.some(entry=>entry.id!==ignoreId&&!entry.voidedAt&&entry.sourceType===sourceType&&entry.sourceId===sourceId);
}
export function voidTreasuryEntry(entry:TreasuryLedgerRecord,reason:string):TreasuryLedgerRecord{const clean=reason.trim();if(!clean)throw new Error('Enter a reason before voiding this treasury entry.');if(entry.voidedAt)throw new Error('Treasury entry is already voided.');const now=new Date().toISOString();return{...entry,voidedAt:now,voidReason:clean,updatedAt:now};}
export function markTreasuryEntryReconciled(entry:TreasuryLedgerRecord,reconciled:boolean):TreasuryLedgerRecord{if(entry.voidedAt)throw new Error('A voided treasury entry cannot be reconciled.');const now=new Date().toISOString();return{...entry,reconciledAt:reconciled?now:'',updatedAt:now};}
export function treasuryAccountBalanceScaled(accountId:string,entries:TreasuryLedgerRecord[]):bigint{let total=0n;for(const entry of entries){if(entry.voidedAt)continue;const amount=decimalToScaled(entry.amount,2);if(entry.toAccountId===accountId)total+=amount;if(entry.fromAccountId===accountId)total-=amount;}return total;}
export function treasuryAccountBalance(accountId:string,entries:TreasuryLedgerRecord[]):string{return moneyString(treasuryAccountBalanceScaled(accountId,entries));}

export function createTreasuryReconciliation(movementKey:string,note=''):TreasuryReconciliationRecord{const now=new Date().toISOString();if(!movementKey.trim())throw new Error('Treasury movement key is required.');return{id:makeId('reconcile'),workspaceId:'',branchId:'',movementKey:movementKey.trim(),reconciledAt:now,note:note.trim(),createdAt:now,updatedAt:now};}

export function treasuryProjection(payments:PaymentRecord[],supplierPayments:SupplierPaymentRecord[],expenses:ExpenseRecord[],entries:TreasuryLedgerRecord[],reconciliations:TreasuryReconciliationRecord[],defaultCurrency='USD'):TreasuryProjectionRow[]{
  const active=entries.filter(entry=>!entry.voidedAt),customerLinks=new Set(active.filter(entry=>entry.sourceType==='customer-payment').map(entry=>entry.sourceId)),supplierLinks=new Set(active.filter(entry=>entry.sourceType==='supplier-payment').map(entry=>entry.sourceId)),reconciled=new Map(reconciliations.map(item=>[item.movementKey,item])),rows:TreasuryProjectionRow[]=[];
  const attach=(row:Omit<TreasuryProjectionRow,'reconciled'|'reconciledAt'>,entry?:TreasuryLedgerRecord)=>{const rec=reconciled.get(row.key);rows.push({...row,reconciled:Boolean(entry?.reconciledAt)||Boolean(rec),reconciledAt:entry?.reconciledAt||rec?.reconciledAt||''});};
  for(const item of payments){if(customerLinks.has(item.id))continue;attach({key:`collection:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'collection',direction:'in',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.customerNameEn||item.customerNameAr||item.invoiceNumber,reference:item.reference||item.invoiceNumber,method:item.method,fromAccountId:'',toAccountId:''});}
  for(const item of supplierPayments){if(supplierLinks.has(item.id))continue;attach({key:`supplier-payment:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'supplier-payment',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.supplierNameEn||item.supplierNameAr||item.purchaseNumber,reference:item.reference||item.purchaseNumber,method:item.method,fromAccountId:'',toAccountId:''});}
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
''')

# ---------------------------------------------------------------------------
# FX: retain direct API and add deterministic inverse lookup/conversion.
# ---------------------------------------------------------------------------
write(Path('src/lib/fx-rates.ts'),r'''import type { FxRateRecord } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

const RATE_DECIMALS=8;
const RATE_SCALE=100_000_000n;
function cleanCurrency(value:string):string{return value.trim().toUpperCase().replace(/[^A-Z]/g,'').slice(0,3);}
function formatScaled4(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;const raw=`${sign}${abs/10_000n}.${(abs%10_000n).toString().padStart(4,'0')}`;return raw.replace(/0+$/,'').replace(/\.$/,'.00');}
export interface FxRateMatch {rate:FxRateRecord;inverse:boolean;}

export function createFxRate(fromCurrency='USD',toCurrency='EUR'):FxRateRecord{const now=new Date().toISOString();return{id:makeId('fx'),workspaceId:'',date:todayIso(),fromCurrency:cleanCurrency(fromCurrency)||'USD',toCurrency:cleanCurrency(toCurrency)||'EUR',rate:'',sourceLabel:'',notes:'',createdAt:now,updatedAt:now};}
export function validateFxRate(rate:FxRateRecord):string[]{const errors:string[]=[];if(!isIsoDate(rate.date))errors.push('FX rate date is invalid.');const from=cleanCurrency(rate.fromCurrency),to=cleanCurrency(rate.toCurrency);if(!/^[A-Z]{3}$/.test(from)||!/^[A-Z]{3}$/.test(to))errors.push('FX currencies must be three-letter codes.');if(from===to)errors.push('FX currencies must be different.');if(!isNonNegativeDecimalInput(rate.rate)||decimalToScaled(rate.rate,RATE_DECIMALS)<=0n)errors.push('FX rate must be greater than zero.');if(!rate.sourceLabel.trim())errors.push('FX rate source is required.');return errors;}
export function assertFxRate(rate:FxRateRecord):void{const errors=validateFxRate(rate);if(errors.length)throw new Error(errors[0]);}
export function fxRateForDate(rates:FxRateRecord[],fromCurrency:string,toCurrency:string,date:string):FxRateRecord|undefined{const from=cleanCurrency(fromCurrency),to=cleanCurrency(toCurrency);if(!from||!to||from===to)return undefined;return [...rates].filter(rate=>cleanCurrency(rate.fromCurrency)===from&&cleanCurrency(rate.toCurrency)===to&&isIsoDate(rate.date)&&rate.date<=date).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt))[0];}
export function fxRateMatchForDate(rates:FxRateRecord[],fromCurrency:string,toCurrency:string,date:string):FxRateMatch|undefined{const direct=fxRateForDate(rates,fromCurrency,toCurrency,date);if(direct)return{rate:direct,inverse:false};const reverse=fxRateForDate(rates,toCurrency,fromCurrency,date);return reverse?{rate:reverse,inverse:true}:undefined;}
export function convertWithFxRate(amount:string,rate:FxRateRecord):string{assertFxRate(rate);const amountScaled=decimalToScaled(amount||'0',4),rateScaled=decimalToScaled(rate.rate,RATE_DECIMALS);return formatScaled4((amountScaled*rateScaled+RATE_SCALE/2n)/RATE_SCALE);}
export function convertWithFxMatch(amount:string,match:FxRateMatch):string{assertFxRate(match.rate);if(!match.inverse)return convertWithFxRate(amount,match.rate);const amountScaled=decimalToScaled(amount||'0',4),rateScaled=decimalToScaled(match.rate.rate,RATE_DECIMALS);return formatScaled4((amountScaled*RATE_SCALE+rateScaled/2n)/rateScaled);}
''')

# FX page uses inverse-aware match while keeping explicit provenance visible.
p=Path('src/components/FxRatesPage.tsx'); text=read(p)
text=replace_once(text,
"import { convertWithFxRate, createFxRate, fxRateForDate } from '../lib/fx-rates.js';",
"import { convertWithFxMatch, createFxRate, fxRateMatchForDate } from '../lib/fx-rates.js';",
'fx page import')
text=replace_once(text,
"  const selected=fxRateForDate(props.rates,from,to,date);const converted=selected&&amount.trim()?convertWithFxRate(amount,selected):'';",
"  const selected=fxRateMatchForDate(props.rates,from,to,date);const converted=selected&&amount.trim()?convertWithFxMatch(amount,selected):'';",
'fx page converter')
text=replace_once(text,'maxLength={8}','maxLength={3}','fx from maxlength')
text=replace_once(text,'maxLength={8}','maxLength={3}','fx to maxlength')
text=replace_once(text,
"{selected?`${selected.fromCurrency}/${selected.toCurrency} · ${selected.rate} · ${selected.sourceLabel}`:t('No saved rate available on or before this date.','لا يوجد سعر محفوظ متاح في هذا التاريخ أو قبله.')}",
"{selected?`${selected.rate.fromCurrency}/${selected.rate.toCurrency} · ${selected.rate.rate} · ${selected.rate.sourceLabel}${selected.inverse?` · ${t('inverse','عكسي')}`:''}`:t('No saved rate available on or before this date.','لا يوجد سعر محفوظ متاح في هذا التاريخ أو قبله.')}",
'fx selected provenance')
write(p,text)

# ---------------------------------------------------------------------------
# Finance workspace receives explicit ledger-account records.
# ---------------------------------------------------------------------------
p=Path('src/components/FinanceWorkspace.tsx'); text=read(p)
text=replace_once(text,
"TreasuryLedgerRecord, TreasuryReconciliationRecord",
"TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryReconciliationRecord",
'finance account import')
text=replace_once(text,
"  treasuryEntries:TreasuryLedgerRecord[];treasuryReconciliations:TreasuryReconciliationRecord[];fxRates:FxRateRecord[];",
"  treasuryAccounts:TreasuryAccountRecord[];treasuryEntries:TreasuryLedgerRecord[];treasuryReconciliations:TreasuryReconciliationRecord[];fxRates:FxRateRecord[];workspaceId:string;branchId:string;",
'finance props accounts')
text=replace_once(text,
"<TreasuryLedgerPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} treasuryEntries={props.treasuryEntries} treasuryReconciliations={props.treasuryReconciliations} company={props.company}/>",
"<TreasuryLedgerPage payments={props.payments} supplierPayments={props.supplierPayments} expenses={props.expenses} treasuryAccounts={props.treasuryAccounts} treasuryEntries={props.treasuryEntries} treasuryReconciliations={props.treasuryReconciliations} company={props.company} workspaceId={props.workspaceId} branchId={props.branchId}/>",
'finance treasury props')
write(p,text)

p=Path('src/app/App.tsx'); text=read(p)
text=replace_once(text,
"inventoryMovements:vault.inventoryMovements,treasuryEntries:vault.treasuryEntries,",
"inventoryMovements:vault.inventoryMovements,treasuryAccounts:vault.treasuryAccounts,treasuryEntries:vault.treasuryEntries,",
'app operations props accounts')
write(p,text)

# ---------------------------------------------------------------------------
# Treasury UI: explicit accounts, opening balances, source allocation,
# immutable correction-by-void, reconciliation, and mobile-safe controls.
# ---------------------------------------------------------------------------
write(Path('src/components/TreasuryLedgerPage.tsx'),r'''import type { CompanySettings, ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountKind, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryLedgerType, TreasuryReconciliationRecord } from '../types.js';
import { assertTreasuryEntry, createTreasuryAccount, createTreasuryEntry, createTreasuryReconciliation, markTreasuryEntryReconciled, treasuryAccountBalance, treasuryLinkedSourceUsed, treasuryProjection, treasuryTotals, voidTreasuryEntry } from '../lib/treasury-ledger.js';
import { formatMoney } from '../lib/money.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Input, Select, Textarea } from './UI.js';

interface Props {company:CompanySettings;payments:PaymentRecord[];supplierPayments:SupplierPaymentRecord[];expenses:ExpenseRecord[];treasuryAccounts:TreasuryAccountRecord[];treasuryEntries:TreasuryLedgerRecord[];treasuryReconciliations:TreasuryReconciliationRecord[];workspaceId:string;branchId:string;}
type ReconciliationDirection='in'|'out';
function sourceLabel(source:string):string{return source==='opening-balance'?t('Opening balance','رصيد افتتاحي'):source==='collection'?t('Collection','تحصيل'):source==='supplier-payment'?t('Supplier payment','دفعة مورد'):source==='expense'?t('Expense','مصروف'):source==='deposit'?t('Deposit','إيداع'):source==='withdrawal'?t('Withdrawal','سحب'):source==='reconciliation'?t('Adjustment','تسوية'):t('Transfer','تحويل');}
function accountLabel(account:TreasuryAccountRecord|undefined):string{return account?`${account.label} · ${account.currency}`:'—';}
function absoluteOpening(value:string):{amount:string;negative:boolean}{const clean=value.trim().replace(/,/g,'');return{amount:clean.startsWith('-')?clean.slice(1):clean,negative:clean.startsWith('-')};}

export function TreasuryLedgerPage(props:Props):any{
  const activeAccounts=props.treasuryAccounts.filter(item=>item.active),bankMetadata=[{id:'primary',label:t('Primary bank metadata','بيانات البنك الرئيسي'),currency:props.company.bank.currency||props.company.defaultCurrency},...(props.company.bankAccounts||[]).map(account=>({id:account.id,label:account.label||account.bankName||account.id,currency:account.currency}))];
  const [accountName,setAccountName]=React.useState(''),[accountKind,setAccountKind]=React.useState<TreasuryAccountKind>('bank'),[accountCurrency,setAccountCurrency]=React.useState((props.company.defaultCurrency||'USD').toUpperCase()),[bankAccountId,setBankAccountId]=React.useState(''),[openingBalance,setOpeningBalance]=React.useState('');
  const [type,setType]=React.useState<TreasuryLedgerType>('deposit'),[date,setDate]=React.useState(todayIso()),[amount,setAmount]=React.useState(''),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[sourceId,setSourceId]=React.useState(''),[reference,setReference]=React.useState(''),[notes,setNotes]=React.useState(''),[reconciliationDirection,setReconciliationDirection]=React.useState<ReconciliationDirection>('in');
  const [query,setQuery]=React.useState(''),[currencyFilter,setCurrencyFilter]=React.useState('ALL'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[voidReasons,setVoidReasons]=React.useState<Record<string,string>>({});
  const unallocatedPayments=props.payments.filter(payment=>!treasuryLinkedSourceUsed(props.treasuryEntries,'customer-payment',payment.id)),unallocatedSupplierPayments=props.supplierPayments.filter(payment=>!treasuryLinkedSourceUsed(props.treasuryEntries,'supplier-payment',payment.id));
  const rows=treasuryProjection(props.payments,props.supplierPayments,props.expenses,props.treasuryEntries,props.treasuryReconciliations,props.company.defaultCurrency),currencies=Array.from(new Set([...activeAccounts.map(a=>a.currency),...rows.map(row=>row.currency)])).filter(Boolean).sort(),selected=currencyFilter==='ALL'?'':currencyFilter;
  const visible=rows.filter(row=>(!selected||row.currency===selected)&&(!query.trim()||[row.label,row.reference,row.source,row.amount].join(' ').toLowerCase().includes(query.trim().toLowerCase()))),summaryCurrencies=selected?[selected]:currencies,voided=[...props.treasuryEntries].filter(entry=>entry.voidedAt).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
  const run=async(fn:()=>Promise<void>,fallback:string)=>{if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:fallback);}finally{setBusy(false);}};

  const addAccount=()=>void run(async()=>{
    const account=createTreasuryAccount({label:accountName,kind:accountKind,currency:accountCurrency,bankAccountId:accountKind==='bank'?bankAccountId:'',workspaceId:props.workspaceId,branchId:props.branchId});
    const opening=absoluteOpening(openingBalance);let openingEntry:TreasuryLedgerRecord|undefined;
    if(opening.amount&&Number(opening.amount)!==0){openingEntry={...createTreasuryEntry('opening-balance',account.currency),workspaceId:props.workspaceId,branchId:props.branchId,date:todayIso(),amount:opening.amount,currency:account.currency,fromAccountId:opening.negative?account.id:'',toAccountId:opening.negative?'':account.id,reference:t('Opening balance','رصيد افتتاحي')};assertTreasuryEntry(openingEntry,[...props.treasuryAccounts,account]);}
    await mutateVaultSafely(vault=>({...vault,treasuryAccounts:[...vault.treasuryAccounts,account],treasuryEntries:openingEntry?[...vault.treasuryEntries,openingEntry]:vault.treasuryEntries}));setAccountName('');setOpeningBalance('');setBankAccountId('');
  },t('Unable to create treasury account.','تعذر إنشاء حساب الخزينة.'));

  const sourcePayment=type==='collection'?props.payments.find(item=>item.id===sourceId):undefined,sourceSupplierPayment=type==='supplier-payment'?props.supplierPayments.find(item=>item.id===sourceId):undefined,currentSourceCurrency=sourcePayment?.currency||sourceSupplierPayment?.currency||'';
  const accountOptions=(side:'from'|'to')=>activeAccounts.filter(account=>!currentSourceCurrency||account.currency===currentSourceCurrency).filter(account=>side==='from'||account.id!==from);
  const chooseCustomerSource=(id:string)=>{const item=props.payments.find(payment=>payment.id===id);setSourceId(id);setAmount(item?.amount||'');setReference(item?.reference||item?.invoiceNumber||'');setDate(item?.date||todayIso());setFrom('');setTo(activeAccounts.find(account=>account.currency===item?.currency)?.id||'');};
  const chooseSupplierSource=(id:string)=>{const item=props.supplierPayments.find(payment=>payment.id===id);setSourceId(id);setAmount(item?.amount||'');setReference(item?.reference||item?.purchaseNumber||'');setDate(item?.date||todayIso());setTo('');setFrom(activeAccounts.find(account=>account.currency===item?.currency)?.id||'');};
  const save=()=>void run(async()=>{
    let entryAmount=amount.trim(),currency='',fromId=from,toId=to,sourceType:TreasuryLedgerRecord['sourceType']='manual',linkedSource='';
    if(type==='collection'){const item=props.payments.find(payment=>payment.id===sourceId);if(!item)throw new Error(t('Choose an unallocated customer payment.','اختر دفعة عميل غير مخصصة.'));entryAmount=item.amount;currency=item.currency;sourceType='customer-payment';linkedSource=item.id;fromId='';}
    else if(type==='supplier-payment'){const item=props.supplierPayments.find(payment=>payment.id===sourceId);if(!item)throw new Error(t('Choose an unallocated supplier payment.','اختر دفعة مورد غير مخصصة.'));entryAmount=item.amount;currency=item.currency;sourceType='supplier-payment';linkedSource=item.id;toId='';}
    else if(type==='transfer'){const a=props.treasuryAccounts.find(item=>item.id===fromId);currency=a?.currency||'';}
    else if(type==='deposit'){fromId='';currency=props.treasuryAccounts.find(item=>item.id===toId)?.currency||'';}
    else if(type==='withdrawal'){toId='';currency=props.treasuryAccounts.find(item=>item.id===fromId)?.currency||'';}
    else if(type==='reconciliation'){if(reconciliationDirection==='in'){fromId='';currency=props.treasuryAccounts.find(item=>item.id===toId)?.currency||'';}else{toId='';currency=props.treasuryAccounts.find(item=>item.id===fromId)?.currency||'';}}
    const entry={...createTreasuryEntry(type,currency),workspaceId:props.workspaceId,branchId:props.branchId,date,amount:entryAmount,currency:currency.toUpperCase(),fromAccountId:fromId,toAccountId:toId,sourceType,sourceId:linkedSource,reference:reference.trim(),notes:notes.trim()};assertTreasuryEntry(entry,props.treasuryAccounts);
    await mutateVaultSafely(vault=>{if(linkedSource&&treasuryLinkedSourceUsed(vault.treasuryEntries,sourceType,linkedSource))throw new Error(t('This payment is already allocated to treasury.','تم تخصيص هذه الدفعة مسبقًا للخزينة.'));return{...vault,treasuryEntries:[...vault.treasuryEntries,entry]};});setAmount('');setReference('');setNotes('');setSourceId('');
  },t('Unable to save treasury entry.','تعذر حفظ حركة الخزينة.'));

  const toggleReconciled=(key:string,reconciled:boolean)=>void run(async()=>{if(key.startsWith('treasury:')){const id=key.slice('treasury:'.length);await mutateVaultSafely(vault=>({...vault,treasuryEntries:vault.treasuryEntries.map(entry=>entry.id===id?markTreasuryEntryReconciled(entry,!reconciled):entry)}));return;}await mutateVaultSafely(vault=>({...vault,treasuryReconciliations:reconciled?vault.treasuryReconciliations.filter(item=>item.movementKey!==key):[...vault.treasuryReconciliations,{...createTreasuryReconciliation(key),workspaceId:props.workspaceId,branchId:props.branchId}]}));},t('Unable to update reconciliation.','تعذر تحديث المطابقة.'));
  const voidEntry=(id:string)=>void run(async()=>{const reason=(voidReasons[id]||'').trim();await mutateVaultSafely(vault=>({...vault,treasuryEntries:vault.treasuryEntries.map(entry=>entry.id===id?voidTreasuryEntry(entry,reason):entry)}));setVoidReasons(current=>({...current,[id]:''}));},t('Unable to void treasury entry.','تعذر إلغاء قيد الخزينة.'));

  return <section className="ta-finance-page lx-treasury-ledger">
    <header className="ta-page-header"><div><span className="ta-page-kicker">{t('Cash & Bank','النقد والبنوك')}</span><h2>{t('Real Treasury Ledger','دفتر الخزينة الفعلي')}</h2><p>{t('Account balances come only from explicit ledger entries and opening balances. Company bank metadata never fabricates cash position.','أرصدة الحسابات تأتي فقط من قيود دفتر الخزينة والأرصدة الافتتاحية الصريحة. بيانات البنك في الشركة لا تنشئ مركزًا نقديًا وهميًا.')}</p></div></header>
    <section className="ta-finance-kpis">{activeAccounts.length?activeAccounts.map(account=><article className="ta-finance-kpi" key={account.id}><span>{account.label}</span><strong>{formatMoney(treasuryAccountBalance(account.id,props.treasuryEntries),account.currency)}</strong><small>{account.kind==='bank'?t('Bank ledger account','حساب دفتر بنكي'):t('Cash ledger account','حساب دفتر نقدي')} · {account.currency}</small></article>):<article className="ta-finance-kpi"><span>{t('Treasury accounts','حسابات الخزينة')}</span><strong>0</strong><small>{t('Create an account before recording a cash position.','أنشئ حسابًا قبل تسجيل المركز النقدي.')}</small></article>}</section>
    <div className="ta-finance-grid"><section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Financial account','الحساب المالي')}</span><h3>{t('Add cash or bank account','إضافة حساب نقدي أو بنكي')}</h3></div></header><div className="lx-form-grid"><label><span>{t('Label','الاسم')}</span><Input value={accountName} onChange={(e:any)=>setAccountName(e.target.value)}/></label><label><span>{t('Type','النوع')}</span><Select value={accountKind} onChange={(e:any)=>setAccountKind(e.target.value)}><option value="bank">{t('Bank','بنك')}</option><option value="cash">{t('Cash','نقد')}</option></Select></label><label><span>{t('Currency','العملة')}</span><Input dir="ltr" maxLength={3} value={accountCurrency} onChange={(e:any)=>setAccountCurrency(String(e.target.value).toUpperCase())}/></label>{accountKind==='bank'?<label><span>{t('Bank metadata link (optional)','ربط بيانات البنك (اختياري)')}</span><Select value={bankAccountId} onChange={(e:any)=>setBankAccountId(e.target.value)}><option value="">{t('No metadata link','بدون ربط')}</option>{bankMetadata.map(item=><option key={item.id} value={item.id}>{item.label} · {item.currency}</option>)}</Select></label>:null}<label><span>{t('Opening balance (optional)','الرصيد الافتتاحي (اختياري)')}</span><Input inputMode="decimal" value={openingBalance} placeholder="0.00" onChange={(e:any)=>setOpeningBalance(e.target.value)}/></label></div><Button variant="primary" icon="plus" disabled={busy} onClick={addAccount}>{t('Create account','إنشاء الحساب')}</Button></section>
    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Ledger movement','حركة الدفتر')}</span><h3>{t('Record treasury entry','تسجيل قيد خزينة')}</h3></div></header><div className="lx-form-grid"><label><span>{t('Type','النوع')}</span><Select value={type} onChange={(e:any)=>{setType(e.target.value);setSourceId('');setAmount('');setFrom('');setTo('');}}><option value="deposit">{t('Deposit','إيداع')}</option><option value="withdrawal">{t('Withdrawal','سحب')}</option><option value="transfer">{t('Transfer','تحويل')}</option><option value="collection">{t('Customer collection','تحصيل عميل')}</option><option value="supplier-payment">{t('Supplier payment','دفعة مورد')}</option><option value="reconciliation">{t('Reconciliation adjustment','تسوية مطابقة')}</option></Select></label><label><span>{t('Date','التاريخ')}</span><Input type="date" value={date} onChange={(e:any)=>setDate(e.target.value)}/></label>{type==='collection'?<label><span>{t('Customer payment','دفعة العميل')}</span><Select value={sourceId} onChange={(e:any)=>chooseCustomerSource(e.target.value)}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedPayments.map(item=><option key={item.id} value={item.id}>{item.invoiceNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:null}{type==='supplier-payment'?<label><span>{t('Supplier payment','دفعة المورد')}</span><Select value={sourceId} onChange={(e:any)=>chooseSupplierSource(e.target.value)}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedSupplierPayments.map(item=><option key={item.id} value={item.id}>{item.purchaseNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:null}{type==='reconciliation'?<label><span>{t('Direction','الاتجاه')}</span><Select value={reconciliationDirection} onChange={(e:any)=>setReconciliationDirection(e.target.value)}><option value="in">{t('Increase account','زيادة الحساب')}</option><option value="out">{t('Decrease account','تخفيض الحساب')}</option></Select></label>:null}{(type==='withdrawal'||type==='supplier-payment'||type==='transfer'||(type==='reconciliation'&&reconciliationDirection==='out'))?<label><span>{t('From account','من الحساب')}</span><Select value={from} onChange={(e:any)=>setFrom(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('from').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}{(type==='deposit'||type==='collection'||type==='transfer'||(type==='reconciliation'&&reconciliationDirection==='in'))?<label><span>{t('To account','إلى الحساب')}</span><Select value={to} onChange={(e:any)=>setTo(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('to').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}<label><span>{t('Amount','المبلغ')}</span><Input inputMode="decimal" disabled={type==='collection'||type==='supplier-payment'} value={amount} onChange={(e:any)=>setAmount(e.target.value)}/></label><label><span>{t('Reference','المرجع')}</span><Input value={reference} onChange={(e:any)=>setReference(e.target.value)}/></label><label className="lx-form-wide"><span>{t('Notes','ملاحظات')}</span><Textarea rows={2} value={notes} onChange={(e:any)=>setNotes(e.target.value)}/></label></div>{error?<p className="lifecycle-error" role="alert">{error}</p>:null}<Button variant="primary" icon="plus" disabled={busy||!activeAccounts.length} onClick={save}>{t('Add ledger entry','إضافة قيد')}</Button></section></div>
    <section className="ta-report-kpi-grid">{summaryCurrencies.map(code=>{const totals=treasuryTotals(rows,code);return <article className="ta-report-kpi" key={code}><header><span>{code}</span><small>{totals.reconciled} {t('reconciled','مطابق')}</small></header><div className="ta-report-kpi-primary"><div><span>{t('Inflows','الداخل')}</span><strong>{formatMoney(totals.inflow,code)}</strong></div><div><span>{t('Outflows','الخارج')}</span><strong>{formatMoney(totals.outflow,code)}</strong></div><div><span>{t('Movement net','صافي الحركة')}</span><strong>{formatMoney(totals.net,code)}</strong></div></div><p className="lx-finance-disclaimer">{t('Opening balances are excluded from movement net. Account cards above are the ledger cash position.','الأرصدة الافتتاحية مستبعدة من صافي الحركة. بطاقات الحسابات أعلاه هي المركز النقدي الدفتري.')}</p></article>})}</section>
    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Reconciliation','المطابقة')}</span><h3>{t('Treasury movements','حركات الخزينة')}</h3></div><div className="ta-panel-status">{visible.length}</div></header><div className="ta-report-filterbar"><Input placeholder={t('Search movement…','بحث في الحركة…')} value={query} onChange={(e:any)=>setQuery(e.target.value)}/><Select value={currencyFilter} onChange={(e:any)=>setCurrencyFilter(e.target.value)}><option value="ALL">{t('All currencies','كل العملات')}</option>{currencies.map(code=><option key={code}>{code}</option>)}</Select></div><div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Date','التاريخ')}</th><th>{t('Type','النوع')}</th><th>{t('Reference','المرجع')}</th><th>{t('Amount','المبلغ')}</th><th>{t('Account','الحساب')}</th><th>{t('Status','الحالة')}</th><th>{t('Actions','الإجراءات')}</th></tr></thead><tbody>{visible.map(row=><tr key={row.key}><td>{displayDate(row.date,getUiLanguage())}</td><td>{sourceLabel(row.source)}</td><td><strong>{row.label}</strong><small>{row.reference||'—'}</small></td><td>{row.direction==='out'?'-':row.direction==='internal'?'↔':'+'}{formatMoney(row.amount,row.currency)}</td><td>{row.direction==='internal'?`${accountLabel(props.treasuryAccounts.find(a=>a.id===row.fromAccountId))} → ${accountLabel(props.treasuryAccounts.find(a=>a.id===row.toAccountId))}`:accountLabel(props.treasuryAccounts.find(a=>a.id===(row.toAccountId||row.fromAccountId)))}</td><td><span className={`lx-share-chip ${row.reconciled?'is-accepted':'is-active'}`}>{row.reconciled?t('Reconciled','مطابق'):t('Open','غير مطابق')}</span></td><td><div className="lx-row-actions"><Button disabled={busy} onClick={()=>toggleReconciled(row.key,row.reconciled)}>{row.reconciled?t('Undo reconcile','إلغاء المطابقة'):t('Reconcile','مطابقة')}</Button>{row.key.startsWith('treasury:')?<><Input aria-label={t('Void reason','سبب الإلغاء')} placeholder={t('Void reason','سبب الإلغاء')} value={voidReasons[row.id]||''} onChange={(e:any)=>setVoidReasons(current=>({...current,[row.id]:e.target.value}))}/><Button variant="danger" disabled={busy} onClick={()=>voidEntry(row.id)}>{t('Void','إلغاء')}</Button></>:null}</div></td></tr>)}</tbody></table></div></section>
    {voided.length?<section className="ta-panel"><header className="ta-panel-header"><div><span>{t('History preserved','السجل محفوظ')}</span><h3>{t('Voided treasury entries','قيود الخزينة الملغاة')}</h3></div><div className="ta-panel-status">{voided.length}</div></header><div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Date','التاريخ')}</th><th>{t('Type','النوع')}</th><th>{t('Amount','المبلغ')}</th><th>{t('Reason','السبب')}</th></tr></thead><tbody>{voided.map(entry=><tr key={entry.id}><td>{displayDate(entry.date,getUiLanguage())}</td><td>{sourceLabel(entry.type)}</td><td>{formatMoney(entry.amount,entry.currency)}</td><td>{entry.voidReason}</td></tr>)}</tbody></table></div></section>:null}
  </section>;
}
''')

# ---------------------------------------------------------------------------
# Dedicated contracts and hardening workflow.
# ---------------------------------------------------------------------------
write(Path('tests/treasury-accounts-v474.test.mjs'),r'''import test from 'node:test';
import assert from 'node:assert/strict';

test('treasury accounts, opening balances, transfers and voids preserve real ledger balances',async()=>{
  const t=await import('../dist/src/lib/treasury-ledger.js');
  const a=t.createTreasuryAccount({label:'Main Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'}),b=t.createTreasuryAccount({label:'Cash',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});
  const make=(type,amount,from='',to='')=>{const entry={...t.createTreasuryEntry(type,'USD'),workspaceId:'default',branchId:'main',date:'2026-10-01',amount,fromAccountId:from,toAccountId:to};t.assertTreasuryEntry(entry,[a,b]);return entry;};
  const opening=make('opening-balance','500.00','',a.id),deposit=make('deposit','100.00','',a.id),transfer=make('transfer','50.00',a.id,b.id),withdrawal=make('withdrawal','25.00',b.id,'');
  assert.equal(t.treasuryAccountBalance(a.id,[opening,deposit,transfer,withdrawal]),'550.00');
  assert.equal(t.treasuryAccountBalance(b.id,[opening,deposit,transfer,withdrawal]),'25.00');
  const voided=t.voidTreasuryEntry(withdrawal,'Correction');assert.equal(t.treasuryAccountBalance(b.id,[opening,deposit,transfer,voided]),'50.00');assert.match(voided.voidReason,/Correction/);
});

test('linked customer and supplier payments are allocated exactly once in treasury projection',async()=>{
  const t=await import('../dist/src/lib/treasury-ledger.js');
  const account=t.createTreasuryAccount({label:'Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const payments=[{id:'p1',invoiceId:'i1',invoiceNumber:'INV-1',customerId:'c1',customerNameEn:'Atlas',customerNameAr:'',currency:'USD',amount:'100.00',date:'2026-01-01',method:'bank-transfer',reference:'COL',notes:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
  const entry={...t.createTreasuryEntry('collection','USD'),workspaceId:'default',branchId:'main',date:'2026-01-01',amount:'100.00',toAccountId:account.id,sourceType:'customer-payment',sourceId:'p1'};t.assertTreasuryEntry(entry,[account]);
  assert.equal(t.treasuryLinkedSourceUsed([entry],'customer-payment','p1'),true);
  const rows=t.treasuryProjection(payments,[],[],[entry],[],'USD');assert.equal(rows.filter(row=>row.source==='collection').length,1);assert.equal(rows[0].key,`treasury:${entry.id}`);assert.equal(t.treasuryAccountBalance(account.id,[entry]),'100.00');
});

test('dated FX lookup supports deterministic inverse conversion without changing saved rate direction',async()=>{
  const fx=await import('../dist/src/lib/fx-rates.js');
  const rate={id:'fx1',workspaceId:'default',date:'2026-10-01',fromCurrency:'USD',toCurrency:'SAR',rate:'3.75',sourceLabel:'Bank',notes:'',createdAt:'',updatedAt:'1'};
  const direct=fx.fxRateMatchForDate([rate],'USD','SAR','2026-10-01'),inverse=fx.fxRateMatchForDate([rate],'SAR','USD','2026-10-01');assert.equal(direct.inverse,false);assert.equal(inverse.inverse,true);assert.equal(fx.convertWithFxMatch('100.00',direct),'375.00');assert.equal(fx.convertWithFxMatch('375.00',inverse),'100.00');assert.equal(rate.fromCurrency,'USD');assert.equal(rate.toCurrency,'SAR');
});

test('v21 migration creates explicit definitions for previously referenced bank metadata without inventing balances',async()=>{
  const [{emptyVault},{migrateVault}]=await Promise.all([import('../dist/src/lib/defaults.js'),import('../dist/src/storage/vault.js')]);
  const legacy=structuredClone(emptyVault());legacy.schemaVersion=20;delete legacy.treasuryAccounts;legacy.treasuryEntries=[{id:'old1',workspaceId:'default',branchId:'main',type:'deposit',date:'2026-01-01',currency:'USD',amount:'10.00',fromAccountId:'',toAccountId:'primary',reference:'',notes:'',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}];
  const migrated=migrateVault(legacy);assert.equal(migrated.treasuryAccounts.length,1);assert.equal(migrated.treasuryAccounts[0].id,'primary');assert.equal(migrated.treasuryEntries[0].sourceType,'manual');assert.equal(migrated.treasuryEntries[0].voidedAt,'');
});
''')

p=Path('.github/workflows/roadmap-hardening-final.yml'); text=read(p)
text=replace_once(text,
"      - 'tests/roadmap-hardening-v473.test.mjs'\n",
"      - 'tests/roadmap-hardening-v473.test.mjs'\n      - 'tests/treasury-accounts-v474.test.mjs'\n",
'hardening workflow test path')
text=replace_once(text,
"run: node --test tests/roadmap-hardening-v473.test.mjs",
"run: node --test tests/roadmap-hardening-v473.test.mjs tests/treasury-accounts-v474.test.mjs",
'hardening workflow tests')
write(p,text)

print('Treasury account / inverse FX repair applied.')
