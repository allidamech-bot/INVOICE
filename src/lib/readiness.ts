import type { LourexDocument } from '../types.js';
import { validateDocument } from './documents.js';

export interface ReadinessGroup {
  key: 'document'|'customer'|'items'|'pricing';
  complete: boolean;
}

export interface DocumentReadiness {
  percent: number;
  complete: number;
  total: number;
  remaining: number;
  ready: boolean;
  groups: ReadinessGroup[];
}

const finitePositive = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
const finiteNonNegative = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;

export function getDocumentReadiness(doc: LourexDocument): DocumentReadiness {
  const requirements: boolean[] = [];
  const documentChecks = [
    Boolean(doc.number.trim()),
    Boolean(doc.issueDate),
    Boolean(doc.currency.trim()),
    doc.kind !== 'proforma' || Boolean(doc.dueDate)
  ];
  requirements.push(...documentChecks);

  const customerComplete = Boolean(doc.customerSnapshot?.companyNameEn.trim() || doc.customerSnapshot?.companyNameAr.trim());
  requirements.push(customerComplete);

  const itemDetailChecks: boolean[] = [];
  const pricingChecks: boolean[] = [];
  if (!doc.items.length) requirements.push(false);
  for (const item of doc.items) {
    const descriptionComplete = doc.language === 'ar'
      ? Boolean(item.descriptionAr.trim())
      : doc.language === 'bilingual'
        ? Boolean(item.descriptionEn.trim() && item.descriptionAr.trim())
        : Boolean(item.descriptionEn.trim());
    itemDetailChecks.push(descriptionComplete, Boolean(item.unit.trim()), finitePositive(item.quantity));
    pricingChecks.push(finiteNonNegative(item.unitPrice));
    requirements.push(descriptionComplete, Boolean(item.unit.trim()), finitePositive(item.quantity), finiteNonNegative(item.unitPrice));
  }

  if (doc.adjustments.discountEnabled) requirements.push(finiteNonNegative(doc.adjustments.discountValue));
  if (doc.adjustments.shippingEnabled) requirements.push(finiteNonNegative(doc.adjustments.shipping));
  if (doc.adjustments.otherChargesEnabled) requirements.push(finiteNonNegative(doc.adjustments.otherCharges));
  if (doc.adjustments.taxEnabled) requirements.push(finiteNonNegative(doc.adjustments.taxPercent));

  const total = Math.max(1, requirements.length);
  const complete = requirements.filter(Boolean).length;
  const percent = Math.max(0, Math.min(100, Math.round((complete / total) * 100)));
  const errors = validateDocument(doc);
  return {
    percent,
    complete,
    total,
    remaining: Math.max(0, total - complete),
    ready: Object.keys(errors).length === 0,
    groups: [
      { key: 'document', complete: documentChecks.every(Boolean) },
      { key: 'customer', complete: customerComplete },
      { key: 'items', complete: doc.items.length > 0 && itemDetailChecks.every(Boolean) },
      { key: 'pricing', complete: doc.items.length > 0 && pricingChecks.every(Boolean) }
    ]
  };
}
