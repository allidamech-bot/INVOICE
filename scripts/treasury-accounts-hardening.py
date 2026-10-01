from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:120]!r}")
    if text.count(old) != 1:
        raise SystemExit(f"anchor not unique in {path}: {old[:120]!r} count={text.count(old)}")
    write(path, text.replace(old, new, 1))

# 1) Vault types: real financial accounts + immutable ledger entries.
path = "src/types.ts"
text = read(path)
old = """export type TreasuryLedgerType = 'deposit' | 'withdrawal' | 'transfer';
export interface TreasuryLedgerRecord extends WorkspaceScopeFields {
  id:string;type:TreasuryLedgerType;date:string;currency:string;amount:string;fromAccountId:string;toAccountId:string;reference:string;notes:string;createdAt:string;updatedAt:string;
}
export interface TreasuryReconciliationRecord extends WorkspaceScopeFields {
  id:string;movementKey:string;reconciledAt:string;note:string;createdAt:string;updatedAt:string;
}
"""
new = """export type TreasuryAccountKind = 'cash' | 'bank';
export type TreasuryLedgerType = 'opening-balance' | 'deposit' | 'withdrawal' | 'transfer' | 'collection' | 'supplier-payment' | 'reconciliation';
export type TreasurySourceType = 'manual' | 'customer-payment' | 'supplier-payment';
export interface TreasuryAccountRecord extends WorkspaceScopeFields {
  id:string;label:string;kind:TreasuryAccountKind;currency:string;bankAccountId:string;active:boolean;createdAt:string;updatedAt:string;
}
export interface TreasuryLedgerRecord extends WorkspaceScopeFields {
  id:string;type:TreasuryLedgerType;date:string;currency:string;amount:string;fromAccountId:string;toAccountId:string;sourceType:TreasurySourceType;sourceId:string;reference:string;notes:string;reconciledAt:string;voidedAt:string;voidReason:string;createdAt:string;updatedAt:string;
}
export interface TreasuryReconciliationRecord extends WorkspaceScopeFields {
  id:string;movementKey:string;reconciledAt:string;note:string;createdAt:string;updatedAt:string;
}
"""
if old not in text:
    raise SystemExit("types treasury block anchor missing")
text = text.replace(old, new, 1)
old2 = """  treasuryEntries: TreasuryLedgerRecord[];
  treasuryReconciliations: TreasuryReconciliationRecord[];
"""
new2 = """  treasuryAccounts: TreasuryAccountRecord[];
  treasuryEntries: TreasuryLedgerRecord[];
  treasuryReconciliations: TreasuryReconciliationRecord[];
"""
if old2 not in text:
    raise SystemExit("VaultPayload treasury anchor missing")
text = text.replace(old2, new2, 1)
write(path, text)

# 2) Empty vault + scope ownership.
replace_once(
    "src/lib/defaults.ts",
    "inventoryMovements: [], treasuryEntries: [], treasuryReconciliations: []",
    "inventoryMovements: [], treasuryAccounts: [], treasuryEntries: [], treasuryReconciliations: []",
)
replace_once(
    "src/lib/workspaces.ts",
    "['purchases','supplierPayments','expenses','inventoryMovements','treasuryEntries','treasuryReconciliations','warehouses','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests']",
    "['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests']",
)

# 3) Migration: v20 -> v21 creates empty real accounts and normalizes the richer entry contract.
path = "src/storage/vault.ts"
text = read(path)
pattern = re.compile(r"  migrated\.treasuryEntries=.*?\n  migrated\.treasuryReconciliations=", re.S)
match = pattern.search(text)
if not match:
    raise SystemExit("vault treasury migration anchor missing")
replacement = """  migrated.treasuryAccounts=Array.isArray((vault as any).treasuryAccounts)?(vault as any).treasuryAccounts.map((account:any)=>({id:stringValue(account?.id),workspaceId:stringValue(account?.workspaceId,'default')||'default',branchId:stringValue(account?.branchId,'main')||'main',label:stringValue(account?.label),kind:account?.kind==='cash'?'cash':'bank',currency:cleanCurrency(account?.currency,migrated.appSettings.smartDefaults.currency||'USD'),bankAccountId:stringValue(account?.bankAccountId),active:booleanValue(account?.active,true),createdAt:stringValue(account?.createdAt,nowIso()),updatedAt:stringValue(account?.updatedAt,account?.createdAt?stringValue(account.createdAt):nowIso())})).filter((account:any)=>account.id&&account.label):[];
  migrated.treasuryEntries=Array.isArray((vault as any).treasuryEntries)?(vault as any).treasuryEntries.map((entry:any)=>({id:stringValue(entry?.id),workspaceId:stringValue(entry?.workspaceId,'default')||'default',branchId:stringValue(entry?.branchId,'main')||'main',type:['opening-balance','deposit','withdrawal','transfer','collection','supplier-payment','reconciliation'].includes(entry?.type)?entry.type:'deposit',date:stringValue(entry?.date),currency:cleanCurrency(entry?.currency,migrated.appSettings.smartDefaults.currency||'USD'),amount:stringValue(entry?.amount,'0.00'),fromAccountId:stringValue(entry?.fromAccountId),toAccountId:stringValue(entry?.toAccountId),sourceType:['customer-payment','supplier-payment'].includes(entry?.sourceType)?entry.sourceType:'manual',sourceId:stringValue(entry?.sourceId),reference:stringValue(entry?.reference),notes:stringValue(entry?.notes),reconciledAt:stringValue(entry?.reconciledAt),voidedAt:stringValue(entry?.voidedAt),voidReason:stringValue(entry?.voidReason),createdAt:stringValue(entry?.createdAt,nowIso()),updatedAt:stringValue(entry?.updatedAt,entry?.createdAt?stringValue(entry.createdAt):nowIso())})).filter((entry:any)=>entry.id):[];
  migrated.treasuryReconciliations="""
text = text[:match.start()] + replacement + text[match.end():]
old_scope = "(['purchases','supplierPayments','expenses','inventoryMovements','treasuryEntries','treasuryReconciliations','warehouses','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const)"
new_scope = "(['purchases','supplierPayments','expenses','inventoryMovements','treasuryAccounts','treasuryEntries','treasuryReconciliations','warehouses','recurringWorkflows','documents','documentEvents','documentRevisions','payments','approvalRequests'] as const)"
if old_scope not in text:
    raise SystemExit("vault scope anchor missing")
text = text.replace(old_scope, new_scope, 1)
old_unique = "  unique(migrated.treasuryEntries.map(m => m.id), 'treasury entry');"
new_unique = "  unique(migrated.treasuryAccounts.map(m => m.id), 'treasury account');\n  unique(migrated.treasuryEntries.map(m => m.id), 'treasury entry');"
if old_unique not in text:
    raise SystemExit("vault unique anchor missing")
text = text.replace(old_unique, new_unique, 1)
write(path, text)

# 4) Multi-device merge guards: accounts first, then validate immutable entries against their real account ledger.
path = "src/storage/vault-merge.ts"
text = read(path)
text = text.replace(
    "import { assertTreasuryEntry } from '../lib/treasury-ledger.js';",
    "import { assertTreasuryAccount, assertTreasuryEntry } from '../lib/treasury-ledger.js';",
    1,
)
old_merge = """  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before saving this entry.');
  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);
  for(const entry of treasuryEntries)assertTreasuryEntry(entry);
"""
new_merge = """  guardConcurrentRecordChanges(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts,'Treasury account','Reopen Cash & Bank before saving this account.');
  const treasuryAccounts=mergeRecords(base.treasuryAccounts,intended.treasuryAccounts,latest.treasuryAccounts);
  for(const account of treasuryAccounts)assertTreasuryAccount(account);
  guardConcurrentRecordChanges(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries,'Treasury entry','Reopen Cash & Bank before saving this entry.');
  const treasuryEntries=mergeRecords(base.treasuryEntries,intended.treasuryEntries,latest.treasuryEntries);
  for(const entry of treasuryEntries)assertTreasuryEntry(entry,treasuryAccounts);
"""
if old_merge not in text:
    raise SystemExit("vault merge treasury anchor missing")
text = text.replace(old_merge, new_merge, 1)
old_return = """    inventoryMovements,
    treasuryEntries,
    treasuryReconciliations,
"""
new_return = """    inventoryMovements,
    treasuryAccounts,
    treasuryEntries,
    treasuryReconciliations,
"""
if old_return not in text:
    raise SystemExit("vault merge return anchor missing")
text = text.replace(old_return, new_return, 1)
write(path, text)

# 5) Treasury domain: explicit accounts, account-derived balances, immutable/voidable entries, linked source allocation.
treasury_lib = r"""import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryLedgerType, TreasuryReconciliationRecord, TreasurySourceType } from '../types.js';
import { isIsoDate, makeId, todayIso } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';

export type TreasuryProjectionSource='collection'|'supplier-payment'|'expense'|'opening-balance'|'deposit'|'withdrawal'|'transfer'|'reconciliation';
export interface TreasuryProjectionRow {
  key:string;id:string;date:string;createdAt:string;source:TreasuryProjectionSource;direction:'in'|'out'|'internal';currency:string;amount:string;
  label:string;reference:string;method:string;fromAccountId:string;toAccountId:string;reconciled:boolean;reconciledAt:string;
}

const CREDIT_TYPES=new Set<TreasuryLedgerType>(['opening-balance','deposit','collection']);
const DEBIT_TYPES=new Set<TreasuryLedgerType>(['withdrawal','supplier-payment']);

function currency(value:string,fallback='USD'):string{return value.trim().toUpperCase()||fallback;}
function amountIsPositive(value:string):boolean{return isNonNegativeDecimalInput(value)&&decimalToScaled(value,2)>0n;}
function fixed(value:bigint):string{const sign=value<0n?'-':'';const abs=value<0n?-value:value;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}

export function assertTreasuryAccount(account:TreasuryAccountRecord):void{
  if(!account.id||!account.label.trim())throw new Error('Treasury account label is required.');
  if(account.kind!=='cash'&&account.kind!=='bank')throw new Error('Treasury account type is invalid.');
  if(!/^[A-Z]{3}$/.test(currency(account.currency)))throw new Error('Treasury account currency must be a three-letter currency code.');
  if(!account.workspaceId||!account.branchId)throw new Error('Treasury account scope is missing.');
}

export function createTreasuryAccount(input:{label:string;kind:'cash'|'bank';currency:string;bankAccountId?:string;workspaceId:string;branchId:string}):TreasuryAccountRecord{
  const now=new Date().toISOString();
  const account:TreasuryAccountRecord={id:makeId('treasury-account'),label:input.label.trim(),kind:input.kind,currency:currency(input.currency),bankAccountId:(input.bankAccountId||'').trim(),active:true,workspaceId:input.workspaceId,branchId:input.branchId,createdAt:now,updatedAt:now};
  assertTreasuryAccount(account);return account;
}

export function assertTreasuryEntry(entry:TreasuryLedgerRecord,accounts:TreasuryAccountRecord[]):void{
  if(!entry.id||!isIsoDate(entry.date))throw new Error('Treasury entry date is invalid.');
  if(!amountIsPositive(entry.amount))throw new Error('Treasury amount must be greater than zero.');
  const code=currency(entry.currency);if(!/^[A-Z]{3}$/.test(code))throw new Error('Treasury currency must be a three-letter currency code.');
  if(!entry.workspaceId||!entry.branchId)throw new Error('Treasury entry scope is missing.');
  const from=entry.fromAccountId?accounts.find(account=>account.id===entry.fromAccountId):undefined;
  const to=entry.toAccountId?accounts.find(account=>account.id===entry.toAccountId):undefined;
  if(entry.fromAccountId&&!from)throw new Error('Treasury source account was not found.');
  if(entry.toAccountId&&!to)throw new Error('Treasury destination account was not found.');
  if(from&&currency(from.currency)!==code)throw new Error('Treasury source account currency does not match the entry.');
  if(to&&currency(to.currency)!==code)throw new Error('Treasury destination account currency does not match the entry.');
  if(entry.type==='transfer'){
    if(!from||!to||from.id===to.id)throw new Error('Transfer requires two different treasury accounts.');
  }else if(CREDIT_TYPES.has(entry.type)){
    if(from||!to)throw new Error('This treasury entry must credit one destination account.');
  }else if(DEBIT_TYPES.has(entry.type)){
    if(!from||to)throw new Error('This treasury entry must debit one source account.');
  }else if(entry.type==='reconciliation'){
    if(Boolean(from)===Boolean(to))throw new Error('Reconciliation must adjust exactly one treasury account.');
  }else throw new Error('Treasury entry type is invalid.');
  if(entry.type==='collection'&&(!entry.sourceId||entry.sourceType!=='customer-payment'))throw new Error('Collection must link to a customer payment.');
  if(entry.type==='supplier-payment'&&(!entry.sourceId||entry.sourceType!=='supplier-payment'))throw new Error('Supplier payment must link to a supplier payment record.');
  if(entry.type!=='collection'&&entry.type!=='supplier-payment'&&entry.sourceType!=='manual')throw new Error('Manual treasury entries cannot claim a payment source.');
}

export function createTreasuryEntry(input:{type:TreasuryLedgerType;date?:string;amount:string;currency:string;fromAccountId?:string;toAccountId?:string;sourceType?:TreasurySourceType;sourceId?:string;reference?:string;notes?:string;workspaceId:string;branchId:string},accounts:TreasuryAccountRecord[]):TreasuryLedgerRecord{
  const now=new Date().toISOString();
  const entry:TreasuryLedgerRecord={id:makeId('treasury'),workspaceId:input.workspaceId,branchId:input.branchId,type:input.type,date:input.date||todayIso(),currency:currency(input.currency),amount:fixed(decimalToScaled(input.amount,2)),fromAccountId:input.fromAccountId||'',toAccountId:input.toAccountId||'',sourceType:input.sourceType||'manual',sourceId:input.sourceId||'',reference:(input.reference||'').trim(),notes:(input.notes||'').trim(),reconciledAt:'',voidedAt:'',voidReason:'',createdAt:now,updatedAt:now};
  assertTreasuryEntry(entry,accounts);return entry;
}

export function treasuryAccountBalanceScaled(accountId:string,entries:TreasuryLedgerRecord[]):bigint{
  let balance=0n;
  for(const entry of entries){if(entry.voidedAt)continue;const amount=decimalToScaled(entry.amount,2);if(entry.toAccountId===accountId)balance+=amount;if(entry.fromAccountId===accountId)balance-=amount;}
  return balance;
}
export function treasuryAccountBalance(accountId:string,entries:TreasuryLedgerRecord[]):string{return fixed(treasuryAccountBalanceScaled(accountId,entries));}

export function treasuryLinkedSourceUsed(entries:TreasuryLedgerRecord[],sourceType:TreasurySourceType,sourceId:string,ignoreId=''):boolean{
  return entries.some(entry=>entry.id!==ignoreId&&!entry.voidedAt&&entry.sourceType===sourceType&&entry.sourceId===sourceId);
}

export function voidTreasuryEntry(entry:TreasuryLedgerRecord,reason:string):TreasuryLedgerRecord{
  const clean=reason.trim();if(!clean)throw new Error('Enter a reason before voiding this treasury entry.');if(entry.voidedAt)throw new Error('Treasury entry is already voided.');
  const now=new Date().toISOString();return{...entry,voidedAt:now,voidReason:clean,updatedAt:now};
}

export function markTreasuryEntryReconciled(entry:TreasuryLedgerRecord,reconciled:boolean):TreasuryLedgerRecord{
  if(entry.voidedAt)throw new Error('A voided treasury entry cannot be reconciled.');
  const now=new Date().toISOString();return{...entry,reconciledAt:reconciled?now:'',updatedAt:now};
}

export function createTreasuryReconciliation(movementKey:string,note=''):TreasuryReconciliationRecord{
  const now=new Date().toISOString();if(!movementKey.trim())throw new Error('Treasury movement key is required.');
  return{id:makeId('reconcile'),workspaceId:'',branchId:'',movementKey:movementKey.trim(),reconciledAt:now,note:note.trim(),createdAt:now,updatedAt:now};
}

/* Compatibility projection: useful for an activity view, but never used to calculate account balances. */
export function treasuryProjection(payments:PaymentRecord[],supplierPayments:SupplierPaymentRecord[],expenses:ExpenseRecord[],entries:TreasuryLedgerRecord[],reconciliations:TreasuryReconciliationRecord[],defaultCurrency='USD'):TreasuryProjectionRow[]{
  const reconciled=new Map(reconciliations.map(item=>[item.movementKey,item]));const rows:TreasuryProjectionRow[]=[];
  const attach=(row:Omit<TreasuryProjectionRow,'reconciled'|'reconciledAt'>,explicitReconciled='')=>{const rec=reconciled.get(row.key);rows.push({...row,reconciled:Boolean(explicitReconciled||rec),reconciledAt:explicitReconciled||rec?.reconciledAt||''});};
  const linkedCustomer=new Set(entries.filter(entry=>!entry.voidedAt&&entry.sourceType==='customer-payment').map(entry=>entry.sourceId));
  const linkedSupplier=new Set(entries.filter(entry=>!entry.voidedAt&&entry.sourceType==='supplier-payment').map(entry=>entry.sourceId));
  for(const item of payments)if(!linkedCustomer.has(item.id))attach({key:`collection:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'collection',direction:'in',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.customerNameEn||item.customerNameAr||item.invoiceNumber,reference:item.reference||item.invoiceNumber,method:item.method,fromAccountId:'',toAccountId:''});
  for(const item of supplierPayments)if(!linkedSupplier.has(item.id))attach({key:`supplier-payment:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'supplier-payment',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.supplierNameEn||item.supplierNameAr||item.purchaseNumber,reference:item.reference||item.purchaseNumber,method:item.method,fromAccountId:'',toAccountId:''});
  for(const item of expenses)attach({key:`expense:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:'expense',direction:'out',currency:currency(item.currency,defaultCurrency),amount:item.amount,label:item.description||item.category||'Expense',reference:item.reference,method:'other',fromAccountId:'',toAccountId:''});
  for(const item of entries){if(item.voidedAt)continue;const direction=item.type==='transfer'?'internal':(CREDIT_TYPES.has(item.type)||item.type==='reconciliation'&&Boolean(item.toAccountId))?'in':'out';attach({key:`treasury:${item.id}`,id:item.id,date:item.date,createdAt:item.createdAt,source:item.type,direction,currency:item.currency,amount:item.amount,label:item.notes||item.reference||item.type,reference:item.reference,method:'ledger',fromAccountId:item.fromAccountId,toAccountId:item.toAccountId},item.reconciledAt);}
  return rows.sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||a.key.localeCompare(b.key));
}

export function treasuryTotals(rows:TreasuryProjectionRow[],currencyCode:string):{inflow:string;outflow:string;net:string;internalTransfers:string;reconciled:number;unreconciled:number}{
  const code=currency(currencyCode),selected=rows.filter(row=>row.currency===code);let inflow=0n,outflow=0n,internal=0n;
  for(const row of selected){const amount=decimalToScaled(row.amount,2);if(row.direction==='in')inflow+=amount;else if(row.direction==='out')outflow+=amount;else internal+=amount;}
  return{inflow:fixed(inflow),outflow:fixed(outflow),net:fixed(inflow-outflow),internalTransfers:fixed(internal),reconciled:selected.filter(row=>row.reconciled).length,unreconciled:selected.filter(row=>!row.reconciled).length};
}
"""
write("src/lib/treasury-ledger.ts", treasury_lib)

# 6) Treasury UI: real ledger accounts, opening balances, canonical payment allocation, reconcile/void history.
treasury_page = r"""import type { CompanySettings, ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountKind, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryLedgerType, TreasuryReconciliationRecord } from '../types.js';
import { createTreasuryAccount, createTreasuryEntry, markTreasuryEntryReconciled, treasuryAccountBalance, treasuryLinkedSourceUsed, voidTreasuryEntry } from '../lib/treasury-ledger.js';
import { displayDate, todayIso } from '../lib/id.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { formatMoney } from '../lib/money.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Input, Select, Textarea } from './UI.js';

interface Props {company:CompanySettings;payments:PaymentRecord[];supplierPayments:SupplierPaymentRecord[];expenses:ExpenseRecord[];treasuryEntries:TreasuryLedgerRecord[];treasuryReconciliations:TreasuryReconciliationRecord[];}
type ReconciliationDirection='in'|'out';

function entryLabel(type:TreasuryLedgerType):string{
  if(type==='opening-balance')return t('Opening balance','رصيد افتتاحي');
  if(type==='deposit')return t('Deposit','إيداع');
  if(type==='withdrawal')return t('Withdrawal','سحب');
  if(type==='transfer')return t('Transfer','تحويل');
  if(type==='collection')return t('Customer collection','تحصيل عميل');
  if(type==='supplier-payment')return t('Supplier payment','دفعة مورد');
  return t('Reconciliation adjustment','تسوية مطابقة');
}
function accountLabel(account:TreasuryAccountRecord|undefined):string{return account?`${account.label} · ${account.currency}`:'—';}

export function TreasuryLedgerPage(props:Props):any{
  const [accounts,setAccounts]=React.useState<TreasuryAccountRecord[]>([]);
  const [accountName,setAccountName]=React.useState(''),[accountKind,setAccountKind]=React.useState<TreasuryAccountKind>('bank'),[accountCurrency,setAccountCurrency]=React.useState((props.company.defaultCurrency||'USD').toUpperCase()),[bankAccountId,setBankAccountId]=React.useState(''),[openingBalance,setOpeningBalance]=React.useState('');
  const [entryType,setEntryType]=React.useState<TreasuryLedgerType>('deposit'),[entryDate,setEntryDate]=React.useState(todayIso()),[entryAmount,setEntryAmount]=React.useState(''),[fromAccountId,setFromAccountId]=React.useState(''),[toAccountId,setToAccountId]=React.useState(''),[sourceId,setSourceId]=React.useState(''),[reference,setReference]=React.useState(''),[notes,setNotes]=React.useState(''),[reconciliationDirection,setReconciliationDirection]=React.useState<ReconciliationDirection>('in');
  const [voidReasons,setVoidReasons]=React.useState<Record<string,string>>({}),[busy,setBusy]=React.useState(''),[error,setError]=React.useState('');

  React.useEffect(()=>{let live=true;void mutateVaultSafely(vault=>vault).then(vault=>{if(live)setAccounts(vault.treasuryAccounts??[]);}).catch(e=>{if(live)setError(e instanceof Error?e.message:String(e));});return()=>{live=false;};},[]);

  const activeAccounts=accounts.filter(account=>account.active);
  const bankMetadata=[{id:'primary',label:t('Primary bank metadata','بيانات البنك الرئيسي'),currency:props.company.bank.currency||props.company.defaultCurrency},...(props.company.bankAccounts||[]).map(account=>({id:account.id,label:account.label||account.bankName||account.id,currency:account.currency}))];
  const unallocatedPayments=props.payments.filter(payment=>!treasuryLinkedSourceUsed(props.treasuryEntries,'customer-payment',payment.id));
  const unallocatedSupplierPayments=props.supplierPayments.filter(payment=>!treasuryLinkedSourceUsed(props.treasuryEntries,'supplier-payment',payment.id));
  const entries=[...props.treasuryEntries].sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));

  React.useEffect(()=>{
    if(entryType==='collection'){
      const payment=unallocatedPayments.find(item=>item.id===sourceId)??unallocatedPayments[0];setSourceId(payment?.id||'');setEntryAmount(payment?.amount||'');setReference(payment?.reference||payment?.invoiceNumber||'');setFromAccountId('');setToAccountId(activeAccounts.find(account=>account.currency===payment?.currency)?.id||'');
    }else if(entryType==='supplier-payment'){
      const payment=unallocatedSupplierPayments.find(item=>item.id===sourceId)??unallocatedSupplierPayments[0];setSourceId(payment?.id||'');setEntryAmount(payment?.amount||'');setReference(payment?.reference||payment?.purchaseNumber||'');setToAccountId('');setFromAccountId(activeAccounts.find(account=>account.currency===payment?.currency)?.id||'');
    }else setSourceId('');
  },[entryType]);

  const run=async(key:string,fn:()=>Promise<void>)=>{if(busy)return;setBusy(key);setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:t('Unable to update the treasury ledger.','تعذر تحديث دفتر الخزينة.'));}finally{setBusy('');}};

  const addAccount=()=>void run('account',async()=>{
    const result=await mutateVaultSafely(vault=>{
      const account=createTreasuryAccount({label:accountName,kind:accountKind,currency:accountCurrency,bankAccountId:accountKind==='bank'?bankAccountId:'',workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId});
      const nextAccounts=[...vault.treasuryAccounts,account];let nextEntries=vault.treasuryEntries;
      if(openingBalance.trim()&&openingBalance.trim()!=='0'&&openingBalance.trim()!=='0.00'){
        const opening=createTreasuryEntry({type:'opening-balance',date:todayIso(),amount:openingBalance,currency:account.currency,toAccountId:account.id,reference:t('Opening balance','رصيد افتتاحي'),workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId},nextAccounts);
        nextEntries=[...nextEntries,opening];
      }
      return{...vault,treasuryAccounts:nextAccounts,treasuryEntries:nextEntries};
    });
    setAccounts(result.treasuryAccounts);setAccountName('');setOpeningBalance('');setBankAccountId('');
  });

  const saveEntry=()=>void run('entry',async()=>{
    const result=await mutateVaultSafely(vault=>{
      const ledgerAccounts=vault.treasuryAccounts;let amount=entryAmount,currency='',from=fromAccountId,to=toAccountId,sourceType:'manual'|'customer-payment'|'supplier-payment'='manual',linkedSourceId='';
      if(entryType==='collection'){
        const payment=vault.payments.find(item=>item.id===sourceId);if(!payment)throw new Error(t('Choose an unallocated customer payment.','اختر دفعة عميل غير مخصصة.'));if(treasuryLinkedSourceUsed(vault.treasuryEntries,'customer-payment',payment.id))throw new Error(t('This customer payment is already allocated.','تم تخصيص دفعة العميل هذه مسبقًا.'));amount=payment.amount;currency=payment.currency;sourceType='customer-payment';linkedSourceId=payment.id;from='';
      }else if(entryType==='supplier-payment'){
        const payment=vault.supplierPayments.find(item=>item.id===sourceId);if(!payment)throw new Error(t('Choose an unallocated supplier payment.','اختر دفعة مورد غير مخصصة.'));if(treasuryLinkedSourceUsed(vault.treasuryEntries,'supplier-payment',payment.id))throw new Error(t('This supplier payment is already allocated.','تم تخصيص دفعة المورد هذه مسبقًا.'));amount=payment.amount;currency=payment.currency;sourceType='supplier-payment';linkedSourceId=payment.id;to='';
      }else if(entryType==='transfer'){
        const fromAccount=ledgerAccounts.find(item=>item.id===from),toAccount=ledgerAccounts.find(item=>item.id===to);if(!fromAccount||!toAccount||fromAccount.currency!==toAccount.currency)throw new Error(t('Transfers require two treasury accounts in the same currency.','التحويلات تتطلب حسابي خزينة بالعملة نفسها.'));currency=fromAccount.currency;
      }else if(entryType==='reconciliation'){
        if(reconciliationDirection==='in'){from='';currency=ledgerAccounts.find(item=>item.id===to)?.currency||'';}else{to='';currency=ledgerAccounts.find(item=>item.id===from)?.currency||'';}
      }else if(entryType==='deposit'||entryType==='opening-balance'){from='';currency=ledgerAccounts.find(item=>item.id===to)?.currency||'';}
      else{to='';currency=ledgerAccounts.find(item=>item.id===from)?.currency||'';}
      const entry=createTreasuryEntry({type:entryType,date:entryDate,amount,currency,fromAccountId:from,toAccountId:to,sourceType,sourceId:linkedSourceId,reference,notes,workspaceId:vault.appSettings.activeWorkspaceId,branchId:vault.appSettings.activeBranchId},ledgerAccounts);
      return{...vault,treasuryEntries:[...vault.treasuryEntries,entry]};
    });
    setAccounts(result.treasuryAccounts);setEntryAmount('');setReference('');setNotes('');setSourceId('');
  });

  const toggleReconciled=(entry:TreasuryLedgerRecord)=>void run(`reconcile-${entry.id}`,async()=>{await mutateVaultSafely(vault=>({...vault,treasuryEntries:vault.treasuryEntries.map(item=>item.id===entry.id?markTreasuryEntryReconciled(item,!item.reconciledAt):item)}));});
  const voidEntry=(entry:TreasuryLedgerRecord)=>void run(`void-${entry.id}`,async()=>{const reason=(voidReasons[entry.id]||'').trim();await mutateVaultSafely(vault=>({...vault,treasuryEntries:vault.treasuryEntries.map(item=>item.id===entry.id?voidTreasuryEntry(item,reason):item)}));setVoidReasons(current=>({...current,[entry.id]:''}));});

  const sourceCurrency=entryType==='collection'?props.payments.find(item=>item.id===sourceId)?.currency:entryType==='supplier-payment'?props.supplierPayments.find(item=>item.id===sourceId)?.currency:'';
  const accountOptions=(side:'from'|'to')=>activeAccounts.filter(account=>!sourceCurrency||account.currency===sourceCurrency).filter(account=>side==='from'||account.id!==fromAccountId);

  return <section className="ta-finance-page lx-treasury-ledger">
    <header className="ta-page-header"><div><span className="ta-page-kicker">{t('Cash & Bank','النقد والبنوك')}</span><h2>{t('Treasury Ledger','دفتر الخزينة')}</h2><p>{t('Cash position comes only from explicit treasury accounts and ledger entries. Company bank details stay descriptive and never create a balance.','يأتي المركز النقدي فقط من حسابات الخزينة وقيود الدفتر الصريحة. تبقى بيانات بنك الشركة وصفية ولا تنشئ رصيدًا.')}</p></div></header>

    <section className="ta-report-kpi-grid">{activeAccounts.length?activeAccounts.map(account=><article className="ta-report-kpi" key={account.id}><header><span>{account.label}</span><small>{account.kind==='bank'?t('Bank','بنك'):t('Cash','نقد')} · {account.currency}</small></header><div className="ta-report-kpi-primary"><div><span>{t('Ledger balance','رصيد الدفتر')}</span><strong>{formatMoney(treasuryAccountBalance(account.id,props.treasuryEntries),account.currency)}</strong></div></div><p className="lx-finance-disclaimer">{t('Calculated only from non-voided entries linked to this account.','محسوب فقط من القيود غير الملغاة المرتبطة بهذا الحساب.')}</p></article>):<div className="ta-empty-card">{t('Create a treasury account before recording cash position.','أنشئ حساب خزينة قبل تسجيل المركز النقدي.')}</div>}</section>

    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Financial account','حساب مالي')}</span><h3>{t('Add cash or bank ledger account','إضافة حساب دفتر نقدي أو بنكي')}</h3></div></header><div className="lx-form-grid"><label><span>{t('Account name','اسم الحساب')}</span><Input value={accountName} onChange={(e:any)=>setAccountName(e.target.value)}/></label><label><span>{t('Type','النوع')}</span><Select value={accountKind} onChange={(e:any)=>setAccountKind(e.target.value)}><option value="bank">{t('Bank','بنك')}</option><option value="cash">{t('Cash','نقد')}</option></Select></label><label><span>{t('Currency','العملة')}</span><Input dir="ltr" maxLength={3} value={accountCurrency} onChange={(e:any)=>setAccountCurrency(String(e.target.value).toUpperCase())}/></label>{accountKind==='bank'?<label><span>{t('Bank metadata link (optional)','ربط بيانات البنك (اختياري)')}</span><Select value={bankAccountId} onChange={(e:any)=>setBankAccountId(e.target.value)}><option value="">{t('No metadata link','بدون ربط')}</option>{bankMetadata.map(item=><option key={item.id} value={item.id}>{item.label} · {item.currency}</option>)}</Select></label>:null}<label><span>{t('Opening balance (optional)','الرصيد الافتتاحي (اختياري)')}</span><Input inputMode="decimal" value={openingBalance} onChange={(e:any)=>setOpeningBalance(e.target.value)}/></label></div><Button variant="primary" icon="plus" disabled={Boolean(busy)} onClick={addAccount}>{t('Create ledger account','إنشاء حساب دفتر')}</Button></section>

    <section className="ta-panel lx-treasury-entry"><header className="ta-panel-header"><div><span>{t('New treasury entry','قيد خزينة جديد')}</span><h3>{t('Record auditable movement','تسجيل حركة قابلة للتدقيق')}</h3></div></header><div className="lx-form-grid"><label><span>{t('Entry type','نوع القيد')}</span><Select value={entryType} onChange={(e:any)=>setEntryType(e.target.value)}><option value="deposit">{t('Deposit','إيداع')}</option><option value="withdrawal">{t('Withdrawal','سحب')}</option><option value="transfer">{t('Transfer','تحويل')}</option><option value="collection">{t('Customer collection','تحصيل عميل')}</option><option value="supplier-payment">{t('Supplier payment','دفعة مورد')}</option><option value="reconciliation">{t('Reconciliation adjustment','تسوية مطابقة')}</option></Select></label><label><span>{t('Date','التاريخ')}</span><Input type="date" value={entryDate} onChange={(e:any)=>setEntryDate(e.target.value)}/></label>
      {entryType==='collection'?<label><span>{t('Customer payment','دفعة العميل')}</span><Select value={sourceId} onChange={(e:any)=>{const id=e.target.value,p=props.payments.find(item=>item.id===id);setSourceId(id);setEntryAmount(p?.amount||'');setReference(p?.reference||p?.invoiceNumber||'');setToAccountId(activeAccounts.find(account=>account.currency===p?.currency)?.id||'');}}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedPayments.map(item=><option key={item.id} value={item.id}>{item.invoiceNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:entryType==='supplier-payment'?<label><span>{t('Supplier payment','دفعة المورد')}</span><Select value={sourceId} onChange={(e:any)=>{const id=e.target.value,p=props.supplierPayments.find(item=>item.id===id);setSourceId(id);setEntryAmount(p?.amount||'');setReference(p?.reference||p?.purchaseNumber||'');setFromAccountId(activeAccounts.find(account=>account.currency===p?.currency)?.id||'');}}><option value="">{t('Choose payment','اختر دفعة')}</option>{unallocatedSupplierPayments.map(item=><option key={item.id} value={item.id}>{item.purchaseNumber} · {formatMoney(item.amount,item.currency)}</option>)}</Select></label>:null}
      {entryType==='reconciliation'?<label><span>{t('Direction','الاتجاه')}</span><Select value={reconciliationDirection} onChange={(e:any)=>setReconciliationDirection(e.target.value)}><option value="in">{t('Increase account','زيادة الحساب')}</option><option value="out">{t('Decrease account','خفض الحساب')}</option></Select></label>:null}
      {(entryType==='withdrawal'||entryType==='supplier-payment'||entryType==='transfer'||entryType==='reconciliation'&&reconciliationDirection==='out')?<label><span>{t('From account','من حساب')}</span><Select value={fromAccountId} onChange={(e:any)=>setFromAccountId(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('from').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}
      {(entryType==='deposit'||entryType==='collection'||entryType==='transfer'||entryType==='reconciliation'&&reconciliationDirection==='in')?<label><span>{t('To account','إلى حساب')}</span><Select value={toAccountId} onChange={(e:any)=>setToAccountId(e.target.value)}><option value="">{t('Choose account','اختر حسابًا')}</option>{accountOptions('to').map(account=><option key={account.id} value={account.id}>{accountLabel(account)}</option>)}</Select></label>:null}
      {entryType!=='collection'&&entryType!=='supplier-payment'?<label><span>{t('Amount','المبلغ')}</span><Input inputMode="decimal" value={entryAmount} onChange={(e:any)=>setEntryAmount(e.target.value)}/></label>:null}<label><span>{t('Reference','المرجع')}</span><Input value={reference} onChange={(e:any)=>setReference(e.target.value)}/></label><label className="lx-form-wide"><span>{t('Notes','ملاحظات')}</span><Textarea rows={2} value={notes} onChange={(e:any)=>setNotes(e.target.value)}/></label></div>{error?<p className="lifecycle-error" role="alert">{error}</p>:null}<Button variant="primary" icon="plus" disabled={Boolean(busy)||!activeAccounts.length} onClick={saveEntry}>{t('Record ledger entry','تسجيل قيد الدفتر')}</Button></section>

    <section className="ta-panel"><header className="ta-panel-header"><div><span>{t('Audit & reconciliation','التدقيق والمطابقة')}</span><h3>{t('Treasury ledger entries','قيود دفتر الخزينة')}</h3></div><div className="ta-panel-status">{entries.length}</div></header><div className="ta-table-wrap"><table className="ta-table"><thead><tr><th>{t('Date','التاريخ')}</th><th>{t('Type','النوع')}</th><th>{t('Account path','مسار الحساب')}</th><th>{t('Amount','المبلغ')}</th><th>{t('Status','الحالة')}</th><th>{t('Actions','الإجراءات')}</th></tr></thead><tbody>{entries.map(entry=><tr key={entry.id}><td>{displayDate(entry.date,getUiLanguage())}</td><td><strong>{entryLabel(entry.type)}</strong><small>{entry.reference||'—'}</small></td><td>{entry.fromAccountId?accountLabel(accounts.find(item=>item.id===entry.fromAccountId)):t('External','خارجي')} → {entry.toAccountId?accountLabel(accounts.find(item=>item.id===entry.toAccountId)):t('External','خارجي')}</td><td>{formatMoney(entry.amount,entry.currency)}</td><td>{entry.voidedAt?<span className="lx-share-chip is-rejected">{t('Voided','ملغى')}</span>:entry.reconciledAt?<span className="lx-share-chip is-accepted">{t('Reconciled','مطابق')}</span>:<span className="lx-share-chip is-active">{t('Open','مفتوح')}</span>}</td><td>{entry.voidedAt?<small>{entry.voidReason}</small>:<div className="lx-row-actions"><Button disabled={Boolean(busy)} onClick={()=>toggleReconciled(entry)}>{entry.reconciledAt?t('Undo reconcile','إلغاء المطابقة'):t('Reconcile','مطابقة')}</Button><Input placeholder={t('Void reason','سبب الإلغاء')} value={voidReasons[entry.id]||''} onChange={(e:any)=>setVoidReasons(current=>({...current,[entry.id]:e.target.value}))}/><Button variant="danger" disabled={Boolean(busy)} onClick={()=>voidEntry(entry)}>{t('Void','إلغاء')}</Button></div>}</td></tr>)}</tbody></table></div></section>
  </section>;
}
"""
write("src/components/TreasuryLedgerPage.tsx", treasury_page)

# 7) Harden contracts to lock the frozen Treasury blueprint.
path = "tests/roadmap-hardening-v473.test.mjs"
text = read(path)
text = text.replace(
    "delete legacy.treasuryEntries;delete legacy.treasuryReconciliations;delete legacy.fxRates;delete legacy.warehouses;",
    "delete legacy.treasuryAccounts;delete legacy.treasuryEntries;delete legacy.treasuryReconciliations;delete legacy.fxRates;delete legacy.warehouses;",
    1,
)
text = text.replace(
    "assert.deepEqual(migrated.treasuryEntries,[]);assert.deepEqual(migrated.treasuryReconciliations,[]);assert.deepEqual(migrated.fxRates,[]);",
    "assert.deepEqual(migrated.treasuryAccounts,[]);assert.deepEqual(migrated.treasuryEntries,[]);assert.deepEqual(migrated.treasuryReconciliations,[]);assert.deepEqual(migrated.fxRates,[]);",
    1,
)
marker = "test('treasury projection stays currency-separated, keeps transfers internal, and reconciles exact movement keys',async()=>{"
if marker not in text:
    raise SystemExit("roadmap treasury test marker missing")
account_test = r"""
test('treasury accounts own opening balances, linked settlements, immutable corrections and account-derived balances',async()=>{
  const {createTreasuryAccount,createTreasuryEntry,treasuryAccountBalance,treasuryLinkedSourceUsed,voidTreasuryEntry,markTreasuryEntryReconciled}=await import('../dist/src/lib/treasury-ledger.js');
  const a=createTreasuryAccount({label:'Main Bank',kind:'bank',currency:'USD',workspaceId:'default',branchId:'main'});
  const b=createTreasuryAccount({label:'Cash Box',kind:'cash',currency:'USD',workspaceId:'default',branchId:'main'});
  const accounts=[a,b];
  const opening=createTreasuryEntry({type:'opening-balance',date:'2026-01-01',amount:'1000',currency:'USD',toAccountId:a.id,workspaceId:'default',branchId:'main'},accounts);
  const transfer=createTreasuryEntry({type:'transfer',date:'2026-01-02',amount:'250',currency:'USD',fromAccountId:a.id,toAccountId:b.id,workspaceId:'default',branchId:'main'},accounts);
  const collection=createTreasuryEntry({type:'collection',date:'2026-01-03',amount:'100',currency:'USD',toAccountId:a.id,sourceType:'customer-payment',sourceId:'pay-1',workspaceId:'default',branchId:'main'},accounts);
  const entries=[opening,transfer,collection];
  assert.equal(treasuryAccountBalance(a.id,entries),'850.00');
  assert.equal(treasuryAccountBalance(b.id,entries),'250.00');
  assert.equal(treasuryLinkedSourceUsed(entries,'customer-payment','pay-1'),true);
  assert.throws(()=>createTreasuryEntry({type:'transfer',date:'2026-01-04',amount:'1',currency:'EUR',fromAccountId:a.id,toAccountId:b.id,workspaceId:'default',branchId:'main'},accounts),/currency/i);
  const reconciled=markTreasuryEntryReconciled(collection,true);assert.ok(reconciled.reconciledAt);
  const voided=voidTreasuryEntry(transfer,'Correction');assert.ok(voided.voidedAt);assert.equal(treasuryAccountBalance(a.id,[opening,voided,collection]),'1100.00');
});

"""
text = text.replace(marker, account_test + marker, 1)
text = text.replace(
    "assert.match(types,/TreasuryLedgerRecord/);assert.match(types,/FxRateRecord/);",
    "assert.match(types,/TreasuryAccountRecord/);assert.match(types,/TreasuryLedgerRecord/);assert.match(types,/FxRateRecord/);",
    1,
)
write(path, text)

print("Treasury accounts hardening applied.")
