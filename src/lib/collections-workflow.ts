import type { LourexDocument, VaultPayload } from '../types.js';
import { buildAiBusinessContext, type AiCustomerInsight } from './ai-business.js';
import { invoicePaymentSummary } from './payments.js';
import { todayIso } from './id.js';
import { receivableCustomerId } from './receivables.js';

export interface CollectionInvoiceReference{
  invoiceId:string;
  number:string;
  dueDate:string;
  currency:string;
  remaining:string;
  status:'unpaid'|'partially-paid'|'paid'|'overdue';
}
export interface CollectionTask{
  customerId:string;
  customerName:string;
  priority:AiCustomerInsight['followUpPriority'];
  averageDaysToPay:number|null;
  averageDaysLate:number|null;
  riskSignals:string[];
  currencies:AiCustomerInsight['currencies'];
  oldestOpenInvoice:CollectionInvoiceReference|null;
  openInvoices:CollectionInvoiceReference[];
  lastActivity:string;
}

const PRIORITY:Record<CollectionTask['priority'],number>={high:2,medium:1,normal:0};
function hasExposure(row:AiCustomerInsight):boolean{return row.currencies.some(currency=>Number(currency.outstanding)>0||Number(currency.overdue)>0);}
function agingWeight(row:Pick<CollectionTask,'currencies'>):number{return row.currencies.reduce((score,currency)=>score+currency.overdueInvoices*20+(Number(currency.aging.days90plus)>0?10:0)+(Number(currency.aging.days61to90)>0?6:0)+(Number(currency.aging.days31to60)>0?3:0),0);}
function onOrBefore(value:string,asOf:string):boolean{const date=(value||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&date<=asOf;}
function customerInvoices(vault:VaultPayload,customerId:string,asOf:string):LourexDocument[]{return vault.documents.filter(doc=>doc.kind==='invoice'&&doc.role!=='credit-note'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&receivableCustomerId(doc)===customerId&&onOrBefore(doc.issueDate,asOf));}
function invoiceRefs(vault:VaultPayload,customerId:string,asOf:string):CollectionInvoiceReference[]{
  return customerInvoices(vault,customerId,asOf).map(invoice=>{const summary=invoicePaymentSummary(invoice,vault.payments,asOf,vault.documents);return{invoiceId:invoice.id,number:invoice.number,dueDate:invoice.dueDate,currency:invoice.currency,remaining:summary.remaining,status:summary.status};}).filter(row=>row.status!=='paid'&&Number(row.remaining)>0).sort((a,b)=>(a.dueDate||'9999-99-99').localeCompare(b.dueDate||'9999-99-99')||a.number.localeCompare(b.number));
}
function lastCustomerActivity(vault:VaultPayload,customerId:string,asOf:string):string{
  const stamps:string[]=[];const invoiceCustomers=new Map(vault.documents.filter(doc=>doc.kind==='invoice').map(doc=>[doc.id,receivableCustomerId(doc)]));
  for(const doc of vault.documents)if(receivableCustomerId(doc)===customerId&&doc.lifecycleStatus!=='voided'){const stamp=doc.updatedAt||doc.issueDate;if(onOrBefore(stamp,asOf))stamps.push(stamp);else if(onOrBefore(doc.issueDate,asOf))stamps.push(doc.issueDate);}
  for(const payment of vault.payments)if((payment.customerId===customerId||invoiceCustomers.get(payment.invoiceId)===customerId)&&onOrBefore(payment.date,asOf))stamps.push(payment.updatedAt&&onOrBefore(payment.updatedAt,asOf)?payment.updatedAt:payment.date);
  return stamps.filter(Boolean).sort((a,b)=>b.localeCompare(a))[0]||'';
}

export function buildCollectionTasks(vault:VaultPayload,asOf=todayIso()):CollectionTask[]{
  const customers=buildAiBusinessContext(vault,asOf).customers.rows.filter(hasExposure);
  return customers.map(row=>{const openInvoices=invoiceRefs(vault,row.customerId,asOf);return{customerId:row.customerId,customerName:row.customerName,priority:row.followUpPriority,averageDaysToPay:row.averageDaysToPay,averageDaysLate:row.averageDaysLate,riskSignals:[...row.riskSignals],currencies:row.currencies.map(currency=>({...currency,aging:{...currency.aging}})),oldestOpenInvoice:openInvoices[0]??null,openInvoices,lastActivity:lastCustomerActivity(vault,row.customerId,asOf)};})
    .sort((a,b)=>PRIORITY[b.priority]-PRIORITY[a.priority]||agingWeight(b)-agingWeight(a)||a.customerName.localeCompare(b.customerName));
}

export function collectionContextText(vault:VaultPayload,limit=3,asOf=todayIso()):string{
  const tasks=buildCollectionTasks(vault,asOf).slice(0,Math.max(1,Math.min(5,limit)));if(!tasks.length)return'No customers currently have recorded open receivable exposure.';
  return tasks.map(task=>{
    const money=task.currencies.map(row=>`${row.currency}: outstanding ${row.outstanding}, overdue ${row.overdue}, open ${row.openInvoices}, overdue invoices ${row.overdueInvoices}, aging 31-60 ${row.aging.days31to60}, 61-90 ${row.aging.days61to90}, 90+ ${row.aging.days90plus}`).join(' | ');
    const oldest=task.oldestOpenInvoice?`oldest open ${task.oldestOpenInvoice.number}, due ${task.oldestOpenInvoice.dueDate||'not recorded'}, remaining ${task.oldestOpenInvoice.remaining} ${task.oldestOpenInvoice.currency}`:'';
    const behavior=[task.averageDaysToPay===null?'':`avg pay ${task.averageDaysToPay}d`,task.averageDaysLate===null?'':`avg late ${task.averageDaysLate}d`,oldest,task.lastActivity?`last activity ${task.lastActivity.slice(0,10)}`:'',task.riskSignals.length?`signals ${task.riskSignals.join(',')}`:''].filter(Boolean).join('; ');
    return `${task.customerName} [${task.priority}] ${money}${behavior?`; ${behavior}`:''}`;
  }).join('\n');
}

export function collectionReminderBrief(task:CollectionTask,tone:'gentle'|'firm'='gentle'):string{
  const invoices=task.openInvoices.slice(0,5).map(row=>`${row.number}: ${row.remaining} ${row.currency}${row.dueDate?` due ${row.dueDate}`:''}`).join(' | ');
  return `${tone==='firm'?'Firm':'Gentle'} collection reminder draft only. Customer: ${task.customerName}. Priority: ${task.priority}. ${invoices||'Open invoice details unavailable.'} Do not claim the reminder was sent.`;
}
