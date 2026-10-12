import { currentCloudUser } from './firebase.js';
import { activeAccountStorageUid } from '../storage/db.js';
import { loadAssistantState, normalizeAssistantState, saveAssistantState, type AssistantStoreState, type AssistantThread, type AssistantStoredMessage } from '../storage/assistant-store.js';
import { normalizeAiConversationMode, type AiConversationMode } from '../lib/ai-conversation-mode.js';

/** PIN-free Firebase account-history transport. Local AES-GCM device keys never leave IndexedDB.
 * Only inert messages and scope/mode metadata go to Firestore — never proposals,
 * tool approvals, receipts, pending missions, draft artifacts or financial vault data. */
const FORMAT='LOUREX_AI_THREAD_V1',MAX_CLOUD_THREADS=200,MAX_LOCAL_THREADS=30,MAX_DOCUMENT_BYTES=700_000,MAX_MESSAGES=60;
type Scope='business'|'personal';
interface CloudThread {
  format:typeof FORMAT;ownerUid:string;id:string;scope:Scope;workspaceId:string;branchId:string;
  title:string;summary:string;mode:AiConversationMode;
  messages:AssistantStoredMessage[];createdAt:string;updatedAt:string;deletedAt?:string;
}
const safeId=(value:string):boolean=>/^[A-Za-z0-9_-]{1,120}$/.test(value);
const validTime=(value:unknown):value is string=>typeof value==='string'&&value.length<=40&&Number.isFinite(Date.parse(value));
function checkAccount(uid:string):void{
  if(!uid||currentCloudUser()?.uid!==uid||activeAccountStorageUid()!==uid)
    throw new Error('The LOUREX AI account changed. Conversation cloud sync was stopped.');
}
function db():any{
  if(typeof firebase==='undefined'||!firebase.firestore)throw new Error('Cloud history is not available offline.');
  return firebase.firestore();
}
const collection=(uid:string):any=>db().collection('users').doc(uid).collection('assistantHistory');
function message(value:any):AssistantStoredMessage|null{
  if(!value||typeof value!=='object'||!safeId(String(value.id||''))||!['user','assistant'].includes(value.role)||typeof value.text!=='string'||value.text.length>4000||!validTime(value.createdAt))return null;
  return{id:value.id,role:value.role,text:value.text,createdAt:value.createdAt};
}
function validCloud(value:any,uid:string):value is CloudThread{
  if(!value||value.format!==FORMAT||value.ownerUid!==uid||!safeId(value.id)
    ||!['business','personal'].includes(value.scope)||typeof value.workspaceId!=='string'||typeof value.branchId!=='string'
    ||value.workspaceId.length>120||value.branchId.length>120||typeof value.title!=='string'||value.title.length>100
    ||typeof value.summary!=='string'||value.summary.length>1200||!['controller','advisor'].includes(value.mode)
    ||!validTime(value.createdAt)||!validTime(value.updatedAt)
    ||(value.deletedAt!==undefined&&!validTime(value.deletedAt))||!Array.isArray(value.messages)||value.messages.length>MAX_MESSAGES)return false;
  return value.messages.every((row:any)=>message(row)!==null);
}
function toCloud(uid:string,thread:AssistantThread):CloudThread{
  if(!safeId(thread.id))throw new Error('Invalid conversation ID; no cloud history was changed.');
  if(thread.kernel?.scope.accountId&&thread.kernel.scope.accountId!==uid)
    throw new Error('Conversation belongs to a different Firebase account. Sync cancelled.');
  if(thread.messages.length>MAX_MESSAGES)throw new Error('Conversation exceeds the safe 60-message limit. Nothing was uploaded.');
  const messages=thread.messages.map(row=>message(row));
  if(messages.some(row=>!row)||messages.length!==thread.messages.length)
    throw new Error('Conversation contains an invalid message. Nothing was silently omitted.');
  return{format:FORMAT,ownerUid:uid,id:thread.id,scope:thread.scope,
    workspaceId:thread.scope==='business'?thread.workspaceId:'',branchId:thread.scope==='business'?thread.branchId:'',
    title:thread.title.slice(0,100),summary:thread.summary.slice(0,1200),
    mode:normalizeAiConversationMode(thread.kernel?.mode),messages:messages as AssistantStoredMessage[],
    createdAt:thread.createdAt,updatedAt:thread.updatedAt};
}
function deletion(uid:string,id:string,deletedAt:string):CloudThread{
  return{format:FORMAT,ownerUid:uid,id,scope:'business',workspaceId:'',branchId:'',title:'',summary:'',mode:'advisor',messages:[],
    createdAt:deletedAt,updatedAt:deletedAt,deletedAt};
}
function mergeMessages(a:AssistantStoredMessage[],b:AssistantStoredMessage[]):AssistantStoredMessage[]{
  const byId=new Map<string,AssistantStoredMessage>();
  for(const row of [...b,...a]){
    const next=message(row);if(!next)throw new Error('Invalid incoming message. No history was merged.');
    const previous=byId.get(next.id);
    if(previous&&(previous.role!==next.role||previous.text!==next.text))
      throw new Error('Conflicting message identity from two devices. No history was overwritten.');
    byId.set(next.id,previous&&previous.createdAt<next.createdAt?previous:next);
  }
  if(byId.size>MAX_MESSAGES)throw new Error('Merging devices exceeds the 60-message retention limit. No conversation message was silently dropped.');
  return [...byId.values()].sort((x,y)=>x.createdAt.localeCompare(y.createdAt)||x.id.localeCompare(y.id));
}
export function mergeAssistantCloudThread(local:CloudThread,remote:CloudThread):CloudThread{
  if(local.ownerUid!==remote.ownerUid||local.id!==remote.id)throw new Error('Conversation identity mismatch.');
  if(local.deletedAt||remote.deletedAt){
    const at=[local.deletedAt,remote.deletedAt].filter((value):value is string=>Boolean(value)).sort().at(-1)!;
    return{...deletion(local.ownerUid,local.id,at),deletedAt:at};
  }
  if(local.scope!==remote.scope||local.workspaceId!==remote.workspaceId||local.branchId!==remote.branchId)
    throw new Error('Conversation scope changed. No history was overwritten.');
  const newest=local.updatedAt>=remote.updatedAt?local:remote;
  return{...newest,mode:local.mode===remote.mode?newest.mode:'advisor',
    createdAt:local.createdAt<=remote.createdAt?local.createdAt:remote.createdAt,
    messages:mergeMessages(local.messages,remote.messages),
    updatedAt:local.updatedAt>=remote.updatedAt?local.updatedAt:remote.updatedAt};
}
function restore(uid:string,row:CloudThread,local?:AssistantThread):AssistantThread{
  const sameMessages=Boolean(local&&local.messages.length===row.messages.length
    &&local.messages.every((msg,index)=>msg.id===row.messages[index]?.id&&msg.text===row.messages[index]?.text));
  const matching=Boolean(sameMessages&&local?.kernel&&normalizeAiConversationMode(local.kernel.mode)===row.mode);
  const kernel=matching?local!.kernel:{
    version:1 as const,
    scope:{scope:row.scope,workspaceId:row.workspaceId,branchId:row.branchId,threadId:row.id,accountId:uid},
    turn:0,mode:row.mode,focus:row.mode==='advisor'?'advisor' as const:'operator' as const
  };
  // A conflicting mode cannot inherit old executable artifacts or approvals.
  return{...local,id:row.id,scope:row.scope,title:row.title,workspaceId:row.workspaceId,branchId:row.branchId,
    summary:row.summary,kernel,foundationReceipts:matching?local?.foundationReceipts||[]:[],
    messages:row.messages,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
function bytes(value:unknown):number{return new TextEncoder().encode(JSON.stringify(value)).length;}
/** Pure merge for tests and for the safe, never-destructive local install. */
export function mergeAssistantCloudState(uid:string,localState:AssistantStoreState,remoteRows:CloudThread[]):AssistantStoreState{
  const local=normalizeAssistantState(localState),deleted={...(local.deletedThreads||{})};
  const visibleRemote=remoteRows.filter(row=>!row.deletedAt&&!deleted[row.id]);
  const newRemoteIds=visibleRemote.filter(row=>!local.threads.some(current=>current.id===row.id));
  if(local.threads.length+newRemoteIds.length>MAX_LOCAL_THREADS)
    throw new Error('Cloud has more conversations than this device can safely retain. History was not overwritten; migrate retention before syncing.');
  const current=new Map(local.threads.map(row=>[row.id,row] as const));
  for(const remote of remoteRows){
    if(!validCloud(remote,uid))throw new Error('Invalid cloud conversation format or account.');
    const tombstone=deleted[remote.id];
    if(remote.deletedAt||tombstone){
      deleted[remote.id]=[remote.deletedAt,tombstone].filter((x):x is string=>Boolean(x)).sort().at(-1)!;
      current.delete(remote.id);continue;
    }
    const previous=current.get(remote.id);
    const merged=previous?mergeAssistantCloudThread(toCloud(uid,previous),remote):remote;
    current.set(remote.id,restore(uid,merged,previous));
  }
  return normalizeAssistantState({...local,threads:[...current.values()],deletedThreads:deleted});
}
async function publishThread(uid:string,candidate:CloudThread):Promise<boolean>{
  checkAccount(uid);
  if(bytes(candidate)>MAX_DOCUMENT_BYTES)throw new Error('AI history entry exceeds Firestore safe size; no truncated upload was made.');
  const ref=collection(uid).doc(candidate.id);
  const changed=await db().runTransaction(async(tx:any)=>{
    checkAccount(uid);
    const snapshot=await tx.get(ref);checkAccount(uid);
    const record=snapshot.exists?snapshot.data():null;
    if(record&&(!validCloud(record,uid)||record.id!==candidate.id))throw new Error('Remote conversation identity or format changed.');
    const merged=record?mergeAssistantCloudThread(candidate,record):candidate;
    if(bytes(merged)>MAX_DOCUMENT_BYTES)throw new Error('Merged history exceeds Firestore safe document size.');
    if(record&&JSON.stringify(record)===JSON.stringify(merged))return false;
    checkAccount(uid);tx.set(ref,merged);return true;
  });
  checkAccount(uid);return changed;
}
/** Called only on an authenticated account; one full sync at a time per device.
 * Transactional per-thread merges prevent simultaneous devices from silently winning.
 * A rejected network request leaves the durable local encrypted cache untouched. */
export async function synchronizeAssistantHistory(uid:string,key:CryptoKey,options:{installRemote?:boolean;changedThreadId?:string}={}):Promise<{uploaded:number;downloaded:number}>{
  checkAccount(uid);
  if(typeof navigator!=='undefined'&&!navigator.onLine)throw new Error('Offline: AI history remains saved locally. Cloud sync will retry.');
  // Outgoing saves and deletions publish ONLY the changed thread. Scanning
  // every Firestore history document for each chat turn exhausts free quotas.
  if(options.installRemote===false&&options.changedThreadId){
    const id=options.changedThreadId;if(!safeId(id))throw new Error('Invalid conversation identifier.');
    const state=await loadAssistantState(key);checkAccount(uid);
    const deletedAt=state.deletedThreads?.[id],thread=state.threads.find(row=>row.id===id);
    if(!deletedAt&&!thread)return{uploaded:0,downloaded:0};
    const candidate=deletedAt?deletion(uid,id,deletedAt):toCloud(uid,thread!);
    const changed=await publishThread(uid,candidate);
    return{uploaded:changed?1:0,downloaded:0};
  }
  const local=await loadAssistantState(key);checkAccount(uid);
  const snap=await collection(uid).orderBy('updatedAt','desc').limit(MAX_CLOUD_THREADS).get({source:'server'});
  checkAccount(uid);
  if(snap.size>=MAX_CLOUD_THREADS)throw new Error('Cloud history listing requires pagination; no conversation data was overwritten.');
  const remoteRows:CloudThread[]=[];
  snap.forEach((doc:any)=>{
    const row=doc.data();
    if(!validCloud(row,uid)||row.id!==doc.id)throw new Error('Invalid cloud history entry. Local data was preserved.');
    remoteRows.push(row);
  });
  const candidates=mergeAssistantCloudState(uid,local,remoteRows);
  const remoteById=new Map(remoteRows.map(row=>[row.id,row] as const));
  const requests:CloudThread[]=[];
  for(const thread of candidates.threads)requests.push(toCloud(uid,thread));
  for(const [id,deletedAt] of Object.entries(candidates.deletedThreads||{})){
    if(safeId(id)&&validTime(deletedAt))requests.push(deletion(uid,id,deletedAt));
  }
  let uploaded=0;
  for(const candidate of requests){
    checkAccount(uid);
    const remote=remoteById.get(candidate.id);
    if(remote&&JSON.stringify(remote)===JSON.stringify(candidate))continue;
    if(await publishThread(uid,candidate))uploaded++;
  }
  // During outgoing auto-save, do not overwrite concurrent local edits with
  // an asynchronous cloud read. The next explicit refresh performs the pull.
  if(options.installRemote===false)return{uploaded,downloaded:0};
  // Refetch authoritative rows after concurrent remote writes. Existing device
  // kernels and financial approvals remain local-only, never imported from cloud.
  const finalSnap=await collection(uid).orderBy('updatedAt','desc').limit(MAX_CLOUD_THREADS).get({source:'server'});
  checkAccount(uid);
  if(finalSnap.size>=MAX_CLOUD_THREADS)throw new Error('Cloud history listing is incomplete; local data was preserved.');
  const finalRows:CloudThread[]=[];finalSnap.forEach((doc:any)=>{const row=doc.data();if(!validCloud(row,uid)||row.id!==doc.id)throw new Error('Invalid cloud history entry.');finalRows.push(row);});
  // Merge against a freshly read local state: never replace newly saved messages.
  const latest=await loadAssistantState(key);checkAccount(uid);
  const merged=mergeAssistantCloudState(uid,latest,finalRows);
  if(JSON.stringify(latest)!==JSON.stringify(merged)){await saveAssistantState(key,merged);checkAccount(uid);}
  return{uploaded,downloaded:finalRows.length};
}
