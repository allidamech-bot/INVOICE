import type { LourexDocument } from '../types.js';
import { validateDocument } from './documents.js';
import { decimalToScaled, isDecimalInput } from './money.js';

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

const fixedPositive = (value: string) => isDecimalInput(value) && decimalToScaled(value) > 0n;
const fixedNonNegative = (value: string) => isDecimalInput(value) && decimalToScaled(value) >= 0n;

export function getDocumentReadiness(doc: LourexDocument): DocumentReadiness {
  const errors=validateDocument(doc);
  const requirements: boolean[] = [];
  const documentChecks = [
    !errors.number,
    !errors.issueDate,
    Boolean(doc.currency.trim()),
    !errors.dueDate
  ];
  requirements.push(...documentChecks);

  const customerComplete = !errors.customer;
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
    itemDetailChecks.push(descriptionComplete, Boolean(item.unit.trim()), fixedPositive(item.quantity));
    pricingChecks.push(fixedNonNegative(item.unitPrice));
    requirements.push(descriptionComplete, Boolean(item.unit.trim()), fixedPositive(item.quantity), fixedNonNegative(item.unitPrice));
  }

  if (doc.adjustments.discountEnabled) requirements.push(!errors.discount);
  if (doc.adjustments.shippingEnabled) requirements.push(!errors.shipping);
  if (doc.adjustments.otherChargesEnabled) requirements.push(!errors.otherCharges);
  if (doc.adjustments.taxEnabled) requirements.push(!errors.tax);

  const total = Math.max(1, requirements.length);
  const complete = requirements.filter(Boolean).length;
  const percent = Math.max(0, Math.min(100, Math.round((complete / total) * 100)));
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
      { key: 'pricing', complete: doc.items.length > 0 && pricingChecks.every(Boolean) && !errors.discount && !errors.shipping && !errors.otherCharges && !errors.tax }
    ]
  };
}
