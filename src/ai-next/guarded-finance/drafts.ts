/**
 * R04 isolated quotation review editor. No financial persistence, no providers.
 * Original source row positions are evidence; never price a line from cost.
 */
import type {AuthenticatedScope, ReviewDraft, Coverage, DocumentEvidence} from '../domain/contracts.js';
import {assertCoreContract} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';

export const R04_LIVE_WRITES_ENABLED=false as const;
const MAX_LINES=120; // existing verified financial editor limit, not silently expanded
const copy=<T>(v:T):T=>structuredClone(v);
const id=(x:string):boolean=>typeof x==='string'&&x.length>0&&x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const iso=(x:string):boolean=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(x)&&!Number.isNaN(Date.parse(x));
const money=(x:string|null,positive=false):boolean=>x!==null&&/^(?:0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(x)&&
  (!positive||Number(x)>0);
const hashPattern=/^[a-f0-9]{64}$/;
export class R04ReviewError extends Error {
  constructor(public readonly code:string){super(code);}
}
function canonical(v:unknown):string {
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number')
    return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
  if(v&&typeof v==='object')
    return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b))
      .map(([k,value])=>JSON.stringify(k)+':'+canonical(value)).join(',')+'}';
  throw new R04ReviewError('UNSUPPORTED_HASH_INPUT');
}
export async function reviewHash(data:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(canonical(data));
  const owned=new Uint8Array(new ArrayBuffer(bytes.length));owned.set(bytes);
  const hashed=await crypto.subtle.digest('SHA-256',owned);
  return Array.from(new Uint8Array(hashed),x=>x.toString(16).padStart(2,'0')).join('');
}
function hashable(draft:ReviewDraft):unknown{
  return {
    scope:draft.scope,draftId:draft.draftId,draftRevision:draft.draftRevision,
    kind:draft.kind,sourceIds:draft.sourceIds,
    sourceManifestHash:draft.sourceManifestHash,lineItems:draft.lineItems,
    explicitCustomerId:draft.explicitCustomerId,currency:draft.currency,
    status:draft.status,fieldStatus:draft.fieldStatus,
    businessValidation:draft.businessValidation,
  };
}
async function seal(d:ReviewDraft):Promise<ReviewDraft>{
  d.immutableRevisionHash=await reviewHash(hashable(d));
  assertCoreContract('ReviewDraft',d);
  return d;
}
export interface ReviewLine {
  lineId:string;description:string;quantity:string|null;unit:string|null;
  sellingUnitPrice:string|null;currency:string|null;evidenceRefs:string[];
}
export type DraftEditorChange =
 | {kind:'line_patch';lineId:string;patch:Partial<Pick<ReviewLine,
    'description'|'quantity'|'unit'|'sellingUnitPrice'|'currency'>>}
 | {kind:'set_customer';customerId:string|null}
 | {kind:'set_currency';currency:string|null}
 | {kind:'append_line';line:ReviewLine}
 | {kind:'remove_line';lineId:string};
const lineValid=(l:ReviewLine,currency:string|null):boolean=>
  id(l.lineId)&&!!l.description.trim()&&l.description.length<=3000 &&
  money(l.quantity,true)&&id(l.unit??'')&&money(l.sellingUnitPrice)&&
  currency!==null&&l.currency===currency;
function blockers(d:ReviewDraft):string[]{
  const errors:string[]=[];
  if(d.kind!=='analysis'&&!id(d.explicitCustomerId??''))errors.push('CUSTOMER_REQUIRED');
  if(d.kind!=='analysis'&&!d.lineItems.length)errors.push('ITEMS_REQUIRED');
  if(d.kind!=='analysis'&&d.lineItems.length>MAX_LINES)errors.push('EDITOR_120_LINES_LIMIT');
  if(!d.currency||!/^[A-Z]{3}$/.test(d.currency))errors.push('CURRENCY_REQUIRED');
  const seen=new Set<string>();
  for(const line of d.lineItems){
    if(!id(line.lineId)||seen.has(line.lineId))errors.push('DUPLICATE_LINE_ID');
    seen.add(line.lineId);
    if(!lineValid(line,d.currency))errors.push('LINE_UNVERIFIED:'+line.lineId);
  }
  return [...new Set(errors)];
}
function roughStatus(d:ReviewDraft):ReviewDraft{
  const issues=blockers(d);
  d.businessValidation={valid:false,blockers:issues};
  d.status='needs_review';d.approvalReceiptId=null;
  d.fieldStatus=[
    {field:'customer',status:id(d.explicitCustomerId??'')?'uncertain':'missing'},
    ...d.lineItems.map(x=>({field:'line_'+x.lineId,
      status:lineValid(x,d.currency)?'uncertain' as const:'missing' as const})),
  ];
  return d;
}
export async function newReviewDraft(input:{
  scope:AuthenticatedScope;draftId:string;kind:ReviewDraft['kind'];
  sourceIds:string[];sourceManifestHash:string;
  lineItems:ReviewLine[];customerId:string|null;currency:string|null;now:string;
}):Promise<ReviewDraft>{
  const {scope}=input;
  exactScopeKey(scope);
  if(!id(input.draftId)||!iso(input.now)||!hashPattern.test(input.sourceManifestHash)||
    input.lineItems.length>MAX_LINES||new Set(input.sourceIds).size!==input.sourceIds.length||
    input.sourceIds.some(x=>!id(x)) ||
    new Set(input.lineItems.map(x=>x.lineId)).size!==input.lineItems.length)
    throw new R04ReviewError('INVALID_NEW_DRAFT');
  const d:ReviewDraft={
    schemaVersion:1,scope:copy(scope),draftId:input.draftId,draftRevision:1,
    threadId:scope.threadId,kind:input.kind,status:'unsaved',
    sourceIds:[...input.sourceIds],sourceManifestHash:input.sourceManifestHash,
    lineItems:copy(input.lineItems),explicitCustomerId:input.customerId,
    currency:input.currency,fieldStatus:[],immutableRevisionHash:'0'.repeat(64),
    createdAt:input.now,updatedAt:input.now,undoBaseRevision:null,
    editEvents:[],businessValidation:{valid:false,blockers:[]},
    approvalReceiptId:null,
  };
  return seal(roughStatus(d));
}
function ensureTime(prev:string,now:string):void{
  if(!iso(now)||Date.parse(now)<Date.parse(prev))throw new R04ReviewError('INVALID_DRAFT_TIME');
}
export class SyntheticDraftEditor {
  private current:ReviewDraft;
  private undoStack:ReviewDraft[]=[];
  private redoStack:ReviewDraft[]=[];
  private constructor(initial:ReviewDraft){this.current=copy(initial);}
  static async create(initial:ReviewDraft):Promise<SyntheticDraftEditor>{
    assertCoreContract('ReviewDraft',initial);
    if(initial.status!=='needs_review'||initial.draftRevision!==1 ||
      initial.immutableRevisionHash!==await reviewHash(hashable(initial)))
      throw new R04ReviewError('INVALID_DRAFT_INITIAL_STATE');
    return new SyntheticDraftEditor(initial);
  }
  /**
   * R07R: reopen a verified UNSAVED review revision for one scoped CAS edit.
   * Unlike create(), this admits a later revision. Undo/redo stacks are
   * intentionally NOT reconstructed from edit-event summaries: doing so
   * without prior immutable snapshots could invent history.
   */
  static async resume(initial:ReviewDraft):Promise<SyntheticDraftEditor>{
    assertCoreContract('ReviewDraft',initial);
    if(initial.kind!=='quotation'||initial.status!=='needs_review'||
      initial.approvalReceiptId!==null||
      initial.immutableRevisionHash!==await reviewHash(hashable(initial)))
      throw new R04ReviewError('INVALID_RESUMED_DRAFT');
    return new SyntheticDraftEditor(initial);
  }
  view():ReviewDraft{return copy(this.current);}
  private async revise(previous:ReviewDraft,changed:ReviewDraft,kind:string,
      lineId:string|null,now:string):Promise<ReviewDraft>{
    changed.draftRevision=previous.draftRevision+1;
    changed.updatedAt=now;changed.undoBaseRevision=previous.draftRevision;
    changed.editEvents=[...previous.editEvents,{revision:changed.draftRevision,kind,lineId}];
    changed.approvalReceiptId=null;
    return seal(roughStatus(changed));
  }
  async edit(input:{expectedRevision:number;change:DraftEditorChange;now:string}):Promise<ReviewDraft>{
    const prior=this.current;
    if(prior.draftRevision!==input.expectedRevision)
      throw new R04ReviewError('STALE_DRAFT_REVISION');
    if(prior.status==='discarded'||prior.status==='saved')
      throw new R04ReviewError('DRAFT_CLOSED');
    ensureTime(prior.updatedAt,input.now);
    const next=copy(prior),change=input.change;
    if(change.kind==='line_patch'){
      const line=next.lineItems.find(x=>x.lineId===change.lineId);
      if(!line || !Object.keys(change.patch).length ||
        Object.keys(change.patch).some(x=>!['description','quantity','unit','sellingUnitPrice','currency'].includes(x)))
        throw new R04ReviewError('INVALID_LINE_TARGET');
      Object.assign(line,copy(change.patch));
    }else if(change.kind==='set_customer')next.explicitCustomerId=change.customerId;
    else if(change.kind==='set_currency')next.currency=change.currency;
    else if(change.kind==='append_line'){
      if(next.lineItems.length>=MAX_LINES||next.lineItems.some(x=>x.lineId===change.line.lineId))
        throw new R04ReviewError('LINE_CAP_OR_ID_COLLISION');
      next.lineItems.push(copy(change.line));
    }else if(change.kind==='remove_line'){
      const index=next.lineItems.findIndex(x=>x.lineId===change.lineId);
      if(index<0)throw new R04ReviewError('INVALID_LINE_TARGET');
      next.lineItems.splice(index,1);
    }else throw new R04ReviewError('UNKNOWN_EDIT_KIND');
    const updated=await this.revise(prior,next,change.kind,
      'lineId' in change?change.lineId:null,input.now);
    this.undoStack.push(copy(prior));this.redoStack=[];this.current=updated;
    return copy(updated);
  }
  async review(input:{
    expectedRevision:number;actorId:string;now:string;
    checkedLineIds:string[];currentSourceCoverages:Coverage[];
    businessRevision:string;businessValidationPassed:boolean;
    trustedSourceManifestHash:string;
    trustedEvidence:ReadonlyArray<DocumentEvidence>;
  }):Promise<ReviewDraft>{
    const p=this.current;ensureTime(p.updatedAt,input.now);
    if(p.draftRevision!==input.expectedRevision||input.actorId!==p.scope.actorId)
      throw new R04ReviewError('STALE_OR_FOREIGN_REVIEW');
    if(p.scope.scopeType!=='business'||p.scope.role==='viewer'||
      !id(input.businessRevision)||!input.businessValidationPassed)
      throw new R04ReviewError('FINANCIAL_REVIEW_NOT_AUTHORIZED');
    const ids=p.lineItems.map(x=>x.lineId);
    if(ids.length!==input.checkedLineIds.length||
      new Set(input.checkedLineIds).size!==ids.length||
      ids.some(x=>!input.checkedLineIds.includes(x)))
      throw new R04ReviewError('NOT_ALL_LINE_ITEMS_REVIEWED');
    const blockersNow=blockers(p);
    if(blockersNow.length)throw new R04ReviewError('INCOMPLETE_DRAFT:'+blockersNow.join(','));
    // Hash comes from independently resolved authoritative manifests; the
    // client or LLM must not invent a matching review-time source hash.
    if(input.trustedSourceManifestHash!==p.sourceManifestHash)
      throw new R04ReviewError('SOURCE_MANIFEST_CHANGED');
    if(input.currentSourceCoverages.length!==p.sourceIds.length||
      new Set(input.currentSourceCoverages.map(x=>x.documentId)).size!==p.sourceIds.length)
      throw new R04ReviewError('SOURCE_COVERAGE_MISMATCH');
    for(const id of p.sourceIds){
      const cov=input.currentSourceCoverages.find(x=>x.documentId===id);
      if(!cov||exactScopeKey(cov.scope)!==exactScopeKey(p.scope)||
        cov.status!=='complete'||!cov.verifiedAt||
        cov.blockers.length||cov.unprocessedSegments.length||
        cov.perSegment.some(s=>!s.validated||s.status!=='complete'))
        throw new R04ReviewError('SOURCE_NOT_FULLY_VERIFIED');
    }
    if(input.trustedEvidence.length>10_000 ||
      new Set(input.trustedEvidence.map(e=>e.evidenceId)).size!==input.trustedEvidence.length)
      throw new R04ReviewError('INVALID_EVIDENCE_INDEX');
    const evidenceById=new Map(input.trustedEvidence.map(e=>[e.evidenceId,e]));
    for(const line of p.lineItems){
      if(!p.sourceIds.length && line.evidenceRefs.length)
        throw new R04ReviewError('EVIDENCE_NOT_ASSOCIATED_WITH_SOURCE');
      if(p.sourceIds.length && !line.evidenceRefs.length)
        throw new R04ReviewError('LINE_SOURCE_EVIDENCE_REQUIRED');
      for(const ref of line.evidenceRefs){
        const evidence=evidenceById.get(ref);
        if(!evidence || exactScopeKey(evidence.scope)!==exactScopeKey(p.scope) ||
          !p.sourceIds.includes(evidence.documentId) ||
          evidence.provenanceStatus!=='verified' ||
          evidence.verifiedBy!==p.scope.actorId)
          throw new R04ReviewError('LINE_EVIDENCE_NOT_VERIFIED');
      }
      if(p.sourceIds.length && !line.evidenceRefs.some(ref=>{
        const proof=evidenceById.get(ref);
        return proof?.fieldName==='selling_unit_price' &&
          proof.normalizedValue===line.sellingUnitPrice &&
          proof.normalizedUnit===line.unit && proof.currency===line.currency;
      }))
        throw new R04ReviewError('SELLING_PRICE_PROVENANCE_REQUIRED');
    }
    const next=copy(p);next.status='ready_for_approval';
    next.businessValidation={valid:true,blockers:[]};
    next.fieldStatus=next.fieldStatus.map(f=>({...f,status:'verified'}));
    next.draftRevision=p.draftRevision+1;
    next.updatedAt=input.now;next.undoBaseRevision=p.draftRevision;
    next.editEvents=[...p.editEvents,
      {revision:next.draftRevision,kind:'explicit_review',lineId:null}];
    next.approvalReceiptId=null;
    const sealed=await seal(next);
    this.undoStack.push(copy(p));this.redoStack=[];this.current=sealed;
    return copy(sealed);
  }
  async undo(expectedRevision:number,now:string):Promise<ReviewDraft>{
    if(expectedRevision!==this.current.draftRevision)
      throw new R04ReviewError('STALE_DRAFT_REVISION');
    ensureTime(this.current.updatedAt,now);
    const old=this.undoStack.at(-1);
    if(!old)throw new R04ReviewError('NO_UNDO');
    const updated=await this.revise(this.current,copy(old),'undo',null,now);
    this.undoStack.pop();this.redoStack.push(copy(this.current));
    this.current=updated;return copy(updated);
  }
  async redo(expectedRevision:number,now:string):Promise<ReviewDraft>{
    if(expectedRevision!==this.current.draftRevision)
      throw new R04ReviewError('STALE_DRAFT_REVISION');
    ensureTime(this.current.updatedAt,now);
    const old=this.redoStack.at(-1);
    if(!old)throw new R04ReviewError('NO_REDO');
    const updated=await this.revise(this.current,copy(old),'redo',null,now);
    this.redoStack.pop();this.undoStack.push(copy(this.current));
    this.current=updated;return copy(updated);
  }
}
/** Verify independent submitted revision hash before issuing any receipt. */
export async function assertDraftIntegrity(draft:ReviewDraft):Promise<void>{
  assertCoreContract('ReviewDraft',draft);
  if(draft.immutableRevisionHash!==await reviewHash(hashable(draft)))
    throw new R04ReviewError('DRAFT_REVISION_HASH_MISMATCH');
}
