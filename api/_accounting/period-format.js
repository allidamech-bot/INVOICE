import {createHash} from 'node:crypto';
import {loadCompiledFinance} from './compiled-finance-loader.js';
const [{APP_SCHEMA_VERSION},{assertRestorableBackupVault},{isIsoDate}]=await Promise.all([
  loadCompiledFinance('defaults'),
  loadCompiledFinance('backup'),
  loadCompiledFinance('id')
]);

export const CHUNK_BYTES=180_000,MAX_WORKSPACE_BYTES=45_000_000;
export const hexId=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
export const hash=value=>createHash('sha256').update(value).digest('hex');
export class PeriodError extends Error {constructor(status,code){super(code);this.status=status;this.code=code;}}
export const fail=(status,code)=>{throw new PeriodError(status,code);};
export function validatePeriodCommand(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'INVALID_COMMAND');
  const {operation,opId,expectedRevision,expectedGeneration}=value;
  if(!['inspect','enroll','commit','close','reopen'].includes(operation)||!hexId(opId)
    ||typeof expectedRevision!=='string'||!/^[A-Za-z0-9-]{12,90}$/.test(expectedRevision)
    ||!Number.isSafeInteger(expectedGeneration)||expectedGeneration<0)fail(400,'INVALID_COMMAND');
  const keys=['operation','opId','expectedRevision','expectedGeneration'];
  const result={operation,opId,expectedRevision,expectedGeneration};
  if(operation==='close'||operation==='reopen'){
    keys.push('workspaceId','reason');
    if(typeof value.workspaceId!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(value.workspaceId)
      ||typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>1000)fail(400,'INVALID_COMMAND');
    Object.assign(result,{workspaceId:value.workspaceId,reason:value.reason.trim()});
  }
  if(operation==='close'){
    keys.push('through');if(typeof value.through!=='string'||!isIsoDate(value.through))fail(400,'INVALID_CLOSE_DATE');
    result.through=value.through;
  }
  if(Object.keys(value).some(key=>!keys.includes(key)))fail(400,'INVALID_COMMAND');
  return result;
}
export function encodeBytes(bytes,revision){
  const chunks=[];for(let start=0;start<bytes.length;start+=CHUNK_BYTES)
    chunks.push({revision,index:chunks.length,data:bytes.subarray(start,start+CHUNK_BYTES).toString('base64')});
  return{chunks,bytes:bytes.length,sha256:hash(bytes),chunkCount:chunks.length};
}
export function encodeWorkspace(payload,revision){
  assertRestorableBackupVault(payload);
  if(payload.schemaVersion!==APP_SCHEMA_VERSION)fail(422,'UNSUPPORTED_SCHEMA');
  const bytes=Buffer.from(JSON.stringify(payload));if(!bytes.length||bytes.length>MAX_WORKSPACE_BYTES)fail(413,'WORKSPACE_TOO_LARGE');
  const encoded=encodeBytes(bytes,revision);
  return{chunks:encoded.chunks,meta:{format:'LOUREX_PLAIN_WORKSPACE_V2',version:2,revision,schemaVersion:APP_SCHEMA_VERSION,
    bytes:encoded.bytes,sha256:encoded.sha256,chunkCount:encoded.chunkCount,updatedAt:new Date().toISOString(),parentRevision:null}};
}
export function validateMeta(meta){
  if(!meta||meta.format!=='LOUREX_PLAIN_WORKSPACE_V2'||meta.version!==2
    ||meta.schemaVersion!==APP_SCHEMA_VERSION||typeof meta.revision!=='string'||!/^[A-Za-z0-9-]{12,90}$/.test(meta.revision)
    ||!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>MAX_WORKSPACE_BYTES
    ||!Number.isSafeInteger(meta.chunkCount)||meta.chunkCount!==Math.ceil(meta.bytes/CHUNK_BYTES)
    ||(meta.chunkStorage!==undefined&&meta.chunkStorage!=='period-generations-v1')
    ||typeof meta.sha256!=='string'||!/^[a-f0-9]{64}$/.test(meta.sha256))fail(422,'INVALID_WORKSPACE_MANIFEST');
  return meta;
}
function decodeChunks(meta,chunks){
  if(!Array.isArray(chunks)||chunks.length!==meta.chunkCount)fail(422,'INVALID_WORKSPACE_CHUNKS');
  const buffers=chunks.map((chunk,index)=>{
    if(!chunk||chunk.index!==index||chunk.revision!==meta.revision||typeof chunk.data!=='string'
      ||chunk.data.length>Math.ceil(CHUNK_BYTES/3)*4||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(chunk.data))fail(422,'INVALID_WORKSPACE_CHUNKS');
    const bytes=Buffer.from(chunk.data,'base64'),length=Math.min(CHUNK_BYTES,meta.bytes-index*CHUNK_BYTES);
    if(bytes.length!==length||bytes.toString('base64')!==chunk.data)fail(422,'INVALID_WORKSPACE_CHUNKS');return bytes;
  });
  const bytes=Buffer.concat(buffers);if(bytes.length!==meta.bytes||hash(bytes)!==meta.sha256)fail(422,'WORKSPACE_HASH_MISMATCH');
  return bytes;
}
export function decodeWorkspace(meta,chunks){
  validateMeta(meta);const bytes=decodeChunks(meta,chunks);
  let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));assertRestorableBackupVault(payload);}catch{fail(422,'INVALID_WORKSPACE_PAYLOAD');}
  if(payload.schemaVersion!==meta.schemaVersion)fail(422,'UNSUPPORTED_SCHEMA');return payload;
}
export function decodeReport(meta,chunks,boundary){
  if(!meta||meta.format!=='LOUREX_PERIOD_REPORT_V1'||meta.version!==1||!hexId(meta.reportId)
    ||meta.reportId!==boundary.reportId||meta.workspaceId!==boundary.workspaceId||meta.through!==boundary.through
    ||!Number.isSafeInteger(meta.bytes)||meta.bytes<1||meta.bytes>135_000_000
    ||meta.chunkCount!==Math.ceil(meta.bytes/CHUNK_BYTES)||typeof meta.sha256!=='string'||!/^[a-f0-9]{64}$/.test(meta.sha256))fail(422,'INVALID_PUBLISHED_REPORT');
  const bytes=decodeChunks({...meta,revision:meta.reportId},chunks);
  let state;try{state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(422,'INVALID_PUBLISHED_REPORT');}
  if(state.version!==1||state.workspaceId!==boundary.workspaceId||state.through!==boundary.through)fail(422,'INVALID_PUBLISHED_REPORT');
  return state;
}
