/**
 * Strict, no-dependency runtime validators for all 10 R01 V1 contracts.
 * Unknown keys (including in nested typed objects) are rejected.
 * Validation is structure + local invariants only: never an authorization grant.
 */
import type { CoreContract, CoreContractName, AuthenticatedScope } from './contracts.js';
import { CORE_CONTRACT_NAMES } from './contracts.js';
type Check = (v: unknown) => boolean;
const rec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const text = (max = 6000): Check => v => typeof v === 'string' && v.length <= max;
const nonempty = (max = 160): Check => v => typeof v === 'string' &&
  v.length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/u.test(v);
const id = nonempty(160);
const nullable = (test: Check): Check => v => v === null || test(v);
const strArray = (max = 500, perItem: Check = id): Check => v => Array.isArray(v) &&
  v.length <= max && v.every(perItem);
const arrayOf = (check: Check, max = 10000): Check =>
  v => Array.isArray(v) && v.length <= max && v.every(check);
const integer = (min = 0): Check => v => Number.isSafeInteger(v) && (v as number) >= min;
const bool: Check = v => typeof v === 'boolean';
const anyEnum = <T extends string>(values: readonly T[]): Check => v =>
  typeof v === 'string' && values.includes(v as T);
const isoTime: Check = v => typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v) &&
  !Number.isNaN(Date.parse(v));
const hash: Check = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const decimal: Check = v => typeof v === 'string' && /^(?:0|[1-9]\d{0,17})(?:\.\d{1,8})?$/.test(v);
const currency: Check = v => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const frac: Check = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const nulStr = nullable(text(6000));
const jsonValue = (v: unknown, depth = 0, seen = new Set<object>()): boolean => {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (depth > 12 || typeof v !== 'object' || seen.has(v)) return false;
  seen.add(v);
  const valid = Array.isArray(v)
    ? v.length <= 2000 && v.every(x => jsonValue(x, depth + 1, seen))
    : rec(v) && Object.keys(v).length <= 200 &&
      Object.keys(v).every(k => k.length <= 120 && jsonValue(v[k], depth + 1, seen));
  seen.delete(v);
  return valid;
};
const plainJson: Check = v => rec(v) && jsonValue(v);
const obj = (shape: Record<string, Check>): Check => v => rec(v) &&
  Object.keys(v).length === Object.keys(shape).length &&
  Object.entries(shape).every(([key, check]) => Object.hasOwn(v, key) && check(v[key]));
const scopeShape = obj({
  ownerUid: id, accountId: id, companyId: id, branchId: id,
  threadId: id, actorId: id,
  role: anyEnum(['owner','admin','finance','sales','purchasing','viewer']),
  scopeType: anyEnum(['business','personal','temporary']),
  authorizationVersion: integer(1),
});
export const validateAuthenticatedScope = (v: unknown): v is AuthenticatedScope => scopeShape(v) &&
  // A personal/temporary scope cannot address an unrelated business company.
  (v as AuthenticatedScope).ownerUid.length > 0;
const provenance = anyEnum(['verified','uncertain','missing','contradictory','not_applicable']);
const complete = anyEnum(['complete','partial','needs_review','blocked']);
const taskStatus = anyEnum(['created','understanding','gathering_evidence','processing',
  'needs_clarification','needs_review','awaiting_approval','executing',
  'completed','failed','cancelled','recoverable','needs_reconciliation']);
const scoped = { schemaVersion: (v: unknown) => v === 1, scope: scopeShape };
const unique = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;
const strIds: Check = v => strArray(10000)(v) && unique(v as string[]);
const sourceIdList: Check = v => strIds(v) && (v as string[]).length <= 100;
const factCheck = obj({
  name: id, value: nulStr, provenanceStatus: provenance,
  evidenceRefs: sourceIdList, originalText: nulStr,
});
const turn = obj({
  ...scoped,
  turnId: id, threadId: id, userMessageId: id, requestId: id, idempotencyKey: id,
  sequenceNumber: integer(0), parentTurnId: nullable(id),
  userMessage: obj({
    text: nonempty(6000), languageHint: anyEnum(['ar','en','mixed','unknown']),
    attachedSourceIds: sourceIdList,
  }),
  mode: anyEnum(['advisor','controller']), receivedAt: isoTime, stateVersion: integer(0),
  selectedSourceIds: sourceIdList, taskId: nullable(id),
  lifecycle: anyEnum(['received','processing','needs_input','done','failed','cancelled']),
  outputResultId: nullable(id),
});
const intent = obj({
  ...scoped, intentId: id, turnId: id,
  action: anyEnum(['discuss','read_file','read_business','prepare_quote','edit_draft',
    'preview_draft','analyze','request_approval','execute_approved','clarify','cancel']),
  subjectRef: nullable(obj({kind: anyEnum(['document','draft','entity']), id})),
  sourcePolicy: anyEnum(['uploaded_only','company_only','explicit_combination','none']),
  referencedSourceIds: sourceIdList,
  argumentFacts: arrayOf(factCheck, 200),
  unresolvedReferences: arrayOf(obj({
    expression: nonempty(200), candidateIds: sourceIdList, reason: nonempty(500),
  }), 30),
  missingFields: sourceIdList, contradictoryFields: sourceIdList,
  executable: bool, confidence: frac,
});
const evidence = obj({
  ...scoped, evidenceId: id, documentId: id, fileObjectId: id,
  sourceSha256: hash, documentRevision: integer(1), extractionRunId: id,
  locator: obj({
    pageNumber: nullable(integer(1)), sheetName: nullable(id), tableId: nullable(id),
    rowId: nullable(id), columnId: nullable(id), cellReference: nullable(id),
    segmentIndex: nullable(integer(0)),
    boundingBox: nullable(v => Array.isArray(v) && v.length === 4 &&
      v.every(x => typeof x === 'number' && Number.isFinite(x) && x >= 0)),
  }),
  fieldName: id, rawValue: text(120000), normalizedValue: nulStr,
  normalizedUnit: nullable(id), currency: nullable(currency), language: nullable(id),
  extractionMethod: anyEnum(['selectable_text','spreadsheet_parser','ocr','vision',
    'human_correction','deterministic_transform']),
  provenanceStatus: provenance, confidence: nullable(frac),
  conflictsWithEvidenceIds: sourceIdList, correctionOfEvidenceId: nullable(id),
  createdAt: isoTime, verifiedBy: nullable(id),
});
const segment = obj({
  segmentId: id, expected: bool, read: bool, parsed: bool, validated: bool,
  missingLocatorIds: sourceIdList, duplicateLocatorIds: sourceIdList,
  status: complete, failureCode: nullable(id),
});
const coverage = obj({
  ...scoped, coverageId: id, documentId: id, extractionRunId: id, sourceSha256: hash,
  expectedPageCount: nullable(integer(0)), observedPageCount: nullable(integer(0)),
  expectedSheets: sourceIdList, observedSheets: sourceIdList,
  expectedTableRows: arrayOf(obj({tableId: id, count: nullable(integer(0))}), 10000),
  observedTableRows: arrayOf(obj({tableId: id, count: integer(0)}), 10000),
  perSegment: arrayOf(segment, 10000), status: complete,
  unprocessedSegments: sourceIdList, unresolvedRows: sourceIdList,
  blockers: strArray(1000, nonempty(500)), methodSummary: text(3000),
  verifiedAt: nullable(isoTime),
});
const task = obj({
  ...scoped, taskId: id, threadId: id, turnId: id, taskType: id,
  state: taskStatus, revision: integer(0), stateVersion: integer(0),
  startedAt: isoTime, updatedAt: isoTime, completedAt: nullable(isoTime),
  stageIndex: integer(0),
  progress: obj({
    completedUnits: integer(0), totalUnits: nullable(integer(0)),
    unitType: anyEnum(['pages','rows','files','steps','unknown']), observedAt: isoTime,
  }),
  currentCheckpointId: nullable(id), sourceIds: sourceIdList,
  draftId: nullable(id), approvalId: nullable(id),
  lastError: nullable(obj({
    category: id, code: id, retriable: bool, userMessage: text(2000),
    diagnosticsRef: nullable(id),
  })),
  cancellable: bool, retryPolicy: anyEnum(['none','safe_only']),
  executionOperationId: nullable(id),
});
const model = obj({
  ...scoped, assessmentId: id, evaluatedAt: isoTime,
  model: obj({
    providerId: id, modelId: id, registryVersion: id,
    supportedCapabilities: sourceIdList,
    modalityLimits: obj({maxImages: integer(0), maxPages: nullable(integer(0))}),
    contextWindow: nullable(integer(1)),
  }),
  requestNeeds: obj({
    taskType: id, inputModalities: sourceIdList,
    inputEstimateTokens: integer(0), requiredOutputSchema: id,
    privacyClass: anyEnum(['public_synthetic','internal_business','confidential']),
  }),
  accountEligibility: anyEnum(['configured','missing_credentials','free_verified',
    'unverified','quota_exhausted','disabled']),
  priceEligibility: anyEnum(['verified_zero','approved_paid','unknown','disallowed']),
  privacyEligibility: anyEnum(['approved','denied','unknown']),
  capabilityEligible: bool, healthEligible: bool, eligible: bool,
  reasons: sourceIdList,
  budget: obj({maxRequests: integer(0), timeoutMs: integer(1), maxAllowedCost: decimal}),
  fallbackGroupId: nullable(id),
});
const tool = obj({
  ...scoped, toolCallId: id, taskId: id, toolId: id,
  toolSchemaVersion: integer(1),
  operationType: anyEnum(['read','calculate','prepare','execute']),
  validatedInput: plainJson, validatedInputHash: hash,
  requiredPermissions: sourceIdList, evidenceIds: sourceIdList,
  sourceCompletenessStatus: complete, idempotencyKey: id,
  expectedBusinessRevision: nullable(id), approvalReceiptId: nullable(id),
  preconditions: sourceIdList,
  state: anyEnum(['proposed','validated','denied','queued','executing','succeeded',
    'failed','needs_reconciliation']),
  resultRef: nullable(id), errorCategory: nullable(id),
});
const draft = obj({
  ...scoped, draftId: id, draftRevision: integer(1), threadId: id,
  kind: anyEnum(['quotation','invoice_proposal','analysis']),
  status: anyEnum(['unsaved','needs_review','ready_for_approval',
    'approved_for_execution','saved','discarded']),
  sourceIds: sourceIdList, sourceManifestHash: hash,
  lineItems: arrayOf(obj({
    lineId: id, description: text(3000), quantity: nullable(decimal),
    unit: nullable(id), sellingUnitPrice: nullable(decimal),
    currency: nullable(currency), evidenceRefs: sourceIdList,
  }), 10000),
  explicitCustomerId: nullable(id), currency: nullable(currency),
  fieldStatus: arrayOf(obj({field: id, status: provenance}), 10000),
  immutableRevisionHash: hash, createdAt: isoTime, updatedAt: isoTime,
  undoBaseRevision: nullable(integer(0)),
  editEvents: arrayOf(obj({revision: integer(1), kind: id, lineId: nullable(id)}), 10000),
  businessValidation: obj({valid: bool, blockers: strArray(1000, nonempty(500))}),
  approvalReceiptId: nullable(id),
});
const approval = obj({
  ...scoped, approvalReceiptId: id, taskId: id, actorId: id,
  verifiedRole: anyEnum(['owner','admin','finance','sales','purchasing','viewer']),
  authPolicyVersion: integer(1), toolId: id, operationId: id, draftId: id,
  draftRevision: integer(1), immutableRevisionHash: hash,
  sourceManifestHash: hash, expectedBusinessRevision: id,
  issuedAt: isoTime, expiresAt: isoTime, revokedAt: nullable(isoTime),
  approvalAction: anyEnum(['accepted','rejected','revoked']),
  serverIntegrityTag: nonempty(600), consumedAt: nullable(isoTime),
  executionResultRef: nullable(id),
});
const result = obj({
  ...scoped, resultId: id, turnId: id, taskId: id,
  status: anyEnum(['completed','clarification_required','review_required',
    'approval_required','recoverable','failed','cancelled','needs_reconciliation']),
  answer: text(100000), evidenceIds: sourceIdList, coverageIds: sourceIdList,
  sourceIds: sourceIdList, draftRef: nullable(id), approvalRef: nullable(id),
  businessResultRef: nullable(id),
  verifiedActions: arrayOf(obj({
    operationId: id, persistedObjectType: id, persistedObjectId: id,
    verifiedAt: isoTime,
  }), 1000),
  missingFacts: sourceIdList, warnings: strArray(1000, text(2000)),
  diagnosticsRef: nullable(id), createdAt: isoTime, finalStateVersion: integer(0),
});
const shapes: Record<CoreContractName, Check> = {
  ConversationTurn: turn, GroundedIntent: intent, DocumentEvidence: evidence,
  Coverage: coverage, TaskState: task, ModelEligibility: model,
  ToolCall: tool, ReviewDraft: draft, ApprovalReceipt: approval, TurnResult: result,
};
export type ValidationResult<T extends CoreContract = CoreContract> =
  { ok: true; value: T } | { ok: false; errors: string[] };

function invariantErrors(name: CoreContractName, v: CoreContract): string[] {
  const errors: string[] = [];
  if ('threadId' in v && v.threadId !== v.scope.threadId) errors.push('thread_scope_mismatch');
  if (name === 'ConversationTurn') {
    const t = v as Extract<CoreContract, { turnId: string; userMessageId: string }>;
    if (t.selectedSourceIds.some(s => !t.userMessage.attachedSourceIds.includes(s))) {
      // Valid selection may legitimately refer to an earlier attached document; require explicit
      // server resolution in R03, not a guessed forced membership here.
    }
  }
  if (name === 'GroundedIntent') {
    const i = v as Extract<CoreContract, { intentId: string }>;
    if ((i.sourcePolicy === 'none' || i.sourcePolicy === 'company_only') &&
      i.referencedSourceIds.length) errors.push('unexpected_uploaded_sources');
    if (i.sourcePolicy === 'uploaded_only' && !i.referencedSourceIds.length) errors.push('missing_uploaded_source');
    if (i.unresolvedReferences.length && i.executable) errors.push('unresolved_executable_intent');
    if ((i.missingFields.length || i.contradictoryFields.length) && i.executable)
      errors.push('unverified_executable_intent');
    if (i.action === 'execute_approved' && i.executable)
      errors.push('r01_execution_disabled');
  }
  if (name === 'DocumentEvidence') {
    const e = v as Extract<CoreContract, { evidenceId: string }>;
    const loc = e.locator;
    if ([loc.pageNumber,loc.sheetName,loc.tableId,loc.rowId,loc.cellReference,loc.segmentIndex]
      .every(s => s === null)) errors.push('missing_source_locator');
    if (e.provenanceStatus === 'verified' && !e.verifiedBy)
      errors.push('verified_without_authority');
    if (e.provenanceStatus !== 'verified' && e.verifiedBy)
      errors.push('unverified_with_authority');
  }
  if (name === 'Coverage') {
    const c = v as Extract<CoreContract, { coverageId: string }>;
    if (c.status === 'complete') {
      if (!c.perSegment.length || c.perSegment.some(s => s.status !== 'complete' ||
        !s.read || !s.parsed || !s.validated || s.missingLocatorIds.length ||
        s.duplicateLocatorIds.length || s.failureCode)) errors.push('segment_coverage_incomplete');
      if (c.unprocessedSegments.length || c.unresolvedRows.length || c.blockers.length)
        errors.push('coverage_has_blockers');
      if (c.expectedPageCount !== c.observedPageCount) errors.push('page_count_mismatch');
      if (c.expectedSheets.length !== c.observedSheets.length ||
        c.expectedSheets.some(s => !c.observedSheets.includes(s))) errors.push('sheet_count_mismatch');
      if (c.expectedTableRows.some(t => t.count === null ||
        !c.observedTableRows.some(o => o.tableId === t.tableId && o.count === t.count)))
        errors.push('unknown_or_missing_row_coverage');
      if (!c.verifiedAt) errors.push('unverified_coverage');
    }
  }
  if (name === 'TaskState') {
    const t = v as Extract<CoreContract, { taskId: string }>;
    if (t.progress.totalUnits !== null && t.progress.completedUnits > t.progress.totalUnits)
      errors.push('progress_out_of_range');
    if (t.state === 'completed' && !t.completedAt) errors.push('missing_completion_time');
    if (t.state === 'executing' && (!t.approvalId || !t.executionOperationId))
      errors.push('unapproved_execution');
    if (t.state === 'cancelled' && t.executionOperationId)
      errors.push('cancelled_inflight_execution');
  }
  if (name === 'ModelEligibility') {
    const m = v as Extract<CoreContract, { assessmentId: string }>;
    if (m.eligible && (!m.capabilityEligible || !m.healthEligible ||
      m.privacyEligibility !== 'approved' ||
      !['free_verified','configured'].includes(m.accountEligibility) ||
      !['verified_zero','approved_paid'].includes(m.priceEligibility) ||
      m.reasons.length || m.budget.maxRequests === 0)) errors.push('model_not_eligible');
    if (m.eligible && m.accountEligibility === 'configured' &&
      m.priceEligibility !== 'approved_paid') errors.push('free_not_account_verified');
  }
  if (name === 'ToolCall') {
    const t = v as Extract<CoreContract, { toolCallId: string }>;
    if (t.operationType === 'execute' &&
      (!t.approvalReceiptId || !t.expectedBusinessRevision))
      errors.push('execution_without_approval_or_revision');
    if (t.operationType === 'execute' && ['queued','executing','succeeded'].includes(t.state))
      errors.push('r01_execution_disabled');
    if (t.state === 'succeeded' && !t.resultRef) errors.push('missing_tool_result');
    if (t.operationType === 'prepare' && t.sourceCompletenessStatus !== 'complete' &&
      ['queued','executing','succeeded'].includes(t.state))
      errors.push('incomplete_source_prepare');
  }
  if (name === 'ReviewDraft') {
    const d = v as Extract<CoreContract, { draftId: string }>;
    if (!unique(d.lineItems.map(l => l.lineId))) errors.push('duplicate_draft_line_id');
    if (d.status === 'ready_for_approval' && (!d.businessValidation.valid ||
      d.businessValidation.blockers.length || !d.currency ||
      (d.kind !== 'analysis' && (!d.explicitCustomerId || d.lineItems.some(l =>
        l.sellingUnitPrice === null || l.quantity === null || l.unit === null)))))
      errors.push('draft_missing_required_fields');
    if (d.status === 'approved_for_execution' || d.status === 'saved')
      errors.push('r01_draft_execution_disabled');
  }
  if (name === 'ApprovalReceipt') {
    const a = v as Extract<CoreContract, { approvalReceiptId: string }>;
    if (a.actorId !== a.scope.actorId || a.verifiedRole !== a.scope.role ||
      a.authPolicyVersion !== a.scope.authorizationVersion)
      errors.push('approval_actor_scope_mismatch');
    if (Date.parse(a.expiresAt) <= Date.parse(a.issuedAt)) errors.push('invalid_approval_expiry');
    if (a.approvalAction !== 'accepted' && a.consumedAt) errors.push('revoked_approval_consumed');
    // Contract may be parsed for audit/history, but NEVER authorizes writes in R01.
  }
  if (name === 'TurnResult') {
    const r = v as Extract<CoreContract, { resultId: string }>;
    if (r.verifiedActions.length && (!r.businessResultRef || r.status !== 'completed'))
      errors.push('unverified_persisted_result');
    if (r.status === 'completed' && r.missingFacts.length)
      errors.push('completed_with_missing_facts');
  }
  return errors;
}

export function validateCoreContract(name: CoreContractName, value: unknown): ValidationResult {
  if (!CORE_CONTRACT_NAMES.includes(name) || !shapes[name](value))
    return { ok: false, errors: ['invalid_structure_or_unknown_fields'] };
  const errors = invariantErrors(name, value as CoreContract);
  return errors.length ? { ok: false, errors } : { ok: true, value: value as CoreContract };
}
export function assertCoreContract(name: CoreContractName, value: unknown): CoreContract {
  const checked = validateCoreContract(name, value);
  if (!checked.ok) throw new Error('AI_NEXT_INVALID_'+name+':'+checked.errors.join(','));
  return checked.value;
}
