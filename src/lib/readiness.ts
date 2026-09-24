import type { LourexDocument } from '../types.js';
import { validateDocument } from './documents.js';
import { decimalToScaled, isDecimalInput } from './money.js';
import { documentPriceOptional, isSupplierDocumentKind } from './document-kinds.js';

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

  // Draft Studio is a free-form company document. Its only shared readiness
  // requirements are identity/date; customer, line-item and pricing requirements
  // belong to transactional documents and must not make a valid Draft display as
  // partially complete while validateDocument() already considers it ready.
  if(doc.kind==='draft'){
    const documentChecks=[!errors.number,!errors.issueDate];
    const total=documentChecks.length;
    const complete=documentChecks.filter(Boolean).length;
    return {
      percent:Math.round((complete/total)*100),
      complete,
      total,
      remaining:total-complete,
      ready:Object.keys(errors).length===0,
      groups:[
        {key:'document',complete:documentChecks.every(Boolean)},
        {key:'customer',complete:true},
        {key:'items',complete:true},
        {key:'pricing',complete:true}
      ]
    };
  }

  const priceOptional=documentPriceOptional(doc.kind);
  const requirements: boolean[] = [];
  const documentChecks = [
    !errors.number,
    !errors.issueDate,
    Boolean(doc.currency.trim()),
    !errors.dueDate
  ];
  requirements.push(...documentChecks);

  const customerComplete = isSupplierDocumentKind(doc.kind) ? !errors.supplier : !errors.customer;
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
    const details=[descriptionComplete,Boolean(item.unit.trim()),fixedPositive(item.quantity)];
    itemDetailChecks.push(...details);
    requirements.push(...details);
    if(!priceOptional){
      const priceComplete=fixedNonNegative(item.unitPrice);
      pricingChecks.push(priceComplete);
      requirements.push(priceComplete);
    }
  }

  if (!priceOptional && doc.adjustments.discountEnabled) requirements.push(!errors.discount);
  if (!priceOptional && doc.adjustments.shippingEnabled) requirements.push(!errors.shipping);
  if (!priceOptional && doc.adjustments.otherChargesEnabled) requirements.push(!errors.otherCharges);
  if (!priceOptional && doc.adjustments.taxEnabled) requirements.push(!errors.tax);

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
      { key: 'pricing', complete: priceOptional || (doc.items.length > 0 && pricingChecks.every(Boolean) && !errors.discount && !errors.shipping && !errors.otherCharges && !errors.tax) }
    ]
  };
}
