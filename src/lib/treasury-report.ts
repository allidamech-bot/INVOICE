import type { ExpenseRecord, PaymentRecord, SupplierPaymentRecord, TreasuryAccountRecord, TreasuryLedgerRecord, TreasuryReconciliationRecord } from '../types.js';
import { isIsoDate } from './id.js';
import { decimalToScaled, isNonNegativeDecimalInput } from './money.js';
import { treasuryAccountBalanceScaled, treasuryProjection, type TreasuryProjectionRow } from './treasury-ledger.js';
import { t } from './i18n.js';

export interface TreasuryReportInput {
  workspaceId:string; branchId:string; from:string; to:string; currency?:string; accountId?:string; defaultCurrency?:string;
  accounts:TreasuryAccountRecord[]; entries:TreasuryLedgerRecord[]; payments:PaymentRecord[];
  supplierPayments:SupplierPaymentRecord[]; expenses:ExpenseRecord[]; reconciliations:TreasuryReconciliationRecord[];
}
export interface TreasuryReportMovement {key:string;date:string;reference:string;description:string;type:string;amount:string;status:'reconciled'|'open'|'void';}
export interface TreasuryReportAccount {id:string;label:string;currency:string;active:boolean;opening:string;change:string;closing:string;movements:TreasuryReportMovement[];}
export interface TreasuryPeriodReport {workspaceId:string;branchId:string;from:string;to:string;currency:string;accountId:string;accounts:TreasuryReportAccount[];unallocated:TreasuryProjectionRow[];}
const money=(v:bigint):string=>`${v<0n?'-':''}${(v<0n?-v:v)/100n}.${String((v<0n?-v:v)%100n).padStart(2,'0')}`;
export function treasuryPeriodReport(input:TreasuryReportInput):TreasuryPeriodReport {
  if(!isIsoDate(input.from)||!isIsoDate(input.to)||input.from>input.to)throw new Error(t('Choose a valid report period.','اختر فترة تقرير صحيحة.'));
  const scope=(row:{workspaceId?:string;branchId?:string})=>(row.workspaceId||'default')===input.workspaceId&&(row.branchId||'main')===input.branchId;
  const accounts=input.accounts.filter(scope),entries=input.entries.filter(scope),reconciliations=input.reconciliations.filter(scope);
  const projection=treasuryProjection(input.payments.filter(scope),input.supplierPayments.filter(scope),input.expenses.filter(scope),entries,reconciliations,input.defaultCurrency||'USD',input.to);
  const currency=input.currency||'ALL',accountId=input.accountId||'ALL';
  if(accountId!=='ALL'&&!accounts.some(a=>a.id===accountId&&(currency==='ALL'||a.currency===currency)))throw new Error(t('Choose an available report account.','اختر حساب تقرير متاحًا.'));
  const previous=new Date(input.from+'T00:00:00.000Z');previous.setUTCDate(previous.getUTCDate()-1);const before=previous.toISOString().slice(0,10);
  const result:TreasuryPeriodReport={workspaceId:input.workspaceId,branchId:input.branchId,from:input.from,to:input.to,currency,accountId,accounts:[],unallocated:accountId==='ALL'?projection.filter(r=>!r.fromAccountId&&!r.toAccountId&&r.date>=input.from&&(currency==='ALL'||r.currency===currency)).map(r=>{if(!isNonNegativeDecimalInput(r.amount))throw new Error(t('Report amount is invalid.','مبلغ التقرير غير صالح.'));return {...r,amount:money(decimalToScaled(r.amount,2))};}):[]};
  for(const account of accounts.filter(a=>(accountId==='ALL'||a.id===accountId)&&(currency==='ALL'||a.currency===currency))){
    const related=entries.filter(e=>e.fromAccountId===account.id||e.toAccountId===account.id);
    // Historical ledger rows can predate the current posting validators. Never
    // present a balance in this account's currency if an effective dated entry
    // belongs to another currency: there is no implicit FX conversion.
    if(related.some(e=>e.date<=input.to&&e.currency.trim().toUpperCase()!==account.currency.trim().toUpperCase()))
      throw new Error(t('Treasury entry currency does not match its account. Review the ledger before reporting.','عملة قيد الخزينة لا تطابق عملة الحساب. راجع الدفتر قبل إصدار التقرير.'));
    if(!account.active&&!related.some(e=>e.date<=input.to))continue;
    const opening=treasuryAccountBalanceScaled(account.id,related,before),closing=treasuryAccountBalanceScaled(account.id,related,input.to),movements:TreasuryReportMovement[]=[];
    for(const entry of related){
      if(entry.date>input.to)continue;
      if(!isNonNegativeDecimalInput(entry.amount))throw new Error(t('Report amount is invalid.','مبلغ التقرير غير صالح.'));
      const voidDate=entry.voidedAt?.slice(0,10)||'';
      // Canonical balances exclude a void from its effective date. A void
      // before the movement date has never contributed to any daily balance.
      if(voidDate&&voidDate<entry.date)continue;
      const signed=decimalToScaled(entry.amount,2)*(entry.toAccountId===account.id?1n:0n)-decimalToScaled(entry.amount,2)*(entry.fromAccountId===account.id?1n:0n);
      const projected=projection.find(r=>r.key===`treasury:${entry.id}`);
      const common={reference:entry.reference,description:projected?.label||entry.notes||entry.reference,type:entry.type};
      if(entry.date>=input.from&&entry.date<=input.to)movements.push({...common,key:entry.id,date:entry.date,amount:money(signed),status:voidDate&&voidDate<=input.to?'void':projected?.reconciled?'reconciled':'open'});
      if(voidDate&&voidDate>=input.from&&voidDate<=input.to&&entry.date<=input.to)movements.push({...common,key:entry.id+':void',date:voidDate,description:entry.voidReason||'',type:'void',amount:money(-signed),status:'void'});
    }
    movements.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
    if(movements.reduce((sum,m)=>sum+decimalToScaled(m.amount,2),opening)!==closing)throw new Error(t('Report movements do not match the ledger balance.','حركات التقرير لا تطابق رصيد الدفتر.'));
    result.accounts.push({id:account.id,label:account.label,currency:account.currency,active:account.active,opening:money(opening),change:money(closing-opening),closing:money(closing),movements});
  }
  return result;
}
export function treasuryReportStatus(status:string):string{return status==='void'?t('Voided','ملغى'):status==='reconciled'?t('Reconciled','مطابق'):t('Open','غير مطابق');}
export function treasuryReportType(type:string):string {const labels:Record<string,[string,string]>={'opening-balance':['Opening balance','رصيد افتتاحي'],deposit:['Deposit','إيداع'],withdrawal:['Withdrawal','سحب'],transfer:['Transfer','تحويل'],collection:['Collection','تحصيل'],'supplier-payment':['Supplier payment','دفعة مورد'],expense:['Expense','مصروف'],reconciliation:['Adjustment','تسوية'],void:['Void effect','أثر الإلغاء']};const label=labels[type];return label?t(...label):type;}
export function treasuryReportCsv(report:TreasuryPeriodReport):string {
  // All user-provided text is treated as text, even a numeric-looking label.
  const cell=(value:string,numeric=false):string=>{const text=!(numeric&&/^-?\d+\.\d{2}$/.test(value))&&/^[\s]*[=+@\-\t\r]/.test(value)?"'"+value:value;return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;};
  const lines:string[][]=[[t('Section','القسم'),t('Account','الحساب'),t('Currency','العملة'),t('Date','التاريخ'),t('Type','النوع'),t('Reference','المرجع'),t('Description','الوصف'),t('Amount','المبلغ'),t('Status','الحالة'),t('Company scope','نطاق الشركة'),t('Branch scope','نطاق الفرع')]];
  const add=(section:string,account:string,currency:string,date:string,type:string,reference:string,description:string,amount:string,status:string)=>lines.push([section,account,currency,date,type,reference,description,amount,status,report.workspaceId,report.branchId]);
  for(const a of report.accounts){add(t('Account ledger','دفتر الحساب'),a.label,a.currency,report.from,t('Opening balance','رصيد افتتاحي'),'','',a.opening,'');for(const m of a.movements)add(t('Account ledger','دفتر الحساب'),a.label,a.currency,m.date,treasuryReportType(m.type),m.reference,m.description,m.amount,treasuryReportStatus(m.status));add(t('Account ledger','دفتر الحساب'),a.label,a.currency,report.to,t('Closing balance','رصيد الإقفال'),'','',a.closing,'');}
  for(const r of report.unallocated)add(t('Unallocated — excluded from account balances','غير مخصص — مستبعد من أرصدة الحسابات'),'—',r.currency,r.date,treasuryReportType(r.source),r.reference,r.label,(r.direction==='out'?'-':'')+r.amount,treasuryReportStatus(r.reconciled?'reconciled':'open'));
  return '\uFEFF'+lines.map((row,index)=>row.map((value,column)=>cell(value,index>0&&column===7)).join(',')).join('\r\n');
}
