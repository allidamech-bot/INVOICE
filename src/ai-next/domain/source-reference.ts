/**
 * R01 deterministic source/reference safety preflight. NOT a substitute for
 * future R03 language understanding. All unresolved references fail closed.
 */
export interface NamedSource {
  sourceId: string;
  fileName: string;
  complete: boolean;
  scopeKey: string;
}
export type SourceResolution =
  | {status: 'resolved'; policy: 'uploaded_only' | 'company_only' | 'explicit_combination'; sourceIds: string[]}
  | {status: 'needs_clarification'; reason: 'ambiguous_source' | 'missing_source' |
      'source_incomplete' | 'source_scope_mismatch' | 'ambiguous_source_policy'; candidateIds: string[]};

const companyPhrase = /(?:\b(?:my|our)\s+(?:company|business|saved|stored)\b|\b(?:company|business)\s+(?:products|records)\b|(?:شركت(?:ي|نا)|الشركة|من\s+(?:سجلات|منتجات|أصناف)\s+(?:الشركة|المحفوظة)|المنتجات\s+المحفوظة|الأصناف\s+المحفوظة))/iu;
const filePhrase = /(?:\b(?:this|that|the|uploaded|attached)\s+(?:file|document|attachment)\b|\bfrom\s+(?:the|this|that)\s+(?:file|document|attachment)\b|(?:هذ[اه]\s+(?:الملف|المستند)|الملف\s+(?:المرفق|المرفوع)|الملف|المستند\s+المرفق|المرفقات|من\s+(?:الملف|المرفق)))/iu;
const explicitBoth = /(?:both\s+(?:file|document)\s+and\s+(?:company|saved)|(?:من\s+الملف\s+و(?:من\s+)?(?:سجلات|منتجات)\s+الشركة))/iu;

/**
 * Caller-provided scopeKey must be computed from verified authority and match
 * the sources' persisted scope. Source IDs must already be queried with that scope.
 */
export function resolveSourcePolicy(input: {
  message: string;
  expectedScopeKey: string;
  selectedSourceIds: readonly string[];
  sources: readonly NamedSource[];
}): SourceResolution {
  const message = input.message.normalize('NFKC');
  const wantsFile = filePhrase.test(message);
  const wantsCompany = companyPhrase.test(message);
  if (!wantsFile && !wantsCompany) return {status:'needs_clarification',reason:'ambiguous_source_policy',candidateIds:[]};
  const sources = new Map(input.sources.map(s => [s.sourceId, s]));
  const uniqueSelected = [...new Set(input.selectedSourceIds)];
  if (wantsFile) {
    if (!uniqueSelected.length) return {status:'needs_clarification',reason:'missing_source',candidateIds:[]};
    if (uniqueSelected.length !== 1 && !/\b(?:all|every)\s+(?:uploaded|attached)\s+files\b|كل\s+الملفات/u.test(message))
      return {status:'needs_clarification',reason:'ambiguous_source',candidateIds:uniqueSelected};
    for (const id of uniqueSelected) {
      const source = sources.get(id);
      if (!source) return {status:'needs_clarification',reason:'missing_source',candidateIds:[id]};
      if (source.scopeKey !== input.expectedScopeKey)
        return {status:'needs_clarification',reason:'source_scope_mismatch',candidateIds:[]};
      if (!source.complete)
        return {status:'needs_clarification',reason:'source_incomplete',candidateIds:[id]};
    }
  }
  if (wantsFile && wantsCompany && !explicitBoth.test(message))
    return {status:'needs_clarification',reason:'ambiguous_source_policy',candidateIds:uniqueSelected};
  return {status:'resolved',policy:wantsFile?(wantsCompany?'explicit_combination':'uploaded_only'):'company_only',
    sourceIds:wantsFile?uniqueSelected:[]};
}

export type ItemReference =
  | {status: 'resolved'; lineId: string}
  | {status: 'needs_clarification'; reason: 'missing_item' | 'ambiguous_item' | 'stale_revision'};

export function resolveDraftItemReference(input: {
  expectedRevision: number;
  currentRevision: number;
  lineIds: readonly string[];
  explicitLineId?: string;
  ordinal?: number;
}): ItemReference {
  if (input.currentRevision !== input.expectedRevision)
    return {status:'needs_clarification',reason:'stale_revision'};
  if (new Set(input.lineIds).size !== input.lineIds.length)
    return {status:'needs_clarification',reason:'ambiguous_item'};
  if (input.explicitLineId !== undefined) {
    return input.lineIds.includes(input.explicitLineId)
      ? {status:'resolved',lineId:input.explicitLineId}
      : {status:'needs_clarification',reason:'missing_item'};
  }
  if (Number.isSafeInteger(input.ordinal) && input.ordinal !== undefined && input.ordinal >= 1) {
    const lineId = input.lineIds[input.ordinal - 1];
    return lineId ? {status:'resolved',lineId} : {status:'needs_clarification',reason:'missing_item'};
  }
  return {status:'needs_clarification',reason:'ambiguous_item'};
}
