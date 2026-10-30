/**
 * R03 — Explicit-consent, scoped user memory. NO automatic memory promotion.
 * This reference backend lives in RAM and is NOT encrypted/durable production
 * storage. An actual backend must implement atomic server-side persistence and
 * deletion after the owner selects a storage and retention policy.
 */
import type { AuthenticatedScope } from '../domain/contracts.js';
import { validateAuthenticatedScope } from '../domain/validation.js';

export type KnowledgeKind='preference'|'fact'|'goal'|'note';
export interface KnowledgeRecord {
  schemaVersion:1;
  memoryId:string;
  ownerKey:string;
  content:string|null;
  kind:KnowledgeKind;
  sourceThreadId:string;
  sourceTurnId:string;
  sourceDocumentId:string|null;
  consentId:string;
  approvedByActorId:string;
  createdAt:string;
  expiresAt:string;
  revokedAt:string|null;
  version:number;
}
export interface KnowledgeCollection {
  revision:number;
  records:KnowledgeRecord[];
}
export interface AtomicKnowledgeBackend {
  transact<T>(key:string,fn:(current:KnowledgeCollection)=>
    Promise<{next:KnowledgeCollection;result:T}>):Promise<T>;
  read(key:string):Promise<KnowledgeCollection>;
}
const clone=<T>(v:T):T=>structuredClone(v);
const id=(x:string):boolean=>typeof x==='string'&&x.length>0&&x.length<=160;
const time=(x:string):boolean=>typeof x==='string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x) &&
  !Number.isNaN(Date.parse(x));
export function knowledgeScopeKey(s:AuthenticatedScope):string{
  if(!validateAuthenticatedScope(s))throw new Error('AI_NEXT_INVALID_MEMORY_SCOPE');
  // Thread intentionally omitted: consent-approved memory can be reused in
  // different threads of the same actor/company/branch/role and auth epoch.
  return JSON.stringify([s.ownerUid,s.accountId,s.companyId,s.branchId,s.actorId,
    s.role,s.scopeType,s.authorizationVersion]);
}
export class SyntheticKnowledgeBackend implements AtomicKnowledgeBackend {
  private state=new Map<string,KnowledgeCollection>();
  private lock=new Map<string,Promise<void>>();
  async read(key:string):Promise<KnowledgeCollection>{
    const pending=this.lock.get(key);if(pending)await pending;
    return clone(this.state.get(key)??{revision:0,records:[]});
  }
  async transact<T>(key:string,fn:(current:KnowledgeCollection)=>
    Promise<{next:KnowledgeCollection;result:T}>):Promise<T>{
    const previous=this.lock.get(key)??Promise.resolve();
    let release:()=>void=()=>{};
    const pending=new Promise<void>(r=>{release=r;});
    const chain=previous.then(()=>pending);
    this.lock.set(key,chain);await previous;
    try{
      const current=clone(this.state.get(key)??{revision:0,records:[]});
      const out=await fn(current);
      if(out.next.revision!==current.revision+1 || out.next.records.length>200)
        throw new Error('AI_NEXT_MEMORY_TRANSACTION_INVALID');
      this.state.set(key,clone(out.next));
      return clone(out.result);
    }finally{release();if(this.lock.get(key)===chain)this.lock.delete(key);}
  }
}
export interface ExplicitKnowledgeConsent {
  /** An explicit, authenticated user action; never model-inferred. */
  approved:true;
  consentId:string;
  actorId:string;
  approvedAt:string;
}
export class ScopedKnowledgeService {
  constructor(private readonly backend:AtomicKnowledgeBackend){}
  async promote(input:{
    scope:AuthenticatedScope;memoryId:string;content:string;kind:KnowledgeKind;
    sourceThreadId:string;sourceTurnId:string;sourceDocumentId:string|null;
    expiresAt:string;consent:ExplicitKnowledgeConsent;
  }):Promise<KnowledgeRecord>{
    const {scope,memoryId,content,kind,expiresAt,consent}=input;
    const key=knowledgeScopeKey(scope);
    if(!consent||consent.approved!==true || consent.actorId!==scope.actorId ||
      !id(consent.consentId)||!time(consent.approvedAt)||!time(expiresAt) ||
      Date.parse(expiresAt)<=Date.parse(consent.approvedAt) ||
      !id(memoryId)||!id(input.sourceThreadId)||!id(input.sourceTurnId)||
      input.sourceThreadId!==scope.threadId ||
      (input.sourceDocumentId!==null&&!id(input.sourceDocumentId)) ||
      typeof content!=='string'||!content.trim()||content.length>3000 ||
      !['preference','fact','goal','note'].includes(kind))
      throw new Error('AI_NEXT_MEMORY_EXPLICIT_CONSENT_REQUIRED');
    return this.backend.transact(key,async current=>{
      const previous=current.records.find(x=>x.memoryId===memoryId);
      if(previous){
        if(previous.revokedAt!==null)throw new Error('AI_NEXT_MEMORY_REVOKED_TOMBSTONE');
        if(previous.consentId!==consent.consentId ||
          previous.content!==content || previous.expiresAt!==expiresAt)
          throw new Error('AI_NEXT_MEMORY_IDEMPOTENCY_COLLISION');
        // Immutable consent replay: same memory never appends duplicate.
        // Backend requires +1 revision; emulate read-only replay outside
        // transaction in future; in this synthetic transaction increment only ledger version.
        return {next:{revision:current.revision+1,records:current.records},result:previous};
      }
      const record:KnowledgeRecord={
        schemaVersion:1,memoryId,ownerKey:key,content,kind,
        sourceThreadId:input.sourceThreadId,sourceTurnId:input.sourceTurnId,
        sourceDocumentId:input.sourceDocumentId,consentId:consent.consentId,
        approvedByActorId:consent.actorId,createdAt:consent.approvedAt,
        expiresAt,revokedAt:null,version:1,
      };
      return {next:{revision:current.revision+1,
        records:[...current.records,record]},result:record};
    });
  }
  async revoke(input:{
    scope:AuthenticatedScope;memoryId:string;now:string;actorId:string;
  }):Promise<KnowledgeRecord>{
    const key=knowledgeScopeKey(input.scope);
    if(input.actorId!==input.scope.actorId || !id(input.memoryId)||!time(input.now))
      throw new Error('AI_NEXT_MEMORY_REVOKE_NOT_AUTHORIZED');
    return this.backend.transact(key,async current=>{
      const index=current.records.findIndex(x=>x.memoryId===input.memoryId);
      if(index<0)throw new Error('AI_NEXT_MEMORY_NOT_FOUND_OR_FORBIDDEN');
      const record=current.records[index]!;
      if(Date.parse(input.now)<Date.parse(record.createdAt))
        throw new Error('AI_NEXT_INVALID_MEMORY_TIME');
      const revoked=record.revokedAt===null?{
        ...record,content:null,revokedAt:input.now,version:record.version+1,
      }:record;
      const records=[...current.records];records[index]=revoked;
      return {next:{revision:current.revision+1,records},result:revoked};
    });
  }
  async list(input:{scope:AuthenticatedScope;now:string}):Promise<KnowledgeRecord[]>{
    const key=knowledgeScopeKey(input.scope);
    if(!time(input.now))throw new Error('AI_NEXT_INVALID_MEMORY_TIME');
    const current=await this.backend.read(key);
    return current.records.filter(r=>r.ownerKey===key&&r.revokedAt===null &&
      Date.parse(r.expiresAt)>Date.parse(input.now) && r.content!==null).map(clone);
  }
  async exportAudit(input:{scope:AuthenticatedScope}):Promise<Array<{
    memoryId:string;sourceTurnId:string;createdAt:string;expiresAt:string;
    revokedAt:string|null;hasContent:boolean;
  }>>{
    const key=knowledgeScopeKey(input.scope),current=await this.backend.read(key);
    return current.records.filter(r=>r.ownerKey===key).map(r=>({
      memoryId:r.memoryId,sourceTurnId:r.sourceTurnId,createdAt:r.createdAt,
      expiresAt:r.expiresAt,revokedAt:r.revokedAt,hasContent:r.content!==null,
    }));
  }
}
