import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { invoicePaymentSummary } from './payments.js';
import { commercialTrackingFromEvents, effectiveCommercialStatus, isQuoteLikeDocument, quoteExpiryDate } from './commercial-flow.js';
import { inventoryBalances } from './operations.js';
import { isIsoDate, makeId } from './id.js';

export type NotificationPriority='high'|'medium'|'low';
export type NotificationKind='overdue-invoice'|'quote-expiring'|'commercial-followup'|'purchase-review'|'missing-cost'|'negative-stock';
export type NotificationTarget='receivables'|'documents'|'operations'|'items';
export type NotificationStateAction='snooze'|'done';

export interface NotificationItem{
  key:string;
  kind:NotificationKind;
  priority:NotificationPriority;
  target:NotificationTarget;
  entityId:string;
  entityNumber:string;
  titleEn:string;
  titleAr:string;
  detailEn:string;
  detailAr:string;
  dueDate:string;
  count:number;
  amount:string;
  currency:string;
}

export interface NotificationStateOverlay{
  key:string;
  action:NotificationStateAction|'';
  snoozedUntil:string;
  updatedAt:string;
}

export interface NotificationCenterSnapshot{
  generatedAt:string;
  active:NotificationItem[];
  snoozed:NotificationItem[];
  done:NotificationItem[];
  activeHigh:number;
  activeMedium:number;
  activeLow:number;
}

const NOTIFICATION_MARKER='@lourex:notification:v1:';
const NOTIFICATION_STATE_DOCUMENT_ID='@lourex:notification-state';
const PRIORITY_ORDER:Record<NotificationPriority,number>={high:0,medium:1,low:2};

function text(value:unknown):string{return String(value??'').normalize('NFKC').trim();}
function dateDay(value:string):number{
  if(!isIsoDate(value))return Number.NaN;
  const [year,month,day]=value.split('-').map(Number);
  return Math.floor(Date.UTC(year!,month!-1,day!)/86_400_000);
}
function daysBetween(from:string,to:string):number{return dateDay(to)-dateDay(from);}
function customerName(doc:LourexDocument):string{return text(doc.customerSnapshot?.companyNameEn)||text(doc.customerSnapshot?.companyNameAr)||'Customer';}
function stableHash(parts:string[]):string{
  let hash=2166136261;
  const source=parts.join('|');
  for(let index=0;index<source.length;index+=1){hash^=source.charCodeAt(index);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}
function makeItem(source:Omit<NotificationItem,'key'>,fingerprint:string):NotificationItem{return{...source,key:`${source.kind}:${fingerprint}`};}
function sortItems(items:NotificationItem[]):NotificationItem[]{
  return [...items].sort((a,b)=>PRIORITY_ORDER[a.priority]-PRIORITY_ORDER[b.priority]||(a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||a.key.localeCompare(b.key));
}

function overdueInvoiceNotifications(vault:VaultPayload,today:string):NotificationItem[]{
  const result:NotificationItem[]=[];
  for(const doc of vault.documents){
    if(doc.kind!=='invoice'||doc.role!=='standard'||doc.status!=='final'||doc.lifecycleStatus==='voided')continue;
    const summary=invoicePaymentSummary(doc,vault.payments,today,vault.documents);
    if(summary.status!=='overdue')continue;
    const due=isIsoDate(doc.dueDate)?doc.dueDate:'';
    const overdueDays=due?Math.max(1,-daysBetween(today,due)):0;
    const name=customerName(doc);
    result.push(makeItem({
      kind:'overdue-invoice',priority:'high',target:'receivables',entityId:doc.id,entityNumber:doc.number,
      titleEn:`Overdue invoice · ${doc.number}`,titleAr:`فاتورة متأخرة · ${doc.number}`,
      detailEn:`${name} · ${summary.remaining} ${doc.currency}${overdueDays?` · ${overdueDays} day${overdueDays===1?'':'s'} overdue`:''}`,
      detailAr:`${name} · ${summary.remaining} ${doc.currency}${overdueDays?` · متأخرة ${overdueDays} يوم`:''}`,
      dueDate:due,count:1,amount:summary.remaining,currency:doc.currency
    },stableHash([doc.id,due,summary.remaining,doc.currency])));
  }
  return result;
}

function quoteNotifications(vault:VaultPayload,today:string):NotificationItem[]{
  const result:NotificationItem[]=[];
  for(const doc of vault.documents){
    if(!isQuoteLikeDocument(doc)||doc.status!=='final'||doc.lifecycleStatus==='voided')continue;
    const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents);
    const status=effectiveCommercialStatus(doc,vault.documents,tracking,today).status;
    if(status==='accepted'||status==='rejected'||status==='converted')continue;
    const expiresAt=quoteExpiryDate(doc);
    if(!expiresAt)continue;
    const days=daysBetween(today,expiresAt);
    if(!Number.isFinite(days)||days>3)continue;
    const expired=days<0;
    const name=customerName(doc);
    result.push(makeItem({
      kind:'quote-expiring',priority:expired?'high':'medium',target:'documents',entityId:doc.id,entityNumber:doc.number,
      titleEn:expired?`Expired quote · ${doc.number}`:days===0?`Quote expires today · ${doc.number}`:`Quote expires soon · ${doc.number}`,
      titleAr:expired?`عرض سعر منتهي · ${doc.number}`:days===0?`عرض سعر ينتهي اليوم · ${doc.number}`:`عرض سعر يقترب من الانتهاء · ${doc.number}`,
      detailEn:`${name} · valid until ${expiresAt}`,
      detailAr:`${name} · صالح حتى ${expiresAt}`,
      dueDate:expiresAt,count:1,amount:'',currency:doc.currency
    },stableHash([doc.id,expiresAt,status])));
  }
  return result;
}

function commercialFollowupNotifications(vault:VaultPayload,today:string):NotificationItem[]{
  const result:NotificationItem[]=[];
  for(const doc of vault.documents){
    if(!isQuoteLikeDocument(doc)||doc.status!=='final'||doc.lifecycleStatus==='voided')continue;
    const tracking=commercialTrackingFromEvents(doc.id,vault.documentEvents);
    const status=effectiveCommercialStatus(doc,vault.documents,tracking,today).status;
    if(status==='accepted'||status==='rejected'||status==='converted'||!isIsoDate(tracking.followUpAt||''))continue;
    const followUpAt=tracking.followUpAt!;
    if(followUpAt>today)continue;
    const late=followUpAt<today;
    const name=customerName(doc);
    result.push(makeItem({
      kind:'commercial-followup',priority:late?'high':'medium',target:'documents',entityId:doc.id,entityNumber:doc.number,
      titleEn:late?`Follow-up overdue · ${doc.number}`:`Follow up today · ${doc.number}`,
      titleAr:late?`متابعة متأخرة · ${doc.number}`:`متابعة اليوم · ${doc.number}`,
      detailEn:`${name} · commercial follow-up scheduled for ${followUpAt}`,
      detailAr:`${name} · متابعة تجارية مجدولة بتاريخ ${followUpAt}`,
      dueDate:followUpAt,count:1,amount:'',currency:doc.currency
    },stableHash([doc.id,followUpAt,status])));
  }
  return result;
}

function purchaseReviewNotification(vault:VaultPayload):NotificationItem[]{
  const drafts=vault.purchases.filter(row=>row.status==='draft').sort((a,b)=>a.id.localeCompare(b.id));
  if(!drafts.length)return[];
  const fingerprint=stableHash(drafts.flatMap(row=>[row.id,row.updatedAt,row.number]));
  return[makeItem({
    kind:'purchase-review',priority:'medium',target:'operations',entityId:'',entityNumber:'',
    titleEn:`${drafts.length} purchase draft${drafts.length===1?'':'s'} need review`,titleAr:`${drafts.length} مسودة مشتريات تحتاج مراجعة`,
    detailEn:'Review purchase drafts before posting inventory or supplier commitments.',detailAr:'راجع مسودات المشتريات قبل ترحيل المخزون أو التزامات الموردين.',
    dueDate:'',count:drafts.length,amount:'',currency:''
  },fingerprint)];
}

function missingCostNotification(vault:VaultPayload):NotificationItem[]{
  const missing=vault.savedItems.filter(item=>!item.archived&&(!text(item.lastUnitCost)||!text(item.lastCostCurrency))).sort((a,b)=>a.id.localeCompare(b.id));
  if(!missing.length)return[];
  const fingerprint=stableHash(missing.flatMap(item=>[item.id,item.updatedAt,text(item.lastUnitCost),text(item.lastCostCurrency)]));
  return[makeItem({
    kind:'missing-cost',priority:'medium',target:'items',entityId:'',entityNumber:'',
    titleEn:`${missing.length} product${missing.length===1?'':'s'} missing cost data`,titleAr:`${missing.length} صنف ببيانات تكلفة ناقصة`,
    detailEn:'Profitability stays incomplete until unit cost and cost currency are recorded.',detailAr:'تبقى الربحية غير مكتملة حتى يتم تسجيل تكلفة الوحدة وعملة التكلفة.',
    dueDate:'',count:missing.length,amount:'',currency:''
  },fingerprint)];
}

function negativeStockNotification(vault:VaultPayload):NotificationItem[]{
  const negative=inventoryBalances(vault.savedItems,vault.inventoryMovements).filter(row=>row.quantityScaled<0n).sort((a,b)=>a.item.id.localeCompare(b.item.id));
  if(!negative.length)return[];
  const fingerprint=stableHash(negative.flatMap(row=>[row.item.id,row.quantity]));
  return[makeItem({
    kind:'negative-stock',priority:'high',target:'items',entityId:'',entityNumber:'',
    titleEn:`${negative.length} negative stock exception${negative.length===1?'':'s'}`,titleAr:`${negative.length} حالة مخزون سالب`,
    detailEn:'Negative inventory is a recorded exception. Low-stock alerts will wait for explicit reorder rules in Inventory Planning.',detailAr:'المخزون السالب حالة مسجلة تحتاج مراجعة. تنبيهات انخفاض المخزون ستنتظر قواعد إعادة الطلب الصريحة في تخطيط المخزون.',
    dueDate:'',count:negative.length,amount:'',currency:''
  },fingerprint)];
}

export function notificationCandidates(vault:VaultPayload,today=new Date().toISOString().slice(0,10)):NotificationItem[]{
  return sortItems([
    ...overdueInvoiceNotifications(vault,today),
    ...commercialFollowupNotifications(vault,today),
    ...quoteNotifications(vault,today),
    ...purchaseReviewNotification(vault),
    ...missingCostNotification(vault),
    ...negativeStockNotification(vault)
  ]);
}

function parseStateEvent(event:DocumentEventRecord):{key:string;action:NotificationStateAction;until:string}|null{
  if(event.type!=='created'||event.documentId!==NOTIFICATION_STATE_DOCUMENT_ID||!event.note.startsWith(NOTIFICATION_MARKER))return null;
  try{
    const payload=JSON.parse(event.note.slice(NOTIFICATION_MARKER.length));
    const key=text(payload?.key);const action=payload?.action;
    if(!key||(action!=='snooze'&&action!=='done'))return null;
    const until=action==='snooze'&&isIsoDate(text(payload?.until))?text(payload.until):'';
    if(action==='snooze'&&!until)return null;
    return{key,action,until};
  }catch{return null;}
}

export function isNotificationStateEvent(event:DocumentEventRecord):boolean{return parseStateEvent(event)!==null;}

export function notificationStatesFromEvents(events:DocumentEventRecord[]):Map<string,NotificationStateOverlay>{
  const result=new Map<string,NotificationStateOverlay>();
  const relevant=events.filter(isNotificationStateEvent).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  for(const event of relevant){
    const parsed=parseStateEvent(event);if(!parsed)continue;
    result.set(parsed.key,{key:parsed.key,action:parsed.action,snoozedUntil:parsed.until,updatedAt:event.at});
  }
  return result;
}

export function buildNotificationCenter(vault:VaultPayload,today=new Date().toISOString().slice(0,10)):NotificationCenterSnapshot{
  const candidates=notificationCandidates(vault,today);
  const states=notificationStatesFromEvents(vault.documentEvents);
  const active:NotificationItem[]=[];const snoozed:NotificationItem[]=[];const done:NotificationItem[]=[];
  for(const item of candidates){
    const state=states.get(item.key);
    if(state?.action==='done'){done.push(item);continue;}
    if(state?.action==='snooze'&&state.snoozedUntil>today){snoozed.push(item);continue;}
    active.push(item);
  }
  const sorted=sortItems(active);
  return{
    generatedAt:new Date().toISOString(),active:sorted,snoozed:sortItems(snoozed),done:sortItems(done),
    activeHigh:sorted.filter(item=>item.priority==='high').length,
    activeMedium:sorted.filter(item=>item.priority==='medium').length,
    activeLow:sorted.filter(item=>item.priority==='low').length
  };
}

export function createNotificationStateEvent(key:string,action:NotificationStateAction,until=''):DocumentEventRecord{
  const cleanKey=text(key);
  if(!cleanKey)throw new Error('Notification key is required.');
  if(action==='snooze'&&!isIsoDate(until))throw new Error('Choose a valid snooze date.');
  const now=new Date().toISOString();
  return{
    id:makeId('event'),documentId:NOTIFICATION_STATE_DOCUMENT_ID,documentNumber:'',type:'created',at:now,
    note:`${NOTIFICATION_MARKER}${JSON.stringify({key:cleanKey,action,until:action==='snooze'?until:''})}`,
    relatedDocumentId:'',relatedDocumentNumber:'',amount:'',currency:''
  };
}

export function validatedNotificationStateEvent(vault:VaultPayload,key:string,action:NotificationStateAction,until='',today=new Date().toISOString().slice(0,10)):DocumentEventRecord{
  const current=notificationCandidates(vault,today).find(item=>item.key===key);
  if(!current)throw new Error('This notification is no longer active. Refresh the Notification Center.');
  if(action==='snooze'){
    if(!isIsoDate(until))throw new Error('Choose a valid snooze date.');
    if(until<=today)throw new Error('Snooze date must be after today.');
  }
  return createNotificationStateEvent(key,action,until);
}

export function notificationMarker():string{return NOTIFICATION_MARKER;}
