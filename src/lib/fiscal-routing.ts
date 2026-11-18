/**
 * Fiscal routing foundation. A route is NOT permission to issue, nor proof of
 * compliance. The eventual trusted server must load the issuer profile itself;
 * never accept a browser-selected regime or use the buyer country as a proxy.
 * Not wired to existing document issuance until fiscal gates are implemented.
 */
export type SaudiRegime = 'unresolved' | 'out-of-scope' | 'phase-1' | 'phase-2';
export type FiscalDocumentKind = 'invoice' | 'credit-note' | 'debit-note'
  | 'quote' | 'proforma' | 'proforma-invoice' | 'rfq' | 'purchase-order' | 'delivery-note'
  | 'payment-receipt' | 'draft';
export type SaudiInvoiceType = 'standard' | 'simplified';
export interface VerifiedFiscalProfile {
  issuerCountry: string;
  saRegime: SaudiRegime;
}
export type FiscalRoute =
  | { route: 'non-fiscal' | 'commercial' }
  | { route: 'sa-generation' | 'sa-clearance' | 'sa-reporting'; invoiceType: SaudiInvoiceType }
  | { route: 'blocked'; reason: 'unknown-document' | 'unresolved-issuer' | 'unresolved-invoice-type' };

const NON_FISCAL = new Set<FiscalDocumentKind>([
  'quote', 'proforma', 'proforma-invoice', 'rfq', 'purchase-order', 'delivery-note', 'payment-receipt', 'draft'
]);
const FISCAL = new Set<FiscalDocumentKind>(['invoice', 'credit-note', 'debit-note']);

export function resolveFiscalRoute(
  kind: FiscalDocumentKind,
  profile: VerifiedFiscalProfile | null,
  invoiceType?: SaudiInvoiceType
): FiscalRoute {
  if (NON_FISCAL.has(kind)) return { route: 'non-fiscal' };
  if (!FISCAL.has(kind)) return { route: 'blocked', reason: 'unknown-document' };
  if (!profile || !/^[A-Z]{2}$/.test(profile.issuerCountry)) {
    return { route: 'blocked', reason: 'unresolved-issuer' };
  }
  if (profile.saRegime === 'out-of-scope') return { route: 'commercial' };
  if (profile.saRegime !== 'phase-1' && profile.saRegime !== 'phase-2') {
    return { route: 'blocked', reason: 'unresolved-issuer' };
  }
  if (invoiceType !== 'standard' && invoiceType !== 'simplified') {
    return { route: 'blocked', reason: 'unresolved-invoice-type' };
  }
  if (profile.saRegime === 'phase-1') return { route: 'sa-generation', invoiceType };
  return { route: invoiceType === 'standard' ? 'sa-clearance' : 'sa-reporting', invoiceType };
}
