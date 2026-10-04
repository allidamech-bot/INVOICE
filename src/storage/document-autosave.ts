import type { DocumentEventRecord, LourexDocument, VaultPayload } from '../types.js';
import { deleteRecord, getRecord, putRecord } from './db.js';

const RECORD_ID='document-autosave';
const RECORD_VERSION=1;
const GCM_IV_BYTES=12;
const encoder=new TextEncoder();
const decoder=new TextDecoder();

interface EncryptedDocumentAutosaveRecord {
  id: typeof RECORD_ID;
  version: typeof RECORD_VERSION;
  documentId: string;
  documentNumber: string;
  documentUpdatedAt: string;
  workspaceId: string;
  branchId: string;
  iv: string;
  cipher: string;
  updatedAt: string;
}

interface DocumentAutosavePayload {
  document: LourexDocument;
  documentEvents: DocumentEventRecord[];
}

export interface DocumentAutosaveRecovery {
  found: boolean;
  applied: boolean;
  vault: VaultPayload;
  documentId: string;
}

function bytesToB64(bytes:Uint8Array):string{
  let binary='';
  for(let index=0;index<bytes.byteLength;index+=1)binary+=String.fromCharCode(bytes[index]??0);
  return btoa(binary);
}

function b64ToBytes(value:string):Uint8Array{
  if(typeof value!=='string'||!value)throw new Error('Invalid document autosave checkpoint.');
  const binary=atob(value),bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);
  return bytes;
}

function diag(type:string,detail=''):void{try{if(typeof window!=='undefined')(window as any).__LOUREX_DIAGNOSTICS__?.mark?.(type,detail);}catch{}}
function cleanScope(value:unknown,fallback:string):string{return typeof value==='string'&&value.trim()?value.trim():fallback;}
function timestamp(value:unknown):number{const parsed=Date.parse(typeof value==='string'?value:'');return Number.isFinite(parsed)?parsed:0;}

async function encryptPayload(key:CryptoKey,payload:DocumentAutosavePayload):Promise<{iv:string;cipher:string}>{
  const iv=new Uint8Array(GCM_IV_BYTES);crypto.getRandomValues(iv);
  const plain=encoder.encode(JSON.stringify(payload));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource},key,plain as BufferSource);
  return{iv:bytesToB64(iv),cipher:bytesToB64(new Uint8Array(cipher))};
}

async function decryptPayload(key:CryptoKey,record:EncryptedDocumentAutosaveRecord):Promise<DocumentAutosavePayload>{
  const iv=b64ToBytes(record.iv),cipher=b64ToBytes(record.cipher);
  if(iv.byteLength!==GCM_IV_BYTES||cipher.byteLength<16)throw new Error('Invalid document autosave checkpoint.');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:iv as BufferSource},key,cipher as BufferSource);
  const payload=JSON.parse(decoder.decode(new Uint8Array(plain))) as DocumentAutosavePayload;
  if(!payload?.document||!Array.isArray(payload.documentEvents))throw new Error('Invalid document autosave checkpoint.');
  return payload;
}

export async function saveDocumentAutosaveCheckpoint(key:CryptoKey,document:LourexDocument,documentEvents:DocumentEventRecord[],workspaceId:string,branchId:string):Promise<void>{
  if(!document?.id||document.status!=='draft'||document.lifecycleStatus==='voided')return;
  const started=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  const payload:DocumentAutosavePayload={document,documentEvents};
  const encrypted=await encryptPayload(key,payload);
  const record:EncryptedDocumentAutosaveRecord={
    id:RECORD_ID,version:RECORD_VERSION,documentId:document.id,documentNumber:document.number,documentUpdatedAt:document.updatedAt,
    workspaceId:cleanScope(document.workspaceId,workspaceId||'default'),branchId:cleanScope(document.branchId,branchId||'main'),
    iv:encrypted.iv,cipher:encrypted.cipher,updatedAt:new Date().toISOString()
  };
  await putRecord(record as any);
  const ended=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
  diag('document-autosave-checkpoint',`durationMs=${Math.max(0,Math.round(ended-started))} cipherChars=${record.cipher.length}`);
}

export async function clearDocumentAutosaveCheckpoint():Promise<void>{
  try{await deleteRecord(RECORD_ID as any);}catch{}
}

export async function recoverDocumentAutosaveCheckpoint(key:CryptoKey,vault:VaultPayload):Promise<DocumentAutosaveRecovery>{
  const record=await getRecord<any>(RECORD_ID as any) as EncryptedDocumentAutosaveRecord|null;
  if(!record)return{found:false,applied:false,vault,documentId:''};
  if(record.version!==RECORD_VERSION||!record.documentId){await clearDocumentAutosaveCheckpoint();return{found:true,applied:false,vault,documentId:String(record.documentId||'')};}
  try{
    const payload=await decryptPayload(key,record),document=payload.document;
    const workspaceId=cleanScope(document.workspaceId,'default'),branchId=cleanScope(document.branchId,'main');
    if(document.id!==record.documentId||document.number!==record.documentNumber||workspaceId!==record.workspaceId||branchId!==record.branchId||document.status!=='draft'||document.lifecycleStatus==='voided'){
      await clearDocumentAutosaveCheckpoint();
      return{found:true,applied:false,vault,documentId:record.documentId};
    }
    const index=vault.documents.findIndex(item=>item.id===document.id);
    const existing=index>=0?vault.documents[index]:null;
    if(existing&&(existing.lifecycleStatus==='voided'||existing.status==='final'||timestamp(existing.updatedAt)>=timestamp(document.updatedAt))){
      await clearDocumentAutosaveCheckpoint();
      return{found:true,applied:false,vault,documentId:record.documentId};
    }
    const duplicateNumber=vault.documents.some(item=>item.id!==document.id&&item.number.trim().toLocaleLowerCase()===document.number.trim().toLocaleLowerCase());
    if(duplicateNumber){
      await clearDocumentAutosaveCheckpoint();
      return{found:true,applied:false,vault,documentId:record.documentId};
    }
    const documents=[...vault.documents];
    if(index>=0)documents[index]=document;else documents.push(document);
    const knownEvents=new Set(vault.documentEvents.map(event=>event.id));
    const recoveredEvents=payload.documentEvents.filter(event=>event?.id&&!knownEvents.has(event.id));
    const recovered={...vault,documents,documentEvents:[...vault.documentEvents,...recoveredEvents]};
    diag('document-autosave-recovered',`document=${document.id} events=${recoveredEvents.length}`);
    return{found:true,applied:true,vault:recovered,documentId:document.id};
  }catch(error){
    diag('document-autosave-recovery-error',error instanceof Error?error.name:'UnknownError');
    await clearDocumentAutosaveCheckpoint();
    return{found:true,applied:false,vault,documentId:record.documentId};
  }
}
