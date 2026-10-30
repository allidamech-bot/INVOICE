/**
 * R02 correction reconciliation: explicit locator linking, NEVER fuzzy row-name
 * updates or financial price conversion. Produces review proposals only.
 */
import type { DocumentEvidence } from '../domain/contracts.js';
import { assertCoreContract } from '../domain/validation.js';
import { sourceScopeKey, DocumentProcessingError } from './engine.js';
import { normalizeArabicPersianNumerals } from './adapters.js';

export interface CorrectedValueReview {
  originalEvidenceId: string;
  correctionEvidenceId: string;
  originalRawValue: string;
  proposedRawValue: string;
  fieldName: string;
  originalSourceSha256: string;
  correctionSourceSha256: string;
  status: 'needs_review';
  financialWriteAuthorized: false;
}
export function proposeEvidenceCorrection(
  original: DocumentEvidence,
  correction: DocumentEvidence,
  explicit: {originalEvidenceId: string; correctionEvidenceId: string; fieldName: string},
): CorrectedValueReview {
  assertCoreContract('DocumentEvidence',original);
  assertCoreContract('DocumentEvidence',correction);
  if(sourceScopeKey(original.scope)!==sourceScopeKey(correction.scope))
    throw new DocumentProcessingError('CROSS_ACCOUNT_CORRECTION_DENIED');
  if(original.evidenceId!==explicit.originalEvidenceId ||
    correction.evidenceId!==explicit.correctionEvidenceId ||
    original.fieldName!==explicit.fieldName ||
    correction.fieldName!==explicit.fieldName)
    throw new DocumentProcessingError('CORRECTION_REFERENCE_MISMATCH');
  if(original.sourceSha256===correction.sourceSha256 &&
    original.documentRevision===correction.documentRevision)
    throw new DocumentProcessingError('CORRECTION_SOURCE_NOT_NEW');
  if(!original.locator.rowId || !correction.locator.rowId)
    throw new DocumentProcessingError('CORRECTION_ROW_UNRESOLVED');
  return {
    originalEvidenceId:original.evidenceId,
    correctionEvidenceId:correction.evidenceId,
    originalRawValue:original.rawValue,
    proposedRawValue:correction.rawValue,
    fieldName:original.fieldName,
    originalSourceSha256:original.sourceSha256,
    correctionSourceSha256:correction.sourceSha256,
    status:'needs_review',financialWriteAuthorized:false,
  };
}
export interface TypedPriceValue {
  raw: string;
  normalizedNumerals: string;
  valid: boolean;
  unit: string | null;
  currency: string | null;
  status: 'unverified_source_value';
}
/**
 * Read-only labeler: unit and currency are accepted only from explicitly
 * supplied fields, and this function does not infer selling prices from costs.
 */
export function classifyPriceToken(
  raw: string, unit: string | null, currency: string | null,
): TypedPriceValue {
  const normalizedNumerals=normalizeArabicPersianNumerals(raw).trim();
  const valid=/^(?:0|[1-9]\d{0,17})(?:\.\d{1,8})?$/.test(normalizedNumerals);
  if(currency!==null&&!/^[A-Z]{3}$/.test(currency))
    throw new DocumentProcessingError('INVALID_SOURCE_CURRENCY');
  if(unit!==null&&!/^[\p{L}\p{N} _/-]{1,40}$/u.test(unit))
    throw new DocumentProcessingError('INVALID_SOURCE_UNIT');
  return {raw,normalizedNumerals,valid,unit,currency,status:'unverified_source_value'};
}
export function mayPromoteQuotePrice(input: {
  sourceField: 'supplier_cost' | 'purchase_price' | 'selling_price' | 'unknown';
  value: TypedPriceValue;
  exactSellingUnit: string | null;
  exactCurrency: string | null;
  explicitlyReviewed: boolean;
}): boolean {
  return input.sourceField==='selling_price' && input.explicitlyReviewed &&
    input.value.valid && input.value.currency!==null &&
    input.value.unit!==null && input.exactSellingUnit===input.value.unit &&
    input.exactCurrency===input.value.currency;
}
