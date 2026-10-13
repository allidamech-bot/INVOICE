import type {VaultPayload} from '../types.js';
import {scopeVault} from './workspaces.js';
import {customerReceivables,receivableCustomerId} from './receivables.js';
import {decimalToScaled} from './money.js';
import {todayIso} from './id.js';

/** Only the user's current message can request a receivables ranking. */
export function isAiReceivablesRankingIntent(message:string):boolean{
 const text=String(message||'').normalize('NFKC').trim();
 if(!text||text.length>600)return false;
 return /(?:أعلى|اعلى|أكبر|اكبر|أكثر|اكثر|top|highest|biggest|largest|most)/iu.test(text)&&
  /(?:العملاء|عملاء|العميل|عميل|الزبائن|زبائن|الزبون|زبون|customers?|clients?)/iu.test(text)&&
  /(?:ذمم|مديون|ديون|دين|مستحق|متأخر|receivabl|outstanding|overdue|debts?|unpaid|owing|owe)/iu.test(text);
}
export function aiReceivablesRanking(vault:VaultPayload,message:string,language:'ar'|'en',today=todayIso()):string{
 const ar=language==='ar';
 if(!isAiReceivablesRankingIntent(message))throw new Error('Not an explicit customer receivables ranking question.');
 const overdue=/(?:متأخر|overdue|late)/iu.test(message),metric=overdue?'overdue':'outstanding';
 const scoped=scopeVault(vault);
 const rows=customerReceivables(scoped.customers,scoped.documents,scoped.payments,today);
 const groups=new Map<string,Array<{customerId:string;name:string;amount:string;scaled:bigint}>>();
 for(const customer of rows){
  for(const balance of customer.currencies){
   const amount=balance[metric],scaled=decimalToScaled(amount,2);
   if(scaled<=0n)continue;
   const snapshot=scoped.documents.find(doc=>doc.kind==='invoice'&&doc.status==='final'&&
     doc.lifecycleStatus!=='voided'&&receivableCustomerId(doc)===customer.customerId)?.customerSnapshot;
   const name=(ar?customer.customer?.companyNameAr||customer.customer?.companyNameEn:
     customer.customer?.companyNameEn||customer.customer?.companyNameAr)||
     snapshot?.companyNameEn||snapshot?.companyNameAr||customer.customerId;
   const list=groups.get(balance.currency)||[];
   list.push({customerId:customer.customerId,name:String(name).slice(0,160),amount,scaled});
   groups.set(balance.currency,list);
  }
 }
 if(!groups.size)return ar
  ?'لا توجد مبالغ '+(overdue?'متأخرة':'مستحقة')+' مثبتة على العملاء بفواتير صادرة في الشركة والفرع الحاليين. المسودات غير الصادرة ليست ذممًا.'
  :'No recorded '+(overdue?'overdue':'outstanding')+' customer balances from issued invoices in the current company and branch. Unissued drafts are not receivables.';
 const lines=[ar?(overdue?'العملاء الأعلى بالذمم المتأخرة:':'العملاء الأعلى بالذمم المستحقة:'):
  (overdue?'Customers with the highest overdue balances:':'Customers with the highest outstanding balances:')];
 const currencies=[...groups.keys()].sort();
 for(const currency of currencies.slice(0,8)){
  const entries=groups.get(currency)!.sort((a,b)=>a.scaled===b.scaled?
   a.name.localeCompare(b.name):a.scaled>b.scaled?-1:1);
  lines.push('',currency+':');
  entries.slice(0,5).forEach((item,index)=>lines.push((index+1)+'. '+item.name+' — '+item.amount+' '+currency));
  if(entries.length>5)lines.push(ar?'هناك '+(entries.length-5)+' عملاء إضافيون غير معروضين.':(entries.length-5)+' more customers not shown.');
 }
 if(currencies.length>8)lines.push(ar?'هناك '+(currencies.length-8)+' عملات أخرى لم تعرض في هذا الملخص.':(currencies.length-8)+' other currencies are not shown in this summary.');
 lines.push('',ar
  ?'المصدر: فواتير LOUREX الصادرة والتحصيلات المسجلة حتى '+today+'. لم تُجمع العملات المختلفة ولم تُحتسب المسودات.'
  :'Source: LOUREX issued invoices and recorded collections through '+today+'. Different currencies were not added together, and unsaved/unissued drafts were excluded.');
 return lines.join('\n');
}
