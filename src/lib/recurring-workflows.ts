import type { LourexDocument, PurchaseRecord, RecurringCadence, RecurringWorkflowRecord } from '../types.js';
import { addDaysIso, daysBetweenIso, isIsoDate, makeId, todayIso } from './id.js';

export const DEFAULT_WORKSPACE_ID='default';
export const DEFAULT_BRANCH_ID='main';
export const RECURRING_MAX_INTERVAL=52;
const DOCUMENT_KINDS=new Set(['rfq','proforma','proforma-invoice','purchase-order','invoice']);

function clampInterval(value:number):number{return Math.max(1,Math.min(RECURRING_MAX_INTERVAL,Math.trunc(Number.isFinite(value)?value:1)));}
function utcDate(iso:string):Date{if(!isIsoDate(iso))throw new Error('Recurring date is invalid.');return new Date(`${iso}T00:00:00.000Z`);}
function iso(date:Date):string{return date.toISOString().slice(0,10);}
function addMonthsClamped(value:string,months:number):string{
  const source=utcDate(value),day=source.getUTCDate();
  const first=new Date(Date.UTC(source.getUTCFullYear(),source.getUTCMonth()+months,1));
  const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return iso(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(day,lastDay))));
}

export function nextRecurringDate(value:string,cadence:RecurringCadence,interval=1):string{
  const step=clampInterval(interval);
  if(cadence==='weekly')return addDaysIso(value,7*step);
  if(cadence==='monthly')return addMonthsClamped(value,step);
  if(cadence==='quarterly')return addMonthsClamped(value,3*step);
  if(cadence==='yearly')return addMonthsClamped(value,12*step);
  throw new Error('Recurring cadence is invalid.');
}

export function recurringDocumentEligible(doc:LourexDocument):boolean{
  return doc.role==='standard'&&doc.lifecycleStatus!=='voided'&&DOCUMENT_KINDS.has(doc.kind);
}
export function recurringPurchaseEligible(purchase:PurchaseRecord):boolean{return purchase.status!=='reversed';}

function sanitizeDocumentTemplate(source:LourexDocument):LourexDocument{
  const template=structuredClone({...source,attachments:[]}) as LourexDocument;
  return {...template,id:source.id,number:source.number,role:'standard',status:'draft',lifecycleStatus:'active',revision:1,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',attachments:[],convertedFromId:'',updatedAt:new Date().toISOString()};
}
function sanitizePurchaseTemplate(source:PurchaseRecord):PurchaseRecord{
  const template=structuredClone(source);
  return {...template,status:'draft',postedAt:'',reversedAt:'',reverseReason:'',updatedAt:new Date().toISOString()};
}

function baseWorkflow(target:'document'|'purchase',sourceId:string,sourceNumber:string,title:string,cadence:RecurringCadence,interval:number,nextRunDate:string,endDate:string):Omit<RecurringWorkflowRecord,'documentTemplate'|'purchaseTemplate'>{
  const now=new Date().toISOString();
  return{id:makeId('recurring'),workspaceId:DEFAULT_WORKSPACE_ID,branchId:DEFAULT_BRANCH_ID,target,title:title.trim()||sourceNumber,sourceId,sourceNumber,cadence,interval:clampInterval(interval),nextRunDate,endDate:endDate.trim(),enabled:true,generatedRuns:[],createdAt:now,updatedAt:now};
}

export function createDocumentRecurringWorkflow(source:LourexDocument,options:{title?:string;cadence:RecurringCadence;interval?:number;nextRunDate?:string;endDate?:string}):RecurringWorkflowRecord{
  if(!recurringDocumentEligible(source))throw new Error('This document cannot be made recurring.');
  const nextRunDate=options.nextRunDate||todayIso();
  const record:RecurringWorkflowRecord={...baseWorkflow('document',source.id,source.number,options.title||source.number,options.cadence,options.interval??1,nextRunDate,options.endDate||''),documentTemplate:sanitizeDocumentTemplate(source),purchaseTemplate:null};
  assertRecurringWorkflow(record);return record;
}

export function createPurchaseRecurringWorkflow(source:PurchaseRecord,options:{title?:string;cadence:RecurringCadence;interval?:number;nextRunDate?:string;endDate?:string}):RecurringWorkflowRecord{
  if(!recurringPurchaseEligible(source))throw new Error('A reversed purchase cannot be made recurring.');
  const nextRunDate=options.nextRunDate||todayIso();
  const record:RecurringWorkflowRecord={...baseWorkflow('purchase',source.id,source.number,options.title||source.number,options.cadence,options.interval??1,nextRunDate,options.endDate||''),documentTemplate:null,purchaseTemplate:sanitizePurchaseTemplate(source)};
  assertRecurringWorkflow(record);return record;
}

export function assertRecurringWorkflow(record:RecurringWorkflowRecord):void{
  if(!record.id.trim())throw new Error('Recurring workflow ID is required.');
  if(!record.workspaceId.trim())throw new Error('Recurring workspace is required.');
  if(!record.branchId.trim())throw new Error('Recurring branch is required.');
  if(record.target!=='document'&&record.target!=='purchase')throw new Error('Recurring target is invalid.');
  if(!['weekly','monthly','quarterly','yearly'].includes(record.cadence))throw new Error('Recurring cadence is invalid.');
  if(!Number.isInteger(record.interval)||record.interval<1||record.interval>RECURRING_MAX_INTERVAL)throw new Error('Recurring interval is invalid.');
  if(!isIsoDate(record.nextRunDate))throw new Error('Next recurring date is invalid.');
  if(record.endDate&&(!isIsoDate(record.endDate)||record.endDate<record.nextRunDate))throw new Error('Recurring end date must be on or after the next run date.');
  if(record.target==='document'){
    if(!record.documentTemplate||record.purchaseTemplate)throw new Error('Recurring document template is invalid.');
    if(!recurringDocumentEligible(record.documentTemplate))throw new Error('Recurring document template is not eligible.');
    if(record.documentTemplate.status!=='draft'||(record.documentTemplate.attachments??[]).length)throw new Error('Recurring document template must be a clean draft without attachments.');
  }else{
    if(!record.purchaseTemplate||record.documentTemplate)throw new Error('Recurring purchase template is invalid.');
    if(record.purchaseTemplate.status!=='draft'||record.purchaseTemplate.postedAt||record.purchaseTemplate.reversedAt)throw new Error('Recurring purchase template must be a clean draft.');
  }
  const seen=new Set<string>();
  for(const run of record.generatedRuns){
    if(!isIsoDate(run.scheduledFor)||!run.generatedId||!run.generatedNumber)throw new Error('Recurring generation history is invalid.');
    if(seen.has(run.scheduledFor))throw new Error('Recurring workflow contains a duplicate scheduled run.');
    seen.add(run.scheduledFor);
  }
}

export function recurringWorkflowDue(record:RecurringWorkflowRecord,asOf=todayIso()):boolean{
  if(!record.enabled||!isIsoDate(asOf)||record.nextRunDate>asOf)return false;
  if(record.endDate&&record.nextRunDate>record.endDate)return false;
  return !record.generatedRuns.some(run=>run.scheduledFor===record.nextRunDate);
}

function dueDateForSchedule(sourceDate:string,sourceDueDate:string,scheduledFor:string):string{
  const days=daysBetweenIso(sourceDate,sourceDueDate);return days===null?'':addDaysIso(scheduledFor,days);
}

export function materializeRecurringDocumentDraft(record:RecurringWorkflowRecord,number:string,scheduledFor=record.nextRunDate):LourexDocument{
  assertRecurringWorkflow(record);if(record.target!=='document'||!record.documentTemplate)throw new Error('Recurring workflow is not a document workflow.');
  if(record.generatedRuns.some(run=>run.scheduledFor===scheduledFor))throw new Error('A draft was already generated for this recurring date.');
  const source=record.documentTemplate,now=new Date().toISOString();
  const clone=structuredClone({...source,attachments:[]}) as LourexDocument;
  return{...clone,id:makeId('doc'),number,issueDate:scheduledFor,dueDate:dueDateForSchedule(source.issueDate,source.dueDate,scheduledFor),role:'standard',status:'draft',lifecycleStatus:'active',revision:1,creditForId:'',creditForNumber:'',voidedAt:'',voidReason:'',attachments:[],convertedFromId:'',createdAt:now,updatedAt:now,items:source.items.map(item=>({...item,id:makeId('item')}))};
}

export function materializeRecurringPurchaseDraft(record:RecurringWorkflowRecord,number:string,scheduledFor=record.nextRunDate):PurchaseRecord{
  assertRecurringWorkflow(record);if(record.target!=='purchase'||!record.purchaseTemplate)throw new Error('Recurring workflow is not a purchase workflow.');
  if(record.generatedRuns.some(run=>run.scheduledFor===scheduledFor))throw new Error('A draft was already generated for this recurring date.');
  const source=record.purchaseTemplate,now=new Date().toISOString(),clone=structuredClone(source);
  return{...clone,id:makeId('purchase'),number,date:scheduledFor,dueDate:dueDateForSchedule(source.date,source.dueDate,scheduledFor),items:source.items.map(item=>({...item,id:makeId('purchase-item')})),status:'draft',postedAt:'',reversedAt:'',reverseReason:'',createdAt:now,updatedAt:now};
}

export function completeRecurringRun(record:RecurringWorkflowRecord,generated:{id:string;number:string},scheduledFor=record.nextRunDate):RecurringWorkflowRecord{
  assertRecurringWorkflow(record);if(record.generatedRuns.some(run=>run.scheduledFor===scheduledFor))throw new Error('This recurring date was already generated.');
  const next=nextRecurringDate(scheduledFor,record.cadence,record.interval),now=new Date().toISOString();
  const enabled=record.endDate?next<=record.endDate:record.enabled;
  return{...record,nextRunDate:next,enabled,generatedRuns:[...record.generatedRuns,{id:makeId('recurring-run'),scheduledFor,generatedId:generated.id,generatedNumber:generated.number,createdAt:now}],updatedAt:now};
}

export function recurringCadenceLabel(cadence:RecurringCadence,arabic=false):string{
  const en={weekly:'Weekly',monthly:'Monthly',quarterly:'Quarterly',yearly:'Yearly'} as const;
  const ar={weekly:'أسبوعي',monthly:'شهري',quarterly:'ربع سنوي',yearly:'سنوي'} as const;
  return (arabic?ar:en)[cadence];
}
