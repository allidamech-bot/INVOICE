import type {ClosedPeriodState,PeriodCloseBoundary} from './period-close.js';
import {isIsoDate} from './id.js';
export interface ArchivedPeriodReport extends PeriodCloseBoundary {reportId:string;sourceRevision:string;actorUid:string;reason:string;publishedAt:string;sha256:string;state:ClosedPeriodState;}
export interface ArchivedPeriodOperation {opId:string;operation:'enroll'|'commit'|'close'|'reopen';actorUid:string;reason:string;workspaceId:string;at:string;result:{generation:number;revision:string;boundaries:Array<PeriodCloseBoundary&{reportId:string}>;reportId?:string};}
export interface PeriodArchive {format:'LOUREX_PERIOD_ARCHIVE_V1';version:1;sourceUid:string;generation:number;reports:ArchivedPeriodReport[];operations:ArchivedPeriodOperation[];boundaries:Array<PeriodCloseBoundary&{reportId:string}>;}
const hex=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const revision=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9-]{12,90}$/.test(v);
const timestamp=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&isIsoDate(v.slice(0,10))&&Number.isFinite(Date.parse(v));
function fail():never{throw new Error('The period archive is incomplete or failed integrity validation. Account data was not replaced.');}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function boundaries(value:any):boolean{return Array.isArray(value)&&value.every(b=>b&&typeof b.workspaceId==='string'&&b.workspaceId&&isIsoDate(b.through)&&hex(b.reportId))&&new Set(value.map(b=>b.workspaceId)).size===value.length;}
const sorted=(rows:any[])=>[...rows].sort((a,b)=>a.workspaceId<b.workspaceId?-1:a.workspaceId>b.workspaceId?1:0).map(({workspaceId,through,reportId})=>({workspaceId,through,reportId}));
/** Integrity and continuity only. Imported evidence never authorizes cloud policy or report replacement. */
export async function validatePeriodArchive(value:unknown):Promise<PeriodArchive>{
 const a=value as PeriodArchive;
 if(!a||a.format!=='LOUREX_PERIOD_ARCHIVE_V1'||a.version!==1||typeof a.sourceUid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(a.sourceUid)
  ||!Number.isSafeInteger(a.generation)||a.generation<1||!Array.isArray(a.reports)||a.reports.length>10000||!Array.isArray(a.operations)||a.operations.length!==a.generation||a.operations.length>50000||!boundaries(a.boundaries))fail();
 const reports=new Map<string,ArchivedPeriodReport>();
 for(const r of a.reports){
  if(!r||!hex(r.reportId)||reports.has(r.reportId)||!revision(r.sourceRevision)||r.actorUid!==a.sourceUid||typeof r.reason!=='string'||!r.reason.trim()||r.reason.length>1000||!timestamp(r.publishedAt)||!isIsoDate(r.through)
   ||r.state?.version!==1||r.state.workspaceId!==r.workspaceId||r.state.through!==r.through||typeof r.sha256!=='string'||!/^[a-f0-9]{64}$/.test(r.sha256))fail();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(r.state)))),b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==r.sha256)fail();reports.set(r.reportId,r);
 }
 let active:PeriodArchive['boundaries']=[];const used=new Set<string>(),ids=new Set<string>(),revisions=new Set<string>();
 let previousRevision='';
 const operations=[...a.operations].sort((x,y)=>x?.result?.generation-y?.result?.generation);
 for(let index=0;index<operations.length;index++){
  const op=operations[index];
  if(!op||!hex(op.opId)||ids.has(op.opId)||op.actorUid!==a.sourceUid||!timestamp(op.at)||op.result?.generation!==index+1||!revision(op.result.revision)||!boundaries(op.result.boundaries)||typeof op.workspaceId!=='string'||typeof op.reason!=='string'||op.reason.length>1000)fail();ids.add(op.opId);
  if(index===0){if(op.operation!=='enroll'||op.result.boundaries.length)fail();revisions.add(op.result.revision);}
  else if(op.operation==='commit'){if(revisions.has(op.result.revision))fail();revisions.add(op.result.revision);}
  else if(op.result.revision!==previousRevision)fail();
  if(op.operation==='close'){
   const r=reports.get(op.result.reportId||'');if(!r||used.has(r.reportId)||r.workspaceId!==op.workspaceId||r.sourceRevision!==op.result.revision||r.reason!==op.reason||!op.reason.trim()||Date.parse(r.publishedAt)!==Date.parse(op.at)
     ||active.some(b=>b.workspaceId===r.workspaceId&&b.through>=r.through))fail();
   active=[...active.filter(b=>b.workspaceId!==r.workspaceId),{workspaceId:r.workspaceId,through:r.through,reportId:r.reportId}];used.add(r.reportId);
  }else if(op.operation==='reopen'){
   if(!op.reason.trim()||!active.some(b=>b.workspaceId===op.workspaceId))fail();active=active.filter(b=>b.workspaceId!==op.workspaceId);
  }else if(op.operation!=='commit'&&!(index===0&&op.operation==='enroll'))fail();
  if(!equal(sorted(active),sorted(op.result.boundaries)))fail();previousRevision=op.result.revision;
 }
 if(used.size!==reports.size||!equal(sorted(active),sorted(a.boundaries)))fail();
 return a;
}
