import type { CompanySettings, DocumentKind, DocumentItem, LourexDocument, VaultPayload } from '../types.js';
import { addDaysIso, makeId, todayIso } from './id.js';
import { companySnapshotFrom } from './defaults.js';

export function nextDocumentNumber(vault: VaultPayload, kind: DocumentKind): { number: string; vault: VaultPayload } {
  const year = new Date().getFullYear();
  const numbering = { ...vault.appSettings.numbering };
  if (kind === 'proforma') {
    if (numbering.proformaYear !== year) { numbering.proformaYear = year; numbering.proformaLast = 0; }
    numbering.proformaLast += 1;
  } else {
    if (numbering.invoiceYear !== year) { numbering.invoiceYear = year; numbering.invoiceLast = 0; }
    numbering.invoiceLast += 1;
  }
  const seq = kind === 'proforma' ? numbering.proformaLast : numbering.invoiceLast;
  const prefix = kind === 'proforma' ? numbering.proformaPrefix : numbering.invoicePrefix;
  return {
    number: `${prefix}-${year}-${String(seq).padStart(4, '0')}`,
    vault: { ...vault, appSettings: { ...vault.appSettings, numbering } }
  };
}

export function emptyItem(): DocumentItem {
  return { id: makeId('item'), descriptionEn: '', descriptionAr: '', hsCode: '', origin: '', packing: '', quantity: '1', unit: 'Carton', unitPrice: '' };
}

export function createBlankDocument(kind: DocumentKind, number: string, company: CompanySettings): LourexDocument {
  const issueDate = todayIso();
  return {
    id: makeId('doc'), kind, status: 'draft', number, issueDate,
    dueDate: kind === 'proforma' ? addDaysIso(issueDate, company.defaultValidityDays) : '',
    currency: company.defaultCurrency, language: company.defaultLanguage, customerSnapshot: null,
    companySnapshot: companySnapshotFrom(company), items: [emptyItem()],
    terms: { incoterm: company.defaultIncoterm, paymentTerms: company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },
    adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: false, taxPercent: '0' },
    appearance: { templateId: 'executive', paletteMode: 'auto', accentColor: '#b58b4f', latinFont: 'auto', arabicFont: 'auto', showBank: true, showSignature: Boolean(company.signatureDataUrl), showStamp: Boolean(company.stampDataUrl), showHsCode: true, showOrigin: true, showPacking: false },
    notes: company.defaultNotes, convertedFromId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export function validateDocument(doc: LourexDocument): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!doc.number.trim()) errors.number = 'Document number is required.';
  if (!doc.issueDate) errors.issueDate = 'Issue date is required.';
  if (doc.kind === 'proforma' && !doc.dueDate) errors.dueDate = 'Valid until date is required.';
  if (!doc.currency.trim()) errors.currency = 'Currency is required.';
  if (!doc.customerSnapshot?.companyNameEn.trim() && !doc.customerSnapshot?.companyNameAr.trim()) errors.customer = 'Select a customer.';
  if (doc.items.length < 1) errors.items = 'Add at least one item.';
  doc.items.forEach((item, index) => {
    if (doc.language === 'ar') {
      if (!item.descriptionAr.trim()) errors[`item-${index}-description`] = 'Description is required.';
    } else if (doc.language === 'bilingual') {
      if (!item.descriptionEn.trim()) errors[`item-${index}-description`] = 'English description is required.';
      if (!item.descriptionAr.trim()) errors[`item-${index}-description-ar`] = 'Arabic description is required.';
    } else if (!item.descriptionEn.trim()) {
      errors[`item-${index}-description`] = 'Description is required.';
    }
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) errors[`item-${index}-quantity`] = 'Quantity must be greater than 0.';
    if (!item.unit.trim()) errors[`item-${index}-unit`] = 'Unit is required.';
    if (!item.unitPrice.trim()) errors[`item-${index}-price`] = 'Unit price is required.';
    else {
      const price = Number(item.unitPrice);
      if (!Number.isFinite(price) || price < 0) errors[`item-${index}-price`] = 'Unit price must be 0 or greater.';
    }
  });
  const nonNegative = (value: string) => value.trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (doc.adjustments.discountEnabled && !nonNegative(doc.adjustments.discountValue)) errors.discount = 'Discount must be 0 or greater.';
  if (doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';
  if (doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';
  if (doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';
  return errors;
}

export function duplicateDocument(source: LourexDocument, number: string): LourexDocument {
  const now = new Date().toISOString();
  const issueDate = todayIso();
  let dueDate = source.kind === 'invoice' ? '' : source.dueDate;
  if (source.kind === 'proforma' && source.issueDate && source.dueDate) {
    const start = new Date(`${source.issueDate}T12:00:00`).getTime();
    const end = new Date(`${source.dueDate}T12:00:00`).getTime();
    const days = Math.max(0, Math.round((end - start) / 86_400_000));
    dueDate = addDaysIso(issueDate, days);
  }
  return { ...structuredClone(source), id: makeId('doc'), number, issueDate, dueDate, status: 'draft', convertedFromId: '', createdAt: now, updatedAt: now, items: source.items.map(i => ({ ...structuredClone(i), id: makeId('item') })) };
}

function conversionReference(source:LourexDocument):string{
  if(source.language==='ar')return `مرجع عرض السعر: ${source.number}`;
  if(source.language==='bilingual')return `Based on ${source.number} / مرجع عرض السعر: ${source.number}`;
  return `Based on ${source.number}`;
}

export function convertToInvoice(source: LourexDocument, number: string): LourexDocument {
  const d = duplicateDocument(source, number);
  const reference=conversionReference(source);
  const remarks=[reference,d.terms.remarks.trim()].filter(Boolean).join('\n');
  return { ...d, kind: 'invoice', convertedFromId: source.id, dueDate: '', status: 'draft', terms:{...d.terms,remarks} };
}

export function refreshCompanySnapshot(doc: LourexDocument, company: CompanySettings): LourexDocument {
  return { ...doc, companySnapshot: companySnapshotFrom(company), updatedAt: new Date().toISOString() };
}

export function paginateItems(items: DocumentItem[], reserveFinalDetails = true): DocumentItem[][] {
  const pages: DocumentItem[][] = [];
  let current: DocumentItem[] = [];
  let used = 0;
  const weightOf = (item: DocumentItem): number => {
    const text = `${item.descriptionEn} ${item.descriptionAr}`.trim();
    return Math.max(1, Math.ceil(text.length / 95));
  };
  const capacity = () => pages.length === 0 ? 7 : 13;
  for (const item of items) {
    const weight = weightOf(item);
    if (current.length && used + weight > capacity()) { pages.push(current); current = []; used = 0; }
    current.push(item); used += weight;
  }
  if (current.length || pages.length === 0) pages.push(current);

  const finalBudget = 6;
  const last = pages[pages.length - 1] ?? [];
  const lastWeight = last.reduce((sum, item) => sum + weightOf(item), 0);
  if (reserveFinalDetails && last.length > 1 && lastWeight > finalBudget) {
    let finalWeight = 0;
    let splitAt = last.length;
    for (let i = last.length - 1; i >= 0; i -= 1) {
      const w = weightOf(last[i]!);
      if (finalWeight + w > finalBudget && splitAt < last.length) break;
      finalWeight += w; splitAt = i;
      if (finalWeight >= finalBudget) break;
    }
    if (splitAt > 0) {
      pages[pages.length - 1] = last.slice(0, splitAt);
      pages.push(last.slice(splitAt));
    }
  }
  return pages;
}
