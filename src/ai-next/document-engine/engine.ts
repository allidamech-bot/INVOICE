/**
 * LOUREX AI Next Generation R02 — isolated source/evidence engine.
 *
 * This is a pure, injected-adapter engine. No Firebase, finance, network,
 * LLM, or OCR vendor is activated. Stores only into an injected repository.
 * The original source bytes are NEVER replaced with a shortened prompt.
 */
import type { AuthenticatedScope, Coverage, DocumentEvidence, CompletenessStatus } from '../domain/contracts.js';
import { assertCoreContract, validateAuthenticatedScope } from '../domain/validation.js';

export type SourceFormat = 'pdf' | 'csv' | 'xlsx' | 'xls' | 'text' | 'image';
export interface SourceFile {
  documentId: string;
  fileName: string;
  mimeType: string;
  format: SourceFormat;
  bytes: Uint8Array;
}
export interface SegmentDescriptor {
  segmentId: string;
  pageNumber: number | null;
  sheetName: string | null;
  rowNumber: number | null;
  tableId: string | null;
}
export interface SegmentRead {
  text?: string;
  cells?: ReadonlyArray<{columnNumber: number; rawValue: string}>;
  /** A scanner/provider OCR result is not human-verified. */
  requiresReview?: boolean;
  extractionMethod: DocumentEvidence['extractionMethod'];
  confidence?: number | null;
}
export interface SourceManifest {
  sourceFormat: SourceFormat;
  parts: SegmentDescriptor[];
  expectedPageCount: number | null;
  expectedSheets: string[];
  expectedTableRows: Array<{tableId: string; count: number | null}>;
}
export interface DocumentSourceAdapter {
  readonly format: SourceFormat;
  discover(file: SourceFile, signal?: AbortSignal): Promise<SourceManifest>;
  read(file: SourceFile, part: SegmentDescriptor, signal?: AbortSignal): Promise<SegmentRead>;
}
export interface SourceObject {
  documentId: string;
  scopeKey: string;
  sha256: string;
  bytes: Uint8Array;
  format: SourceFormat;
  fileName: string;
}
export interface SourceObjectRepository {
  store(source: SourceObject): Promise<void>;
  read(scopeKey: string, documentId: string): Promise<SourceObject | null>;
}
export interface DocumentCheckpoint {
  schemaVersion: 1;
  documentId: string;
  scopeKey: string;
  sourceSha256: string;
  extractionRunId: string;
  manifest: SourceManifest;
  segments: Array<{part: SegmentDescriptor; result: SegmentRead | null; failureCode: string | null}>;
}
export interface DocumentRun {
  documentId: string;
  sourceSha256: string;
  evidence: DocumentEvidence[];
  coverage: Coverage;
  checkpoint: DocumentCheckpoint;
  /** This engine never grants authority to issue a financial document. */
  financialDraftEligible: false;
}
export interface ProcessingInput {
  source: SourceFile;
  scope: AuthenticatedScope; // caller must inject VERIFIED server scope
  adapter: DocumentSourceAdapter;
  repository: SourceObjectRepository;
  runId: string;
  now: string;
  checkpoint?: DocumentCheckpoint;
  signal?: AbortSignal;
  onObservedProgress?: (event: {
    documentId: string; segmentId: string; processedSegments: number;
    totalSegments: number; status: CompletenessStatus;
  }) => void;
}
export const R02_LIMITS = Object.freeze({
  maxAttachments: 10,
  maxBatchBytes: 120_000_000,
  maxIndividualBytes: 60_000_000,
  maxSegments: 10_000,
  maxEvidence: 100_000,
  maxCellChars: 100_000,
  evidenceTextChunk: 20_000,
  maxSegmentChars: 1_000_000,
  maxFilename: 240,
});
export class DocumentProcessingError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'DocumentProcessingError';
  }
}
const asBytes = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes);
const scopeKey = (s: AuthenticatedScope): string => JSON.stringify([
  s.ownerUid,s.accountId,s.companyId,s.branchId,s.threadId,s.actorId,
  s.role,s.scopeType,s.authorizationVersion,
]);
export function sourceScopeKey(s: AuthenticatedScope): string {
  if (!validateAuthenticatedScope(s)) throw new DocumentProcessingError('INVALID_SCOPE');
  return scopeKey(s);
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const owned = new Uint8Array(new ArrayBuffer(bytes.length));
  owned.set(bytes);
  const hash = await crypto.subtle.digest('SHA-256', owned);
  return Array.from(new Uint8Array(hash), c => c.toString(16).padStart(2,'0')).join('');
}
export class SyntheticSourceRepository implements SourceObjectRepository {
  private objects = new Map<string, SourceObject>();
  async store(source: SourceObject): Promise<void> {
    const key = JSON.stringify([source.scopeKey,source.documentId]);
    const previous = this.objects.get(key);
    if (previous && previous.sha256 !== source.sha256)
      throw new DocumentProcessingError('SOURCE_REVISION_COLLISION');
    if (!previous) this.objects.set(key,{...source,bytes:asBytes(source.bytes)});
  }
  async read(key: string, documentId: string): Promise<SourceObject | null> {
    const found = this.objects.get(JSON.stringify([key,documentId]));
    return found ? {...found,bytes:asBytes(found.bytes)} : null;
  }
}
/**
 * A failed/retried source is never silently substituted. The caller must
 * provide all source IDs and verify per-source coverage.
 */
export function verifyAttachmentBatch(files: readonly SourceFile[]): void {
  if (!files.length || files.length > R02_LIMITS.maxAttachments)
    throw new DocumentProcessingError('INVALID_ATTACHMENT_COUNT');
  let bytes = 0;
  const ids = new Set<string>();
  for (const f of files) {
    if (!f.documentId || ids.has(f.documentId)) throw new DocumentProcessingError('DUPLICATE_DOCUMENT_ID');
    if (!f.fileName || f.fileName.length > R02_LIMITS.maxFilename ||
      /[\u0000-\u001f\u007f]/u.test(f.fileName)) throw new DocumentProcessingError('INVALID_FILENAME');
    if (!(f.bytes instanceof Uint8Array) || f.bytes.length === 0 ||
      f.bytes.length > R02_LIMITS.maxIndividualBytes)
      throw new DocumentProcessingError('INVALID_ATTACHMENT_SIZE');
    ids.add(f.documentId);
    bytes += f.bytes.length;
  }
  if (bytes > R02_LIMITS.maxBatchBytes) throw new DocumentProcessingError('ATTACHMENT_BATCH_TOO_LARGE');
}
const cancelled = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DocumentProcessingError('PROCESSING_CANCELLED');
};
const validateManifest = (manifest: SourceManifest, format: SourceFormat): void => {
  if (manifest.sourceFormat !== format || !Array.isArray(manifest.parts) ||
    manifest.parts.length < 1 || manifest.parts.length > R02_LIMITS.maxSegments)
    throw new DocumentProcessingError('INVALID_SOURCE_MANIFEST');
  const ids = manifest.parts.map(x => x.segmentId);
  if (ids.some(id => typeof id !== 'string' || !id || id.length > 160) ||
    new Set(ids).size !== ids.length)
    throw new DocumentProcessingError('DUPLICATE_OR_INVALID_SEGMENTS');
  if (manifest.expectedPageCount !== null &&
    (!Number.isSafeInteger(manifest.expectedPageCount) || manifest.expectedPageCount < 1 ||
      new Set(manifest.parts.map(p => p.pageNumber).filter(p => p !== null)).size !== manifest.expectedPageCount))
    throw new DocumentProcessingError('PAGE_MANIFEST_MISMATCH');
  if (manifest.expectedSheets.length !== new Set(manifest.expectedSheets).size ||
    manifest.expectedSheets.some(s => typeof s !== 'string' || !s || s.length > 160))
    throw new DocumentProcessingError('INVALID_SHEET_MANIFEST');
  const tableIds = manifest.expectedTableRows.map(t => t.tableId);
  if (tableIds.some(t => !t || t.length > 160) || new Set(tableIds).size !== tableIds.length)
    throw new DocumentProcessingError('INVALID_TABLE_MANIFEST');
  for (const table of manifest.expectedTableRows) {
    const actualCount = manifest.parts.filter(p => p.tableId === table.tableId).length;
    if (table.count !== null && table.count !== actualCount)
      throw new DocumentProcessingError('ROW_MANIFEST_MISMATCH');
  }
};
const errorCode = (e: unknown): string => {
  if (e instanceof DocumentProcessingError) return e.code;
  const code = e instanceof Error && /^[A-Z][A-Z0-9_]{2,79}$/.test(e.message) ? e.message : '';
  return code || 'SEGMENT_EXTRACTION_FAILED';
};
const clone = <T>(value: T): T => structuredClone(value);
const utf8Length = (text: string): number => new TextEncoder().encode(text).length;
const columnRef = (number: number): string => {
  if (!Number.isSafeInteger(number) || number < 1 || number > 16384)
    throw new DocumentProcessingError('INVALID_COLUMN');
  let n = number, out = '';
  while (n > 0) { n--;out = String.fromCharCode(65 + n % 26) + out;n = Math.floor(n / 26); }
  return out;
};
function evidenceFor(
  source: SourceFile, scope: AuthenticatedScope, sha: string,
  run: string, now: string, part: SegmentDescriptor, result: SegmentRead,
): DocumentEvidence[] {
  const samples: Array<{field: string; raw: string; col: number | null; index: number}> = [];
  if (result.text !== undefined) {
    for (let i=0;i<result.text.length;i+=R02_LIMITS.evidenceTextChunk)
      samples.push({field:'source_text',raw:result.text.slice(i,i+R02_LIMITS.evidenceTextChunk),col:null,index:i/R02_LIMITS.evidenceTextChunk});
    if (!result.text.length) samples.push({field:'source_text',raw:'',col:null,index:0});
  }
  if (result.cells && result.cells.length === 0) samples.push({field:'empty_row',raw:'',col:null,index:0});
  if (result.cells) for (const c of result.cells) {
    if (c.rawValue.length > R02_LIMITS.maxCellChars) throw new DocumentProcessingError('CELL_TOO_LARGE');
    samples.push({field:'cell_text',raw:c.rawValue,col:c.columnNumber,index:0});
  }
  return samples.map(({field,raw,col,index}):DocumentEvidence => {
    const locator = {
      pageNumber:part.pageNumber,sheetName:part.sheetName,tableId:part.tableId,
      rowId:part.rowNumber === null ? null : part.segmentId,
      columnId:col===null?null:columnRef(col),
      cellReference:col===null||part.rowNumber===null?null:columnRef(col)+part.rowNumber,
      segmentIndex:col===null ? (part.segmentId.startsWith('chunk:')
        ? Number(part.segmentId.slice(6))-1+index : index) : null,
      boundingBox:null,
    };
    const evidence: DocumentEvidence = {
      schemaVersion:1,scope:clone(scope),evidenceId:[run,part.segmentId,col??'text',index].join(':'),
      documentId:source.documentId,fileObjectId:source.documentId,
      sourceSha256:sha,documentRevision:1,extractionRunId:run,locator,
      fieldName:field,rawValue:raw,normalizedValue:null,
      normalizedUnit:null,currency:null,language:null,
      extractionMethod:result.extractionMethod,
      provenanceStatus:result.requiresReview?'uncertain':'uncertain',
      confidence:result.confidence??null,conflictsWithEvidenceIds:[],
      correctionOfEvidenceId:null,createdAt:now,verifiedBy:null,
    };
    assertCoreContract('DocumentEvidence',evidence);
    return evidence;
  });
}
function checkResult(result: SegmentRead): void {
  if (result.text === undefined && result.cells === undefined)
    throw new DocumentProcessingError('EMPTY_SEGMENT_RESULT');
  if (result.text !== undefined && (typeof result.text !== 'string' ||
    result.text.length > R02_LIMITS.maxSegmentChars))
    throw new DocumentProcessingError('SEGMENT_TOO_LARGE');
  if (result.cells && (result.cells.length > 16384 || !result.cells.every(c =>
    Number.isSafeInteger(c.columnNumber) && c.columnNumber > 0 &&
    c.columnNumber <= 16384 && typeof c.rawValue === 'string')))
    throw new DocumentProcessingError('INVALID_CELLS');
  if (result.cells && new Set(result.cells.map(c => c.columnNumber)).size !== result.cells.length)
    throw new DocumentProcessingError('DUPLICATE_CELL_REFERENCE');
}
const segmentIdentity = (s: SegmentDescriptor): string => JSON.stringify(s);
export async function ingestDocument(input: ProcessingInput): Promise<DocumentRun> {
  const {scope,adapter,repository,runId,now,signal} = input;
  const source:SourceFile = {...input.source,bytes:asBytes(input.source.bytes)};
  verifyAttachmentBatch([source]);
  if (!runId || runId.length > 120 || !Number.isFinite(Date.parse(now)) ||
    !now.endsWith('Z') || adapter.format !== source.format)
    throw new DocumentProcessingError('INVALID_PROCESSING_REQUEST');
  const key = sourceScopeKey(scope);
  cancelled(signal);
  // Original bytes are content-addressed and stored unchanged before parsing.
  const sha = await sha256(source.bytes);
  cancelled(signal);
  await repository.store({scopeKey:key,documentId:source.documentId,sha256:sha,
    bytes:source.bytes,format:source.format,fileName:source.fileName});
  const persisted = await repository.read(key,source.documentId);
  if (!persisted || persisted.sha256 !== sha ||
    await sha256(persisted.bytes) !== sha)
    throw new DocumentProcessingError('SOURCE_STORAGE_INTEGRITY_FAILED');
  cancelled(signal);
  const manifest = await adapter.discover(source,signal);
  validateManifest(manifest,source.format);
  if (input.checkpoint) {
    const cp = input.checkpoint;
    if (cp.schemaVersion !== 1 || cp.scopeKey !== key || cp.documentId !== source.documentId ||
      cp.sourceSha256 !== sha || cp.extractionRunId !== runId ||
      JSON.stringify(cp.manifest) !== JSON.stringify(manifest))
      throw new DocumentProcessingError('CHECKPOINT_SCOPE_OR_MANIFEST_MISMATCH');
    if (!Array.isArray(cp.segments) || cp.segments.length !== manifest.parts.length ||
      cp.segments.some((record,i) => segmentIdentity(record.part) !== segmentIdentity(manifest.parts[i]!) ||
        (!record.result && !record.failureCode)))
      throw new DocumentProcessingError('INVALID_CHECKPOINT');
  }
  const records: DocumentCheckpoint['segments'] = [];
  let processed = 0;
  const previous = input.checkpoint?.segments || [];
  for (let i=0;i<manifest.parts.length;i++) {
    const part = manifest.parts[i]!;
    const cached = previous[i];
    if (cached?.result && !cached.failureCode) {
      // Recheck cached payload; never import invalid checkpoint results.
      checkResult(cached.result);
      records.push(clone(cached));processed++;
      continue;
    }
    if (signal?.aborted) {
      records.push({part,result:null,failureCode:'PROCESSING_CANCELLED'});processed++;
      continue;
    }
    try {
      const result = await adapter.read(source,part,signal);
      cancelled(signal);checkResult(result);
      records.push({part,result:clone(result),failureCode:null});
    } catch (error) {
      records.push({part,result:null,failureCode:errorCode(error)});
    }
    processed++;
    input.onObservedProgress?.({documentId:source.documentId,segmentId:part.segmentId,
      processedSegments:processed,totalSegments:manifest.parts.length,
      status:records[i]!.failureCode?'partial':records[i]!.result?.requiresReview?'needs_review':'complete'});
  }
  // An injected parser may not modify the immutable input it was given.
  if (await sha256(source.bytes) !== sha)
    throw new DocumentProcessingError('SOURCE_MUTATED_DURING_EXTRACTION');
  const evidence: DocumentEvidence[] = [];
  for (const record of records) {
    if (record.result) {
      try {evidence.push(...evidenceFor(source,scope,sha,runId,now,record.part,record.result)); }
      catch (error) {
        record.result = null;record.failureCode = errorCode(error);
      }
    }
    if (evidence.length > R02_LIMITS.maxEvidence)
      throw new DocumentProcessingError('EVIDENCE_LIMIT_EXCEEDED');
  }
  const missingParts = records.filter(x => x.failureCode).map(x => x.part.segmentId);
  const reviewed = records.filter(x => x.result?.requiresReview).map(x => x.part.segmentId);
  const all = records.length === manifest.parts.length;
  const missing = missingParts.length > 0;
  const status: CompletenessStatus = !all || missing
    ? (missingParts.length === manifest.parts.length?'blocked':'partial')
    : reviewed.length?'needs_review':'complete';
  const byTable = new Map<string,number>();
  for (const x of records) if (x.result && x.part.tableId) {
    byTable.set(x.part.tableId, (byTable.get(x.part.tableId)||0)+1);
  }
  const coverage: Coverage = {
    schemaVersion:1,scope:clone(scope),coverageId:runId+':coverage',
    documentId:source.documentId,extractionRunId:runId,sourceSha256:sha,
    expectedPageCount:manifest.expectedPageCount,
    observedPageCount:manifest.expectedPageCount===null?null:
      new Set(records.filter(x=>x.result).map(x=>x.part.pageNumber).filter(x=>x!==null)).size,
    expectedSheets:[...manifest.expectedSheets],
    observedSheets:manifest.expectedSheets.filter(sheet=>
      records.some(x=>x.part.sheetName===sheet && x.result)),
    expectedTableRows:clone(manifest.expectedTableRows),
    observedTableRows:manifest.expectedTableRows.map(t=>({tableId:t.tableId,count:byTable.get(t.tableId)||0})),
    perSegment:records.map(x=>({
      segmentId:x.part.segmentId,expected:true,read:!!x.result,parsed:!!x.result,
      validated:!!x.result && !x.result.requiresReview,
      missingLocatorIds:x.failureCode?[x.part.segmentId]:[],
      duplicateLocatorIds:[],
      status:x.failureCode?'blocked':x.result?.requiresReview?'needs_review':'complete',
      failureCode:x.failureCode,
    })),
    status,unprocessedSegments:missingParts,
    unresolvedRows:reviewed.filter(id=>records.find(x=>x.part.segmentId===id)?.part.tableId),
    blockers:missingParts.map(id=>id+':'+records.find(x=>x.part.segmentId===id)?.failureCode),
    methodSummary:'R02 untrusted source extraction; no financial field verification',
    verifiedAt:status==='complete'?now:null,
  };
  assertCoreContract('Coverage',coverage);
  return {
    documentId:source.documentId,sourceSha256:sha,evidence,coverage,
    checkpoint:{
      schemaVersion:1,documentId:source.documentId,scopeKey:key,sourceSha256:sha,
      extractionRunId:runId,manifest:clone(manifest),segments:clone(records),
    },
    financialDraftEligible:false,
  };
}
export async function ingestBatch(input: {
  files: readonly SourceFile[];
  scope: AuthenticatedScope;
  adapterFor: (format: SourceFormat) => DocumentSourceAdapter;
  repository: SourceObjectRepository;
  runId: string; now: string; signal?: AbortSignal;
}): Promise<DocumentRun[]> {
  verifyAttachmentBatch(input.files);
  const result: DocumentRun[] = [];
  for (const file of input.files) {
    result.push(await ingestDocument({
      source:file,scope:input.scope,adapter:input.adapterFor(file.format),
      repository:input.repository,runId:input.runId+':'+file.documentId,
      now:input.now,signal:input.signal,
    }));
  }
  return result;
}
