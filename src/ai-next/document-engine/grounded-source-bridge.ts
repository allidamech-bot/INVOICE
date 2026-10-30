/**
 * R07S — read-only scope-bound handoff from R02 immutable source processing
 * to R07P GroundedIntent. Never promotes extraction to verified finance facts.
 * Inactive and unmounted. No provider, Firebase or finance integration.
 */
import type {AuthenticatedScope,GroundedIntent,DocumentEvidence,Coverage}
  from '../domain/contracts.js';
import {assertCoreContract,validateAuthenticatedScope} from '../domain/validation.js';
import {exactScopeKey} from '../domain/turn-journal.js';
import {sha256,R02_LIMITS,type DocumentRun,type SourceObjectRepository}
  from './engine.js';

export const R07S_SOURCE_BINDING_ACTIVE=false as const;
export interface R07SPreview {
  documentId:string;
  evidenceId:string;
  sourceSha256:string;
  fieldName:string;
  rawExcerpt:string;
  truncated:boolean;
  provenanceStatus:DocumentEvidence['provenanceStatus'];
  extractionMethod:DocumentEvidence['extractionMethod'];
  pageNumber:number|null;
  sheetName:string|null;
  rowId:string|null;
  cellReference:string|null;
  /** This reference is not permission to execute accounting changes. */
  financialAuthority:false;
}
export interface R07SSourceStatus {
  documentId:string;
  sourceSha256:string;
  coverageStatus:Coverage['status'];
  originalBytes:number;
  completeSegments:number;
  totalSegments:number;
  totalEvidence:number;
  pendingReviewFacts:number;
  needsReview:boolean;
}
export interface R07SReadBinding {
  status:'review_only'|'incomplete'|'blocked';
  scopeKey:string;
  requestedSourceIds:string[];
  sources:R07SSourceStatus[];
  previews:R07SPreview[];
  hiddenEvidenceCount:number;
  missingSourceIds:string[];
  warnings:string[];
  originalBytesVerified:boolean;
  sourceCoverageComplete:boolean;
  canClaimCompleteDocumentAnswer:false;
  financialWriteAuthorized:false;
}
export class R07SSourceBoundaryError extends Error{
  constructor(readonly code:string){super(code);}
}
const validId=(x:unknown):x is string=>typeof x==='string'&&x.length>0&&
  x.length<=160&&!/[\u0000-\u001f\u007f]/u.test(x);
const unique=(x:readonly string[])=>new Set(x).size===x.length;

export async function bindR07SReadOnly(input:{
  scope:AuthenticatedScope;
  intent:GroundedIntent;
  /** Results must come from trusted R02 processing for this exact scope. */
  runs:readonly DocumentRun[];
  /** Server-authorized original object adapter, not a browser file URL. */
  objects:SourceObjectRepository;
  maxEvidencePreview:number;
}):Promise<R07SReadBinding>{
  const {scope,intent}=input;
  if(!validateAuthenticatedScope(scope))
    throw new R07SSourceBoundaryError('R07S_INVALID_SCOPE');
  const key=exactScopeKey(scope);
  assertCoreContract('GroundedIntent',intent);
  if(exactScopeKey(intent.scope)!==key||intent.executable)
    throw new R07SSourceBoundaryError('R07S_INTENT_AUTHORITY_DENIED');
  if(!['uploaded_only','explicit_combination'].includes(intent.sourcePolicy)||
    !['read_file','analyze','prepare_quote','edit_draft','discuss'].includes(intent.action))
    throw new R07SSourceBoundaryError('R07S_UNSUPPORTED_SOURCE_POLICY');
  const ids=intent.referencedSourceIds;
  if(!ids.length||ids.length>R02_LIMITS.maxAttachments||
    !ids.every(validId)||!unique(ids)||!Number.isSafeInteger(input.maxEvidencePreview)||
    input.maxEvidencePreview<1||input.maxEvidencePreview>200||
    input.runs.length>R02_LIMITS.maxAttachments||
    !unique(input.runs.map(x=>x.documentId)))
    throw new R07SSourceBoundaryError('R07S_INVALID_SOURCE_SET');
  // Do not accept an implicit extra source in a trusted caller's batch.
  if(input.runs.some(x=>!ids.includes(x.documentId)))
    throw new R07SSourceBoundaryError('R07S_UNSELECTED_SOURCE_PRESENT');
  const missing:string[]=[],warnings:string[]=[];
  const sources:R07SSourceStatus[]=[],previews:R07SPreview[]=[];
  let totalEvidence=0,bytesVerified=true,allComplete=true;
  const globalEvidenceIds=new Set<string>();
  for(const documentId of ids){
    const run=input.runs.find(x=>x.documentId===documentId);
    if(!run){missing.push(documentId);allComplete=false;bytesVerified=false;continue;}
    const cov=run.coverage,cp=run.checkpoint;
    assertCoreContract('Coverage',cov);
    if(exactScopeKey(cov.scope)!==key||
      cov.documentId!==documentId||cov.sourceSha256!==run.sourceSha256||
      !cp||cp.documentId!==documentId||cp.scopeKey!==key||
      cp.sourceSha256!==run.sourceSha256||
      cp.extractionRunId!==cov.extractionRunId||
      cp.segments.length!==cov.perSegment.length||
      cp.manifest.parts.length!==cp.segments.length)
      throw new R07SSourceBoundaryError('R07S_SOURCE_RUN_INTEGRITY_FAILED');
    const original=await input.objects.read(key,documentId);
    if(!original||original.scopeKey!==key||
      original.documentId!==documentId||
      original.sha256!==run.sourceSha256||
      original.bytes.length>R02_LIMITS.maxIndividualBytes||
      await sha256(original.bytes)!==run.sourceSha256)
      throw new R07SSourceBoundaryError('R07S_ORIGINAL_SOURCE_NOT_VERIFIED');
    const complete=cov.status==='complete'&&
      cov.perSegment.length>0&&cov.perSegment.every(x=>x.status==='complete'&&
        x.read&&x.parsed&&x.validated&&!x.failureCode);
    if(!complete){
      allComplete=false;
      warnings.push('SOURCE_INCOMPLETE_OR_REQUIRES_REVIEW:'+documentId);
    }
    if(run.evidence.length>R02_LIMITS.maxEvidence)
      throw new R07SSourceBoundaryError('R07S_EVIDENCE_LIMIT');
    for(const e of run.evidence){
      assertCoreContract('DocumentEvidence',e);
      if(globalEvidenceIds.has(e.evidenceId)||exactScopeKey(e.scope)!==key||
        e.documentId!==documentId||e.sourceSha256!==run.sourceSha256||
        e.extractionRunId!==cov.extractionRunId)
        throw new R07SSourceBoundaryError('R07S_UNTRUSTED_EVIDENCE');
      globalEvidenceIds.add(e.evidenceId);
      if(previews.length<input.maxEvidencePreview){
        previews.push({
          documentId,evidenceId:e.evidenceId,sourceSha256:e.sourceSha256,
          fieldName:e.fieldName,rawExcerpt:e.rawValue.slice(0,2000),
          truncated:e.rawValue.length>2000,
          provenanceStatus:e.provenanceStatus,
          extractionMethod:e.extractionMethod,
          pageNumber:e.locator.pageNumber,sheetName:e.locator.sheetName,
          rowId:e.locator.rowId,cellReference:e.locator.cellReference,
          financialAuthority:false,
        });
      }
    }
    totalEvidence+=run.evidence.length;
    const pending=run.evidence.filter(e=>e.provenanceStatus!=='verified').length;
    sources.push({
      documentId,sourceSha256:run.sourceSha256,coverageStatus:cov.status,
      originalBytes:original.bytes.length,
      completeSegments:cov.perSegment.filter(x=>x.status==='complete').length,
      totalSegments:cov.perSegment.length,totalEvidence:run.evidence.length,
      pendingReviewFacts:pending,
      needsReview:pending>0||!complete,
    });
  }
  if(totalEvidence>previews.length)
    warnings.push('EVIDENCE_PREVIEW_BOUNDED_NOT_FULL_SOURCE');
  if(previews.some(p=>p.truncated))
    warnings.push('INDIVIDUAL_EVIDENCE_EXCERPTS_TRUNCATED');
  if(missing.length)warnings.push('REQUESTED_SOURCE_NOT_FOUND');
  const status:R07SReadBinding['status']=missing.length?'blocked':
    allComplete?'review_only':'incomplete';
  return {
    status,scopeKey:key,requestedSourceIds:[...ids],
    sources,previews,hiddenEvidenceCount:totalEvidence-previews.length,
    missingSourceIds:missing,warnings,originalBytesVerified:bytesVerified,
    sourceCoverageComplete:allComplete&&missing.length===0,
    // Full original verification and complete extraction are NOT business
    // verification, human review, nor financial execution permission.
    canClaimCompleteDocumentAnswer:false,financialWriteAuthorized:false,
  };
}
