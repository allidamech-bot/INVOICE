/**
 * R07E — inactive, server-only original source object adapter.
 *
 * Concrete backend: injected Google Cloud Storage/Firebase Admin Bucket
 * compatible object API. No public URLs, download tokens, or client API.
 * Cloud IAM, data residency, retention, encryption, backup and deployment
 * need a separate approval: this implementation is NOT production-enabled.
 */
import type {AuthenticatedScope} from '../domain/contracts.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {sourceScopeKey,sha256,R02_LIMITS,
  type SourceObject,type SourceObjectRepository,type SourceFormat}
  from '../document-engine/engine.js';

export const R07E_PRODUCTION_SOURCE_STORAGE_ACTIVATED=false as const;
export const R07E_OBJECT_PREFIX='ai-next/private-sources/v1';
const SHA=/^[0-9a-f]{64}$/u;
const formats=new Set<SourceFormat>(['pdf','xlsx','xls','csv','text','image']);
const copy=<T>(x:T):T=>structuredClone(x);
const same=(a:unknown,b:unknown):boolean=>a===b;
const safeId=(x:unknown):x is string=>typeof x==='string'&&
  x.length>=1&&x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const filenameValid=(x:unknown):x is string=>typeof x==='string'&&
  x.length>0&&x.length<=R02_LIMITS.maxFilename&&
  !/[\u0000-\u001f\u007f]/u.test(x);
export class R07ESourceStorageError extends Error{
  constructor(readonly code:string){super(code);}
}
export interface R07ECloudFile{
  save(bytes:Uint8Array,options:{
    resumable:false;
    preconditionOpts:{ifGenerationMatch:0};
    metadata:{metadata:Record<string,string>};
  }):Promise<unknown>;
  getMetadata():Promise<[{
    size?:string|number;
    metadata?:Record<string,string>;
  }]>;
  download():Promise<[Uint8Array]>;
}
export interface R07ECloudBucket{
  file(objectName:string):R07ECloudFile;
}
function canonicalScope(key:string):void{
  try{
    const v=JSON.parse(key);
    if(!Array.isArray(v)||v.length!==9)throw Error('bad scope');
    const [ownerUid,accountId,companyId,branchId,threadId,actorId,role,
      scopeType,authorizationVersion]=v;
    const s:AuthenticatedScope={
      ownerUid,accountId,companyId,branchId,threadId,actorId,
      role,scopeType,authorizationVersion,
    };
    if(sourceScopeKey(s)!==key || exactScopeKey(s)!==key)
      throw Error('noncanonical');
  }catch{throw new R07ESourceStorageError('R07E_INVALID_SCOPE_KEY');}
}
function metadata(source:Omit<SourceObject,'bytes'>,scopeHash:string):
  Record<string,string>{
  return {
    version:'1',scopeHash,
    documentId:source.documentId,
    sha256:source.sha256,format:source.format,fileName:source.fileName,
  };
}
async function target(scopeKey:string,documentId:string):Promise<{
  filePath:string;scopeHash:string;
}>{
  canonicalScope(scopeKey);
  if(!safeId(documentId))throw new R07ESourceStorageError('R07E_INVALID_DOCUMENT_ID');
  const scopeHash=await sha256(new TextEncoder().encode(scopeKey));
  const objectHash=await sha256(new TextEncoder().encode(JSON.stringify([
    scopeKey,documentId,
  ])));
  return {filePath:R07E_OBJECT_PREFIX+'/'+scopeHash+'/'+objectHash,scopeHash};
}
function errorCode(error:unknown):number{
  if(!error||typeof error!=='object'||!('code' in error))return 0;
  const code=(error as {code:unknown}).code;
  return typeof code==='number'?code:
    typeof code==='string'&&/^[0-9]{3}$/.test(code)?Number(code):0;
}
function validateBytes(bytes:unknown):asserts bytes is Uint8Array{
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||
    bytes.byteLength>R02_LIMITS.maxIndividualBytes)
    throw new R07ESourceStorageError('R07E_INVALID_BINARY_SIZE');
}
function validateHeader(s:Omit<SourceObject,'bytes'>):void{
  canonicalScope(s.scopeKey);
  if(!safeId(s.documentId)||!filenameValid(s.fileName)||
    !SHA.test(s.sha256)||!formats.has(s.format))
    throw new R07ESourceStorageError('R07E_INVALID_OBJECT_HEADER');
}
async function checkRead(
  file:R07ECloudFile,expected:{scopeKey:string;documentId:string;scopeHash:string},
):Promise<SourceObject>{
  const [info]=await file.getMetadata();
  const meta=info?.metadata;
  if(!meta||meta.version!=='1'||meta.scopeHash!==expected.scopeHash||
    meta.documentId!==expected.documentId||!SHA.test(meta.sha256||'')||
    !formats.has(meta.format as SourceFormat)||!filenameValid(meta.fileName))
    throw new R07ESourceStorageError('R07E_STORED_METADATA_INVALID');
  const length=Number(info.size);
  if(!Number.isSafeInteger(length)||length<1||length>R02_LIMITS.maxIndividualBytes)
    throw new R07ESourceStorageError('R07E_STORED_SIZE_INVALID');
  const [downloaded]=await file.download();
  validateBytes(downloaded);
  if(downloaded.byteLength!==length||
    await sha256(downloaded)!==meta.sha256)
    throw new R07ESourceStorageError('R07E_BINARY_INTEGRITY_MISMATCH');
  return {
    scopeKey:expected.scopeKey,documentId:expected.documentId,
    sha256:meta.sha256,format:meta.format as SourceFormat,
    fileName:meta.fileName,bytes:new Uint8Array(downloaded),
  };
}
export class R07EExperimentalPrivateSourceRepository implements SourceObjectRepository{
  constructor(private readonly bucket:R07ECloudBucket){}
  async store(source:SourceObject):Promise<void>{
    validateHeader(source);
    validateBytes(source.bytes);
    if(await sha256(source.bytes)!==source.sha256)
      throw new R07ESourceStorageError('R07E_UPLOAD_DIGEST_MISMATCH');
    const {filePath,scopeHash}=await target(source.scopeKey,source.documentId);
    const file=this.bucket.file(filePath);
    const copyBytes=new Uint8Array(source.bytes);
    try{
      // GCS/Firebase Admin supports create-only generation preconditions.
      // A duplicate must never overwrite the previously stored original.
      await file.save(copyBytes,{
        resumable:false,
        preconditionOpts:{ifGenerationMatch:0},
        metadata:{metadata:metadata(source,scopeHash)},
      });
      return;
    }catch(error){
      if(![409,412].includes(errorCode(error)))throw error;
      // Only a verified identical object may be accepted on a replay.
      // Never retry with overwriting permissions or trust just metadata.
      const existing=await checkRead(file,{
        scopeKey:source.scopeKey,documentId:source.documentId,scopeHash,
      });
      if(!same(existing.sha256,source.sha256)||existing.format!==source.format||
        existing.fileName!==source.fileName)
        throw new R07ESourceStorageError('R07E_SOURCE_ID_COLLISION');
    }
  }
  async read(scopeKey:string,documentId:string):Promise<SourceObject|null>{
    const {filePath,scopeHash}=await target(scopeKey,documentId);
    const file=this.bucket.file(filePath);
    try{return await checkRead(file,{scopeKey,documentId,scopeHash});}
    catch(error){
      if(errorCode(error)===404)return null;
      throw error;
    }
  }
}
