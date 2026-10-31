/**
 * R07D: isolated, deliberately INACTIVE Firestore Admin draft adapter.
 *
 * Stores only R04 unsaved review quotations. This is NOT a financial document
 * repository and has no save/post/issue/approve/execute capability.
 * Production ACL/IAM, deployed rules, retention and backup are NOT verified.
 */
import type {AuthenticatedScope,ReviewDraft} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {reviewHash} from '../guarded-finance/drafts.js';
import type {TrustedDraftRepository} from '../coordinator/local-coordinator.js';

export const R07D_PRODUCTION_DRAFT_STORAGE_ACTIVATED=false as const;
export const R07D_DRAFT_COLLECTION='aiNextReviewDraftsV1';
/** AI-only review edit receipt root; no financial execution or issue token. */
export const R07D_EDIT_RECEIPT_COLLECTION='aiNextReviewEditReceiptsV1';
export const R07D_MAX_DOCUMENT_BYTES=350_000;
const HASH=/^[0-9a-f]{64}$/u;
const safeId=(x:unknown):x is string=>typeof x==='string'&&
  x.length>0&&x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const clone=<T>(x:T):T=>structuredClone(x);
const isPlain=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&
  !Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
export class R07DDraftStorageError extends Error{
  constructor(readonly code:string){super(code);}
}
export interface R07DReviewEditReceipt {
  schemaVersion:1;scopeKey:string;turnId:string;requestKey:string;
  requestFingerprint:string;expectedRevision:number;expectedHash:string;
  appliedRevision:number;appliedHash:string;
}
export interface R07DReviewEditOutcome {
  draft:ReviewDraft;receipt:R07DReviewEditReceipt;replayed:boolean;
}
interface StoredDraft {
  schemaVersion:1;scopeKey:string;turnId:string;
  draftId:string;draftRevision:number;contentHash:string;
  draft:ReviewDraft;
}
export interface R07DDraftSnapshot{
  exists:boolean;
  data():unknown;
}
export interface R07DDraftReference{
  get():Promise<R07DDraftSnapshot>;
}
export interface R07DDraftTransaction{
  get(ref:R07DDraftReference):Promise<R07DDraftSnapshot>;
  create(ref:R07DDraftReference,value:StoredDraft|R07DReviewEditReceipt):void;
  set(ref:R07DDraftReference,value:StoredDraft):void;
}
export interface R07DDraftFirestore{
  collection(name:string):{doc(id:string):R07DDraftReference};
  runTransaction<T>(fn:(tx:R07DDraftTransaction)=>Promise<T>):Promise<T>;
}
function revisionFields(d:ReviewDraft):unknown{
  // Exact R04 hashable business fields. This is a corruption check, not an
  // HMAC against someone who can write with privileged Admin credentials.
  return {
    scope:d.scope,draftId:d.draftId,draftRevision:d.draftRevision,
    kind:d.kind,sourceIds:d.sourceIds,
    sourceManifestHash:d.sourceManifestHash,lineItems:d.lineItems,
    explicitCustomerId:d.explicitCustomerId,currency:d.currency,
    status:d.status,fieldStatus:d.fieldStatus,
    businessValidation:d.businessValidation,
  };
}
async function validateDraft(scope:AuthenticatedScope,turnId:string,draft:ReviewDraft,
  initial:boolean):Promise<void>{
  if(!safeId(turnId)||!draft||typeof draft!=='object')
    throw new R07DDraftStorageError('R07D_INVALID_DRAFT_INPUT');
  try{assertCoreContract('ReviewDraft',draft);}
  catch{throw new R07DDraftStorageError('R07D_INVALID_DRAFT_CONTRACT');}
  if(exactScopeKey(scope)!==exactScopeKey(draft.scope)||
    draft.threadId!==scope.threadId||draft.draftId!=='draft-'+turnId||
    draft.kind!=='quotation'||draft.status!=='needs_review'||
    draft.approvalReceiptId!==null||
    (initial&&draft.draftRevision!==1)||
    (initial&&draft.editEvents.length!==0)||
    !HASH.test(draft.immutableRevisionHash))
    throw new R07DDraftStorageError('R07D_UNAUTHORIZED_DRAFT');
  if(await reviewHash(revisionFields(draft))!==draft.immutableRevisionHash)
    throw new R07DDraftStorageError('R07D_REVISION_HASH_MISMATCH');
}
async function document(scope:AuthenticatedScope,turnId:string,
  draft:ReviewDraft):Promise<StoredDraft>{
  await validateDraft(scope,turnId,draft,false);
  const output:StoredDraft={
    schemaVersion:1,scopeKey:exactScopeKey(scope),turnId,
    draftId:draft.draftId,draftRevision:draft.draftRevision,
    contentHash:await reviewHash(draft),draft:clone(draft),
  };
  if(new TextEncoder().encode(JSON.stringify(output)).length>R07D_MAX_DOCUMENT_BYTES)
    throw new R07DDraftStorageError('R07D_DRAFT_TOO_LARGE');
  return output;
}
async function decode(snapshot:R07DDraftSnapshot,scope:AuthenticatedScope,
  turnId:string):Promise<StoredDraft|null>{
  if(!snapshot.exists)return null;
  const data=snapshot.data();
  if(!isPlain(data)||Object.keys(data).sort().join(',')!==
    ['schemaVersion','scopeKey','turnId','draftId','draftRevision','contentHash','draft'].sort().join(',')||
    data.schemaVersion!==1||data.scopeKey!==exactScopeKey(scope)||
    data.turnId!==turnId||data.draftId!=='draft-'+turnId||
    !HASH.test(String(data.contentHash))||
    typeof data.draftRevision!=='number'||
    !Number.isSafeInteger(data.draftRevision)||
    data.draftRevision<1||!isPlain(data.draft))
    throw new R07DDraftStorageError('R07D_CORRUPT_DOCUMENT');
  const stored=data as unknown as StoredDraft;
  if(stored.draftId!==stored.draft.draftId||
    stored.draftRevision!==stored.draft.draftRevision)
    throw new R07DDraftStorageError('R07D_CORRUPT_REVISION');
  await validateDraft(scope,turnId,stored.draft,false);
  if(await reviewHash(stored.draft)!==stored.contentHash)
    throw new R07DDraftStorageError('R07D_STORED_INTEGRITY_MISMATCH');
  if(new TextEncoder().encode(JSON.stringify(stored)).length>R07D_MAX_DOCUMENT_BYTES)
    throw new R07DDraftStorageError('R07D_CORRUPT_OVERSIZED_DOCUMENT');
  return clone(stored);
}
async function identifier(scope:AuthenticatedScope,turnId:string):Promise<string>{
  if(!safeId(turnId))throw new R07DDraftStorageError('R07D_INVALID_TURN_ID');
  const bytes=new TextEncoder().encode(JSON.stringify([exactScopeKey(scope),turnId]));
  const value=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(value),x=>x.toString(16).padStart(2,'0')).join('');
}
function assertReceiptInput(input:{
  scope:AuthenticatedScope;turnId:string;requestKey:string;
  requestFingerprint:string;expectedRevision:number;expectedHash:string;
}):void{
  if(!safeId(input.turnId)||!safeId(input.requestKey)||
    !HASH.test(input.requestFingerprint)||!HASH.test(input.expectedHash)||
    !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<1)
    throw new R07DDraftStorageError('R07D_INVALID_EDIT_REQUEST');
}
function verifyReceipt(value:unknown,input:{
  scope:AuthenticatedScope;turnId:string;requestKey:string;
  requestFingerprint:string;expectedRevision:number;expectedHash:string;
}):R07DReviewEditReceipt{
  if(!isPlain(value)||Object.keys(value).sort().join(',')!==
    ['schemaVersion','scopeKey','turnId','requestKey','requestFingerprint',
      'expectedRevision','expectedHash','appliedRevision','appliedHash'].sort().join(',')||
    value.schemaVersion!==1||value.scopeKey!==exactScopeKey(input.scope)||
    value.turnId!==input.turnId||value.requestKey!==input.requestKey||
    !HASH.test(String(value.requestFingerprint))||
    !HASH.test(String(value.expectedHash))||
    !HASH.test(String(value.appliedHash))||
    !Number.isSafeInteger(value.expectedRevision)||
    !Number.isSafeInteger(value.appliedRevision)||
    value.appliedRevision!==Number(value.expectedRevision)+1)
    throw new R07DDraftStorageError('R07D_CORRUPT_EDIT_RECEIPT');
  if(value.requestFingerprint!==input.requestFingerprint||
    value.expectedRevision!==input.expectedRevision||
    value.expectedHash!==input.expectedHash)
    throw new R07DDraftStorageError('R07D_EDIT_REQUEST_COLLISION');
  return clone(value as unknown as R07DReviewEditReceipt);
}
function guardRevision(prior:StoredDraft,next:ReviewDraft,
  expectedRevision:number,expectedHash:string):void{
  if(prior.draftRevision!==expectedRevision||
    prior.draft.immutableRevisionHash!==expectedHash)
    throw new R07DDraftStorageError('R07D_STALE_DRAFT_REVISION');
  if(prior.draft.status!=='needs_review'||prior.draft.approvalReceiptId!==null||
    next.createdAt!==prior.draft.createdAt||
    Date.parse(next.updatedAt)<Date.parse(prior.draft.updatedAt)||
    next.undoBaseRevision!==prior.draftRevision||
    next.editEvents.length!==prior.draft.editEvents.length+1||
    JSON.stringify(next.editEvents.slice(0,-1))!==
      JSON.stringify(prior.draft.editEvents)||
    next.editEvents.at(-1)?.revision!==next.draftRevision||
    JSON.stringify(next.sourceIds)!==JSON.stringify(prior.draft.sourceIds)||
    next.sourceManifestHash!==prior.draft.sourceManifestHash||
    next.draftId!==prior.draftId)
    throw new R07DDraftStorageError('R07D_FORBIDDEN_DRAFT_REWRITE');
}
export class R07DExperimentalFirestoreDraftStore implements TrustedDraftRepository{
  constructor(private readonly database:R07DDraftFirestore){}
  private async ref(scope:AuthenticatedScope,turnId:string):Promise<R07DDraftReference>{
    return this.database.collection(R07D_DRAFT_COLLECTION).doc(await identifier(scope,turnId));
  }
  private async receiptRef(scope:AuthenticatedScope,turnId:string,
    requestKey:string):Promise<R07DDraftReference>{
    const base=await identifier(scope,turnId),key=await crypto.subtle.digest(
      'SHA-256',new TextEncoder().encode(JSON.stringify([base,requestKey])));
    const id=Array.from(new Uint8Array(key),x=>x.toString(16).padStart(2,'0')).join('');
    return this.database.collection(R07D_EDIT_RECEIPT_COLLECTION).doc(id);
  }
  async read(scope:AuthenticatedScope,turnId:string):Promise<ReviewDraft|null>{
    const ref=await this.ref(scope,turnId);
    const saved=await decode(await ref.get(),scope,turnId);
    return saved?clone(saved.draft):null;
  }
  async createIfAbsent(scope:AuthenticatedScope,turnId:string,
    draft:ReviewDraft):Promise<ReviewDraft>{
    await validateDraft(scope,turnId,draft,true);
    const desired=await document(scope,turnId,draft),ref=await this.ref(scope,turnId);
    return this.database.runTransaction(async tx=>{
      const prior=await decode(await tx.get(ref),scope,turnId);
      if(prior){
        if(prior.contentHash!==desired.contentHash||
          prior.draftRevision!==1)
          throw new R07DDraftStorageError('R07D_CREATE_IDEMPOTENCY_COLLISION');
        return clone(prior.draft);
      }
      tx.create(ref,desired);
      return clone(desired.draft);
    });
  }
  /**
   * R04 editor output only. This CAS does NOT change any financial records
   * or approve/issue a draft. Stale revisions and source substitution fail.
   */
  async replaceReviewRevision(input:{
    scope:AuthenticatedScope;turnId:string;
    expectedRevision:number;expectedHash:string;next:ReviewDraft;
  }):Promise<ReviewDraft>{
    const {scope,turnId,expectedRevision,expectedHash,next}=input;
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||
      !HASH.test(expectedHash))
      throw new R07DDraftStorageError('R07D_INVALID_REVISION_CONDITION');
    await validateDraft(scope,turnId,next,false);
    if(next.draftRevision!==expectedRevision+1)
      throw new R07DDraftStorageError('R07D_SKIPPED_DRAFT_REVISION');
    const prepared=await document(scope,turnId,next);
    const ref=await this.ref(scope,turnId);
    return this.database.runTransaction(async tx=>{
      const prior=await decode(await tx.get(ref),scope,turnId);
      if(!prior)throw new R07DDraftStorageError('R07D_STALE_DRAFT_REVISION');
      guardRevision(prior,next,expectedRevision,expectedHash);
      tx.set(ref,prepared);
      return clone(next);
    });
  }
  /**
   * Bounded atomic R07R receipt + R07D draft CAS in the SAME Firestore
   * transaction. Replays return current draft plus immutable applied revision,
   * never a stale historical draft snapshot. This is not an R07M turn receipt.
   */
  async readEditReceipt(input:{
    scope:AuthenticatedScope;turnId:string;requestKey:string;
    requestFingerprint:string;expectedRevision:number;expectedHash:string;
  }):Promise<R07DReviewEditOutcome|null>{
    assertReceiptInput(input);
    const draftRef=await this.ref(input.scope,input.turnId);
    const receiptRef=await this.receiptRef(
      input.scope,input.turnId,input.requestKey);
    return this.database.runTransaction(async tx=>{
      const [receiptSnap,draftSnap]=await Promise.all([
        tx.get(receiptRef),tx.get(draftRef),
      ]);
      if(!receiptSnap.exists)return null;
      const receipt=verifyReceipt(receiptSnap.data(),input);
      const saved=await decode(draftSnap,input.scope,input.turnId);
      if(!saved||saved.draftRevision<receipt.appliedRevision||
        (saved.draftRevision===receipt.appliedRevision&&
          saved.draft.immutableRevisionHash!==receipt.appliedHash))
        throw new R07DDraftStorageError('R07D_EDIT_RECEIPT_DRAFT_DIVERGED');
      return {draft:clone(saved.draft),receipt,replayed:true};
    });
  }
  async replaceReviewRevisionWithReceipt(input:{
    scope:AuthenticatedScope;turnId:string;requestKey:string;
    requestFingerprint:string;expectedRevision:number;expectedHash:string;
    next:ReviewDraft;
  }):Promise<R07DReviewEditOutcome>{
    assertReceiptInput(input);
    await validateDraft(input.scope,input.turnId,input.next,false);
    if(input.next.draftRevision!==input.expectedRevision+1)
      throw new R07DDraftStorageError('R07D_SKIPPED_DRAFT_REVISION');
    const prepared=await document(input.scope,input.turnId,input.next);
    const draftRef=await this.ref(input.scope,input.turnId);
    const receiptRef=await this.receiptRef(
      input.scope,input.turnId,input.requestKey);
    return this.database.runTransaction(async tx=>{
      // Firestore requires every read before the first write.
      const [receiptSnap,draftSnap]=await Promise.all([
        tx.get(receiptRef),tx.get(draftRef),
      ]);
      const prior=await decode(draftSnap,input.scope,input.turnId);
      if(receiptSnap.exists){
        const receipt=verifyReceipt(receiptSnap.data(),input);
        if(!prior||prior.draftRevision<receipt.appliedRevision||
          (prior.draftRevision===receipt.appliedRevision&&
            prior.draft.immutableRevisionHash!==receipt.appliedHash))
          throw new R07DDraftStorageError('R07D_EDIT_RECEIPT_DRAFT_DIVERGED');
        return {draft:clone(prior.draft),receipt,replayed:true};
      }
      if(!prior)
        throw new R07DDraftStorageError('R07D_STALE_DRAFT_REVISION');
      guardRevision(prior,input.next,input.expectedRevision,input.expectedHash);
      const receipt:R07DReviewEditReceipt={
        schemaVersion:1,scopeKey:exactScopeKey(input.scope),
        turnId:input.turnId,requestKey:input.requestKey,
        requestFingerprint:input.requestFingerprint,
        expectedRevision:input.expectedRevision,
        expectedHash:input.expectedHash,
        appliedRevision:input.next.draftRevision,
        appliedHash:input.next.immutableRevisionHash,
      };
      tx.set(draftRef,prepared);
      tx.create(receiptRef,receipt);
      return {draft:clone(input.next),receipt:clone(receipt),replayed:false};
    });
  }

}
