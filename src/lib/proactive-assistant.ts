import type { VaultPayload } from '../types.js';
import { commercialTrackingFromEvents, effectiveCommercialStatus, isQuoteLikeDocument } from './commercial-flow.js';
import { whatMattersToday } from './daily-command-center.js';
import { decimalToScaled } from './money.js';
import { buildNotificationCenter, type NotificationItem } from './notification-center.js';
import { inventoryBalances } from './operations.js';
import { customerReceivables } from './receivables.js';
import { todayIso } from './id.js';
import type { AssistantTaskRecord } from '../storage/assistant-task-store.js';

export type ProactiveLevel='info'|'opportunity'|'attention'|'urgent';
export type ProactiveScope='business'|'personal';
export type ProactiveSource='notification'|'daily-command'|'assistant-task';

export interface ProactiveSignal{
  key:string;
  scope:ProactiveScope;
  source:ProactiveSource;
  category:string;
  level:ProactiveLevel;
  title:string;
  detail:string;
  dueAt:string;
  actionLabel:string;
  target:string;
  entityId:string;
  entityNumber:string;
  taskId:string;
  notificationKey:string;
}
export interface MorningBriefSection{scope:ProactiveScope;signals:ProactiveSignal[];urgent:number;attention:number;opportunities:number;}
export interface ProactiveSnapshot{asOf:string;business:MorningBriefSection;personal:MorningBriefSection;top:ProactiveSignal|null;}

const LEVEL_WEIGHT:Record<ProactiveLevel,number>={urgent:4,attention:3,opportunity:2,info:1};
function clean(value:unknown,max=240):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function positive(value:string,scale=2):boolean{try{return decimalToScaled(value||'0',scale)>0n;}catch{return false;}}
function dueNow(task:AssistantTaskRecord,at:string):boolean{const due=task.snoozedUntil||task.dueAt;if(!due)return true;const target=Date.parse(due),current=Date.parse(at);return Number.isFinite(target)&&Number.isFinite(current)&&target<=current;}
function sortSignals(rows:ProactiveSignal[]):ProactiveSignal[]{return [...rows].sort((a,b)=>LEVEL_WEIGHT[b.level]-LEVEL_WEIGHT[a.level]||(a.dueAt||'9999').localeCompare(b.dueAt||'9999')||a.key.localeCompare(b.key));}
function section(scope:ProactiveScope,rows:ProactiveSignal[]):MorningBriefSection{const signals=sortSignals(rows);return{scope,signals,urgent:signals.filter(row=>row.level==='urgent').length,attention:signals.filter(row=>row.level==='attention').length,opportunities:signals.filter(row=>row.level==='opportunity').length};}
function notificationLevel(row:NotificationItem):ProactiveLevel{return row.priority==='high'?'urgent':row.priority==='medium'?'attention':'info';}
function notificationSignal(row:NotificationItem):ProactiveSignal{return{key:`notification:${row.key}`,scope:'business',source:'notification',category:row.kind,level:notificationLevel(row),title:row.titleEn,detail:row.detailEn,dueAt:row.dueDate,actionLabel:'Open',target:row.target,entityId:row.entityId,entityNumber:row.entityNumber,taskId:'',notificationKey:row.key};}
function dailySignals(vault:VaultPayload,asOf:string):ProactiveSignal[]{return whatMattersToday(vault,8,asOf).map(row=>{
  const opportunity=row.kind==='cost-change'&&/cost\s+down/i.test(row.title);
  const level:ProactiveLevel=opportunity?'opportunity':row.priority==='critical'?'urgent':row.priority==='high'?'attention':'info';
  return{key:`daily:${row.key}`,scope:'business',source:'daily-command',category:row.kind,level,title:row.title,detail:row.detail,dueAt:'',actionLabel:row.actionLabel,target:'search',entityId:'',entityNumber:row.searchQuery,taskId:'',notificationKey:''};
});}
function conditionSatisfied(vault:VaultPayload,task:AssistantTaskRecord,asOf:string):boolean{
  if(task.conditionType==='none')return true;
  if(task.conditionType==='document-not-converted'){
    const id=task.relatedEntityType==='document'?task.relatedEntityId:task.conditionValue;
    const doc=vault.documents.find(row=>row.id===id||row.number===id);if(!doc||!isQuoteLikeDocument(doc)||doc.status!=='final'||doc.lifecycleStatus==='voided')return false;
    const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents);return effectiveCommercialStatus(doc,vault.documents,tracking,asOf).status!=='converted';
  }
  if(task.conditionType==='customer-unpaid'){
    const id=task.relatedEntityType==='customer'?task.relatedEntityId:task.conditionValue;if(!id)return false;
    const account=customerReceivables(vault.customers,vault.documents,vault.payments,asOf).find(row=>row.customerId===id);return Boolean(account?.currencies.some(row=>positive(row.outstanding)));
  }
  if(task.conditionType==='stock-below'){
    const itemId=task.relatedEntityType==='product'?task.relatedEntityId:'';if(!itemId)return false;
    const threshold=clean(task.conditionValue,32);let thresholdScaled:bigint;try{thresholdScaled=decimalToScaled(threshold,4);}catch{return false;}
    const balance=inventoryBalances(vault.savedItems,vault.inventoryMovements).find(row=>row.item.id===itemId);return Boolean(balance&&balance.quantityScaled<thresholdScaled);
  }
  return false;
}
export function actionableAssistantTasks(vault:VaultPayload,tasks:AssistantTaskRecord[],scope:ProactiveScope,at=new Date().toISOString()):ProactiveSignal[]{
  const asOf=at.slice(0,10);return tasks.filter(task=>task.scope===scope&&task.status==='open'&&dueNow(task,at)&&(scope==='personal'||conditionSatisfied(vault,task,asOf))).map(task=>({
    key:`task:${task.id}`,scope,source:'assistant-task',category:task.conditionType==='none'?'reminder':task.conditionType,level:scope==='personal'?'attention':task.conditionType==='none'?'attention':'urgent',title:task.title,detail:task.notes||task.conditionType.replaceAll('-',' '),dueAt:task.snoozedUntil||task.dueAt,actionLabel:'Open task',target:'assistant-tasks',entityId:task.relatedEntityId,entityNumber:'',taskId:task.id,notificationKey:''
  }));
}
function dedupeBusiness(rows:ProactiveSignal[]):ProactiveSignal[]{const seen=new Set<string>();const result:ProactiveSignal[]=[];for(const row of sortSignals(rows)){const fingerprint=row.notificationKey?`${row.category}:${row.entityId||row.entityNumber}`:`${row.category}:${row.entityId||row.entityNumber||row.title}`;if(seen.has(fingerprint))continue;seen.add(fingerprint);result.push(row);}return result;}
export function buildProactiveSnapshot(vault:VaultPayload,tasks:AssistantTaskRecord[],input:{at?:string;mutedCategories?:string[]}={}):ProactiveSnapshot{
  const at=input.at??new Date().toISOString(),asOf=at.slice(0,10)||todayIso(),muted=new Set((input.mutedCategories??[]).map(value=>clean(value,80)).filter(Boolean));
  const notifications=buildNotificationCenter(vault,asOf).active.map(notificationSignal);
  const business=dedupeBusiness([...notifications,...dailySignals(vault,asOf),...actionableAssistantTasks(vault,tasks,'business',at)]).filter(row=>!muted.has(row.category)).slice(0,12);
  const personal=sortSignals(actionableAssistantTasks(vault,tasks,'personal',at).filter(row=>!muted.has(`personal:${row.category}`))).slice(0,8);
  const businessSection=section('business',business),personalSection=section('personal',personal);
  const top=sortSignals([...business.filter(row=>row.level==='urgent'||row.level==='attention'||row.level==='opportunity'),...personal.filter(row=>row.level==='urgent'||row.level==='attention')])[0]??null;
  return{asOf,business:businessSection,personal:personalSection,top};
}

export function proactiveCategoryKey(signal:ProactiveSignal):string{return signal.scope==='personal'?`personal:${signal.category}`:signal.category;}
