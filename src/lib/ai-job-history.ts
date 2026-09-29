export type AiJobStatus='processing'|'needs-review'|'completed'|'failed'|'cancelled';
export interface AiJobHistoryEntry{
  id:string;
  sourceName:string;
  documentType:string;
  route:string;
  status:AiJobStatus;
  createdAt:string;
  updatedAt:string;
  note:string;
}

const KEY='lourex-ai-job-history-v1';
const MAX=30;

function safeText(value:unknown,max=180):string{return String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);}
function validStatus(value:unknown):value is AiJobStatus{return['processing','needs-review','completed','failed','cancelled'].includes(String(value));}
function normalizeEntry(value:any):AiJobHistoryEntry|null{
  if(!value||typeof value!=='object')return null;const id=safeText(value.id,120),status=value.status;if(!id||!validStatus(status))return null;
  return{id,sourceName:safeText(value.sourceName),documentType:safeText(value.documentType,80),route:safeText(value.route,60),status,createdAt:safeText(value.createdAt,40),updatedAt:safeText(value.updatedAt,40),note:safeText(value.note,220)};
}
export function readAiJobHistory():AiJobHistoryEntry[]{
  try{const parsed=JSON.parse(sessionStorage.getItem(KEY)||'[]');return Array.isArray(parsed)?parsed.map(normalizeEntry).filter((row):row is AiJobHistoryEntry=>Boolean(row)).slice(0,MAX):[];}catch{return[];}
}
function write(entries:AiJobHistoryEntry[]):void{try{sessionStorage.setItem(KEY,JSON.stringify(entries.slice(0,MAX)));}catch{}}
export function startAiJob(sourceName:string):AiJobHistoryEntry{
  const now=new Date().toISOString();const entry:AiJobHistoryEntry={id:`ai-job-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,sourceName:safeText(sourceName)||'AI source',documentType:'',route:'',status:'processing',createdAt:now,updatedAt:now,note:''};write([entry,...readAiJobHistory().filter(row=>row.id!==entry.id)]);return entry;
}
export function updateAiJob(id:string,patch:Partial<Pick<AiJobHistoryEntry,'documentType'|'route'|'status'|'note'>>):AiJobHistoryEntry|null{
  const rows=readAiJobHistory();const index=rows.findIndex(row=>row.id===id);if(index<0)return null;const current=rows[index]!;const next:AiJobHistoryEntry={...current,documentType:patch.documentType===undefined?current.documentType:safeText(patch.documentType,80),route:patch.route===undefined?current.route:safeText(patch.route,60),status:patch.status&&validStatus(patch.status)?patch.status:current.status,note:patch.note===undefined?current.note:safeText(patch.note,220),updatedAt:new Date().toISOString()};rows[index]=next;write(rows);return next;
}
export function clearAiJobHistory():void{try{sessionStorage.removeItem(KEY);}catch{}}
