/** Pure Phase-2 issuance state machine. Server-side trusted inputs only.
 * Persistence, authenticated commands, artifact verification and atomic outbox
 * are mandatory before use; this module performs no I/O and grants no authority.
 */
export type FiscalMode = 'clearance' | 'reporting';
export type FiscalStatus = 'queued' | 'submitting' | 'uncertain' | 'retryable' | 'rejected' | 'cleared' | 'reported';
export interface FiscalIssueIdentity {
  accountUid: string; workspaceId: string; egsId: string; documentId: string;
  uuid: string; icv: string; previousInvoiceHash: string; invoiceHash: string;
}
export interface PreparedFiscalIssue extends FiscalIssueIdentity {
  mode: FiscalMode; artifactDigest: string; snapshotDigest: string;
  generatedAt: string;
}
export interface FiscalIssueRecord extends PreparedFiscalIssue {
  status: FiscalStatus;
  version: number;
  updatedAt: string;
  reportingDeadline: string | null;
  attemptId: string | null;
  attemptCount: number;
  usedAttemptIds: readonly string[];
  resultDigest: string | null;
  clearedArtifactDigest: string | null;
  warnings: boolean;
}
export type FiscalIssueEvent =
  | { kind: 'start'; attemptId: string; at: string }
  | { kind: 'uncertain'; attemptId: string; at: string; unverifiedEvidenceDigest?: string }
  | { kind: 'confirmed-not-accepted'; attemptId: string; at: string; evidenceDigest: string }
  | { kind: 'rejected'; attemptId: string; at: string; resultDigest: string }
  | { kind: 'cleared'; attemptId: string; at: string; resultDigest: string; clearedArtifactDigest: string; warnings: boolean }
  | { kind: 'reported'; attemptId: string; at: string; resultDigest: string; warnings: boolean };
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
// Invoice hashes are SHA-256 bytes encoded as canonical base64, not artifact digests.
export const FIRST_PREVIOUS_INVOICE_HASH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";
const HASH = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
function timestamp(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new Error('Invalid UTC timestamp.');
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw new Error('Invalid UTC timestamp.');
  return ms;
}
function digest(value: string): void {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error('Invalid evidence digest.');
}
function id(value: string): void {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('Invalid identifier.');
}
/** Only call after verifying and durably storing the prepared artifact, and in
 * the same transaction as the unique document binding, EGS chain and outbox.
 * For reporting, generatedAt is issuance time, not time of queue processing.
 */
export function prepareFiscalIssue(input: PreparedFiscalIssue): FiscalIssueRecord {
  for (const value of [input.accountUid,input.workspaceId,input.egsId,input.documentId]) id(value);
  if (typeof input.uuid !== 'string' || !UUID.test(input.uuid) || typeof input.icv !== 'string' || !/^[1-9][0-9]{0,17}$/.test(input.icv)
    || typeof input.previousInvoiceHash !== 'string' || (input.icv === '1' ? input.previousInvoiceHash !== FIRST_PREVIOUS_INVOICE_HASH : !HASH.test(input.previousInvoiceHash))
    || typeof input.invoiceHash !== 'string' || !HASH.test(input.invoiceHash)
    || (input.mode !== 'clearance' && input.mode !== 'reporting')) throw new Error('Invalid fiscal identity.');
  digest(input.artifactDigest); digest(input.snapshotDigest);
  const ms = timestamp(input.generatedAt);
  // Copy allowlisted fields: caller-added state or flags must never survive.
  return {accountUid:input.accountUid,workspaceId:input.workspaceId,egsId:input.egsId,documentId:input.documentId,
    uuid:input.uuid,icv:input.icv,previousInvoiceHash:input.previousInvoiceHash,invoiceHash:input.invoiceHash,
    mode:input.mode,artifactDigest:input.artifactDigest,snapshotDigest:input.snapshotDigest,generatedAt:input.generatedAt,
    status:'queued',version:1,updatedAt:input.generatedAt,reportingDeadline:input.mode==='reporting'?new Date(ms+86_400_000).toISOString():null,
    attemptId:null,attemptCount:0,usedAttemptIds:[],resultDigest:null,clearedArtifactDigest:null,warnings:false};
}
/** Persist with compare-and-swap against expectedVersion. Transport ambiguity
 * never permits automatic replay. Confirmed non-acceptance requires independently
 * verified evidence; a timeout or generic HTTP error is NOT such evidence.
 */
export function transitionFiscalIssue(record: FiscalIssueRecord, expectedVersion: number, event: FiscalIssueEvent): FiscalIssueRecord {
  if (record.version !== expectedVersion || !Number.isSafeInteger(record.version) || record.version < 1 || record.version >= Number.MAX_SAFE_INTEGER) throw new Error('Stale fiscal version.');
  if (timestamp(event.at) < timestamp(record.updatedAt)) throw new Error('Stale fiscal timestamp.');
  id(event.attemptId);
  const next = {...record, version:record.version+1,updatedAt:event.at};
  if (event.kind === 'start') {
    if ((record.status !== 'queued' && record.status !== 'retryable') || record.usedAttemptIds.includes(event.attemptId)) throw new Error('Submission not eligible.');
    return {...next,status:'submitting',attemptId:event.attemptId,attemptCount:record.attemptCount+1,usedAttemptIds:[...record.usedAttemptIds,event.attemptId],resultDigest:null};
  }
  if ((record.status !== 'submitting' && record.status !== 'uncertain') || record.attemptId !== event.attemptId) throw new Error('Uncorrelated or terminal fiscal result.');
  switch(event.kind) {
    case 'uncertain':
      if (event.unverifiedEvidenceDigest !== undefined) digest(event.unverifiedEvidenceDigest);
      if (record.status !== 'submitting') throw new Error('Already uncertain.');
      return {...next,status:'uncertain'};
    case 'confirmed-not-accepted':
      digest(event.evidenceDigest);
      return {...next,status:'retryable',resultDigest:event.evidenceDigest};
    case 'rejected':
      digest(event.resultDigest);
      return {...next,status:'rejected',resultDigest:event.resultDigest};
    case 'cleared':
      if (record.mode !== 'clearance' || typeof event.warnings !== 'boolean') throw new Error('Wrong result mode.');
      digest(event.resultDigest); digest(event.clearedArtifactDigest);
      return {...next,status:'cleared',resultDigest:event.resultDigest,clearedArtifactDigest:event.clearedArtifactDigest,warnings:event.warnings};
    case 'reported':
      if (record.mode !== 'reporting' || typeof event.warnings !== 'boolean') throw new Error('Wrong result mode.');
      digest(event.resultDigest);
      return {...next,status:'reported',resultDigest:event.resultDigest,warnings:event.warnings};
    default: throw new Error('Unknown fiscal event.');
  }
}
/** Artifact selection only, never permission to output. The caller must verify
 * scope/authorization, stored bytes and durable issuance independently.
 * Simplified rejection blocks further delivery pending controlled remediation;
 * it never erases or changes the original already-issued record.
 */
export function fiscalDeliveryArtifact(record: FiscalIssueRecord): string | null {
  if (record.mode === 'clearance') return record.status === 'cleared' ? record.clearedArtifactDigest : null;
  if (record.mode === 'reporting' && ['queued','submitting','uncertain','retryable','reported'].includes(record.status)) return record.artifactDigest;
  return null;
}
export function fiscalReportingOverdue(record: FiscalIssueRecord, now: string): boolean {
  const ms = timestamp(now);
  return record.mode === 'reporting' && record.status !== 'reported' && record.reportingDeadline !== null && ms >= timestamp(record.reportingDeadline);
}
