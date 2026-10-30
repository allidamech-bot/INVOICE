/**
 * LOUREX AI Next Generation R01 — pure, isolated contract definitions.
 * No imports from financial modules, Firebase, providers or legacy chat.
 * Design gate: docs/ai-next/R00_CONTRACTS_V1_20261030.md (Draft PR #1189).
 */
export const AI_NEXT_SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof AI_NEXT_SCHEMA_VERSION;
export type ScopeType = 'business' | 'personal' | 'temporary';
export type ConversationMode = 'advisor' | 'controller';
export type ProvenanceStatus = 'verified' | 'uncertain' | 'missing' | 'contradictory' | 'not_applicable';
export type CompletenessStatus = 'complete' | 'partial' | 'needs_review' | 'blocked';
export type TaskPhase =
  | 'created' | 'understanding' | 'gathering_evidence' | 'processing'
  | 'needs_clarification' | 'needs_review' | 'awaiting_approval'
  | 'executing' | 'completed' | 'failed' | 'cancelled'
  | 'recoverable' | 'needs_reconciliation';
export type TerminalPhase = 'completed' | 'failed' | 'cancelled';

export interface AuthenticatedScope {
  ownerUid: string;
  accountId: string;
  companyId: string;
  branchId: string;
  threadId: string;
  actorId: string;
  role: 'owner' | 'admin' | 'finance' | 'sales' | 'purchasing' | 'viewer';
  scopeType: ScopeType;
  authorizationVersion: number;
}
export interface ScopedContract {
  schemaVersion: SchemaVersion;
  scope: AuthenticatedScope;
}

export interface ConversationTurn extends ScopedContract {
  turnId: string;
  threadId: string;
  userMessageId: string;
  requestId: string;
  idempotencyKey: string;
  sequenceNumber: number;
  parentTurnId: string | null;
  userMessage: {
    text: string;
    languageHint: 'ar' | 'en' | 'mixed' | 'unknown';
    attachedSourceIds: string[];
  };
  mode: ConversationMode;
  receivedAt: string;
  stateVersion: number;
  selectedSourceIds: string[];
  taskId: string | null;
  lifecycle: 'received' | 'processing' | 'needs_input' | 'done' | 'failed' | 'cancelled';
  outputResultId: string | null;
}

export interface EvidenceFact {
  name: string;
  value: string | null;
  provenanceStatus: ProvenanceStatus;
  evidenceRefs: string[];
  originalText: string | null;
}
export interface GroundedIntent extends ScopedContract {
  intentId: string;
  turnId: string;
  action: 'discuss' | 'read_file' | 'read_business' | 'prepare_quote'
    | 'edit_draft' | 'preview_draft' | 'analyze' | 'request_approval'
    | 'execute_approved' | 'clarify' | 'cancel';
  subjectRef: { kind: 'document' | 'draft' | 'entity'; id: string } | null;
  sourcePolicy: 'uploaded_only' | 'company_only' | 'explicit_combination' | 'none';
  referencedSourceIds: string[];
  argumentFacts: EvidenceFact[];
  unresolvedReferences: { expression: string; candidateIds: string[]; reason: string }[];
  missingFields: string[];
  contradictoryFields: string[];
  executable: boolean;
  confidence: number;
}

export interface DocumentEvidence extends ScopedContract {
  evidenceId: string;
  documentId: string;
  fileObjectId: string;
  sourceSha256: string;
  documentRevision: number;
  extractionRunId: string;
  locator: {
    pageNumber: number | null;
    sheetName: string | null;
    tableId: string | null;
    rowId: string | null;
    columnId: string | null;
    cellReference: string | null;
    segmentIndex: number | null;
    boundingBox: [number, number, number, number] | null;
  };
  fieldName: string;
  rawValue: string;
  normalizedValue: string | null;
  normalizedUnit: string | null;
  currency: string | null;
  language: string | null;
  extractionMethod: 'selectable_text' | 'spreadsheet_parser' | 'ocr' | 'vision'
    | 'human_correction' | 'deterministic_transform';
  provenanceStatus: ProvenanceStatus;
  confidence: number | null;
  conflictsWithEvidenceIds: string[];
  correctionOfEvidenceId: string | null;
  createdAt: string;
  verifiedBy: string | null;
}

export interface Coverage extends ScopedContract {
  coverageId: string;
  documentId: string;
  extractionRunId: string;
  sourceSha256: string;
  expectedPageCount: number | null;
  observedPageCount: number | null;
  expectedSheets: string[];
  observedSheets: string[];
  expectedTableRows: { tableId: string; count: number | null }[];
  observedTableRows: { tableId: string; count: number }[];
  perSegment: {
    segmentId: string;
    expected: boolean;
    read: boolean;
    parsed: boolean;
    validated: boolean;
    missingLocatorIds: string[];
    duplicateLocatorIds: string[];
    status: CompletenessStatus;
    failureCode: string | null;
  }[];
  status: CompletenessStatus;
  unprocessedSegments: string[];
  unresolvedRows: string[];
  blockers: string[];
  methodSummary: string;
  verifiedAt: string | null;
}
export interface TaskState extends ScopedContract {
  taskId: string;
  threadId: string;
  turnId: string;
  taskType: string;
  state: TaskPhase;
  revision: number;
  stateVersion: number;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  stageIndex: number;
  progress: {
    completedUnits: number;
    totalUnits: number | null;
    unitType: 'pages' | 'rows' | 'files' | 'steps' | 'unknown';
    observedAt: string;
  };
  currentCheckpointId: string | null;
  sourceIds: string[];
  draftId: string | null;
  approvalId: string | null;
  lastError: {
    category: string;
    code: string;
    retriable: boolean;
    userMessage: string;
    diagnosticsRef: string | null;
  } | null;
  cancellable: boolean;
  retryPolicy: 'none' | 'safe_only';
  executionOperationId: string | null;
}

export interface ModelEligibility extends ScopedContract {
  assessmentId: string;
  evaluatedAt: string;
  model: {
    providerId: string; modelId: string; registryVersion: string;
    supportedCapabilities: string[];
    modalityLimits: { maxImages: number; maxPages: number | null };
    contextWindow: number | null;
  };
  requestNeeds: {
    taskType: string;
    inputModalities: string[];
    inputEstimateTokens: number;
    requiredOutputSchema: string;
    privacyClass: 'public_synthetic' | 'internal_business' | 'confidential';
  };
  accountEligibility: 'configured' | 'missing_credentials' | 'free_verified'
    | 'unverified' | 'quota_exhausted' | 'disabled';
  priceEligibility: 'verified_zero' | 'approved_paid' | 'unknown' | 'disallowed';
  privacyEligibility: 'approved' | 'denied' | 'unknown';
  capabilityEligible: boolean;
  healthEligible: boolean;
  eligible: boolean;
  reasons: string[];
  budget: { maxRequests: number; timeoutMs: number; maxAllowedCost: string };
  fallbackGroupId: string | null;
}

export interface ToolCall extends ScopedContract {
  toolCallId: string;
  taskId: string;
  toolId: string;
  toolSchemaVersion: number;
  operationType: 'read' | 'calculate' | 'prepare' | 'execute';
  validatedInput: Record<string, unknown>;
  validatedInputHash: string;
  requiredPermissions: string[];
  evidenceIds: string[];
  sourceCompletenessStatus: CompletenessStatus;
  idempotencyKey: string;
  expectedBusinessRevision: string | null;
  approvalReceiptId: string | null;
  preconditions: string[];
  state: 'proposed' | 'validated' | 'denied' | 'queued'
    | 'executing' | 'succeeded' | 'failed' | 'needs_reconciliation';
  resultRef: string | null;
  errorCategory: string | null;
}
export interface ReviewDraft extends ScopedContract {
  draftId: string;
  draftRevision: number;
  threadId: string;
  kind: 'quotation' | 'invoice_proposal' | 'analysis';
  status: 'unsaved' | 'needs_review' | 'ready_for_approval'
    | 'approved_for_execution' | 'saved' | 'discarded';
  sourceIds: string[];
  sourceManifestHash: string;
  lineItems: {
    lineId: string;
    description: string;
    quantity: string | null;
    unit: string | null;
    sellingUnitPrice: string | null;
    currency: string | null;
    evidenceRefs: string[];
  }[];
  explicitCustomerId: string | null;
  currency: string | null;
  fieldStatus: { field: string; status: ProvenanceStatus }[];
  immutableRevisionHash: string;
  createdAt: string;
  updatedAt: string;
  undoBaseRevision: number | null;
  editEvents: { revision: number; kind: string; lineId: string | null }[];
  businessValidation: { valid: boolean; blockers: string[] };
  approvalReceiptId: string | null;
}
export interface ApprovalReceipt extends ScopedContract {
  approvalReceiptId: string;
  taskId: string;
  actorId: string;
  verifiedRole: AuthenticatedScope['role'];
  authPolicyVersion: number;
  toolId: string;
  operationId: string;
  draftId: string;
  draftRevision: number;
  immutableRevisionHash: string;
  sourceManifestHash: string;
  expectedBusinessRevision: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  approvalAction: 'accepted' | 'rejected' | 'revoked';
  serverIntegrityTag: string;
  consumedAt: string | null;
  executionResultRef: string | null;
}
export interface TurnResult extends ScopedContract {
  resultId: string;
  turnId: string;
  taskId: string;
  status: 'completed' | 'clarification_required' | 'review_required'
    | 'approval_required' | 'recoverable' | 'failed' | 'cancelled'
    | 'needs_reconciliation';
  answer: string;
  evidenceIds: string[];
  coverageIds: string[];
  sourceIds: string[];
  draftRef: string | null;
  approvalRef: string | null;
  businessResultRef: string | null;
  verifiedActions: {
    operationId: string;
    persistedObjectType: string;
    persistedObjectId: string;
    verifiedAt: string;
  }[];
  missingFacts: string[];
  warnings: string[];
  diagnosticsRef: string | null;
  createdAt: string;
  finalStateVersion: number;
}

export type CoreContract = ConversationTurn | GroundedIntent | DocumentEvidence | Coverage
  | TaskState | ModelEligibility | ToolCall | ReviewDraft | ApprovalReceipt | TurnResult;
export const CORE_CONTRACT_NAMES = Object.freeze([
  'ConversationTurn', 'GroundedIntent', 'DocumentEvidence', 'Coverage', 'TaskState',
  'ModelEligibility', 'ToolCall', 'ReviewDraft', 'ApprovalReceipt', 'TurnResult',
] as const);
export type CoreContractName = (typeof CORE_CONTRACT_NAMES)[number];
