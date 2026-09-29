import type { VaultPayload } from '../types.js';
import { buildAiBusinessContext, type AiCustomerInsight } from './ai-business.js';

export interface CollectionTask{
  customerId:string;
  customerName:string;
  priority:AiCustomerInsight['followUpPriority'];
  averageDaysToPay:number|null;
  averageDaysLate:number|null;
  riskSignals:string[];
  currencies:AiCustomerInsight['currencies'];
}

const PRIORITY:Record<CollectionTask['priority'],number>={high:2,medium:1,normal:0};
function hasExposure(row:AiCustomerInsight):boolean{return row.currencies.some(currency=>Number(currency.outstanding)>0||Number(currency.overdue)>0);}
function agingWeight(row:Pick<CollectionTask,'currencies'>):number{return row.currencies.reduce((score,currency)=>score+currency.overdueInvoices*20+(Number(currency.aging.days90plus)>0?10:0)+(Number(currency.aging.days61to90)>0?6:0)+(Number(currency.aging.days31to60)>0?3:0),0);}

export function buildCollectionTasks(vault:VaultPayload):CollectionTask[]{
  const customers=buildAiBusinessContext(vault).customers.rows.filter(hasExposure);
  return customers.map(row=>({customerId:row.customerId,customerName:row.customerName,priority:row.followUpPriority,averageDaysToPay:row.averageDaysToPay,averageDaysLate:row.averageDaysLate,riskSignals:[...row.riskSignals],currencies:row.currencies.map(currency=>({...currency,aging:{...currency.aging}}))}))
    .sort((a,b)=>PRIORITY[b.priority]-PRIORITY[a.priority]||agingWeight(b)-agingWeight(a)||a.customerName.localeCompare(b.customerName));
}

export function collectionContextText(vault:VaultPayload,limit=3):string{
  const tasks=buildCollectionTasks(vault).slice(0,Math.max(1,Math.min(5,limit)));
  if(!tasks.length)return'No customers currently have recorded open receivable exposure.';
  return tasks.map(task=>{
    const money=task.currencies.map(row=>`${row.currency}: outstanding ${row.outstanding}, overdue ${row.overdue}, open ${row.openInvoices}, overdue invoices ${row.overdueInvoices}, aging 31-60 ${row.aging.days31to60}, 61-90 ${row.aging.days61to90}, 90+ ${row.aging.days90plus}`).join(' | ');
    const behavior=[task.averageDaysToPay===null?'':`avg pay ${task.averageDaysToPay}d`,task.averageDaysLate===null?'':`avg late ${task.averageDaysLate}d`,task.riskSignals.length?`signals ${task.riskSignals.join(',')}`:''].filter(Boolean).join('; ');
    return `${task.customerName} [${task.priority}] ${money}${behavior?`; ${behavior}`:''}`;
  }).join('\n');
}
