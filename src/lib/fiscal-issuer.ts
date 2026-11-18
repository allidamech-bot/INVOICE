import type { VerifiedFiscalProfile, SaudiRegime } from './fiscal-routing.js';

/** Server-owned identity contract. Validation is structural, not ZATCA approval.
 * Never hydrate this record from untrusted workspace settings or a client request.
 */
export interface FiscalIssuerIdentity extends VerifiedFiscalProfile {
  accountUid: string;
  workspaceId: string;
  legalName: string;
  vatNumber?: string;
  effectiveFrom: string;
  profileVersion: number;
}
export interface FiscalIssuerScope {
  accountUid: string;
  workspaceId: string;
}
const REGIMES: readonly SaudiRegime[] = ['unresolved','out-of-scope','phase-1','phase-2'];

export function isSaudiVatNumber(value: unknown): value is string {
  return typeof value === 'string' && /^3[0-9]{13}3$/.test(value);
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
/** A future trusted server must authenticate the actor and authorize the scope
 * before retrieving the record. An effective date is not proof of eligibility.
 */
export function assertFiscalIssuerIdentity(
  record: FiscalIssuerIdentity, expected: FiscalIssuerScope, issueDate: string
): void {
  if (!record || !expected || !identifier(expected.accountUid) || !identifier(expected.workspaceId)
    || record.accountUid !== expected.accountUid || record.workspaceId !== expected.workspaceId) {
    throw new Error('Fiscal issuer scope mismatch.');
  }
  if (typeof record.issuerCountry !== 'string' || !/^[A-Z]{2}$/.test(record.issuerCountry)
    || !REGIMES.includes(record.saRegime)
    || typeof record.legalName !== 'string' || !record.legalName.trim() || record.legalName.length > 500
    || !Number.isSafeInteger(record.profileVersion) || record.profileVersion < 1
    || !validDate(record.effectiveFrom) || !validDate(issueDate) || issueDate < record.effectiveFrom) {
    throw new Error('Invalid or inactive fiscal issuer identity.');
  }
  if ((record.saRegime === 'phase-1' || record.saRegime === 'phase-2') && !isSaudiVatNumber(record.vatNumber)) {
    throw new Error('Invalid Saudi VAT registration number format.');
  }
}
