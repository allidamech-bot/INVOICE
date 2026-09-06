import type { CompanySettings, DocumentKind, DocumentItem, DocumentLanguage, LourexDocument, VaultPayload } from '../types.js';
import { addDaysIso, compareIsoDates, isIsoDate, makeId, normalizeValidityDays, todayIso } from './id.js';
import { companySnapshotFrom } from './defaults.js';
import { bankAccountIdForDetails, bankDetailsForId, defaultPaymentTermPreset, defaultTaxPreset } from './commercial-controls.js';
import { decimalToScaled, isDecimalInput, lineTotal } from './money.js';
import { t } from './i18n.js';

type NumberReservation={year:number;proforma:number;invoice:number;creditNote:number};
export type DocumentItemWeight=(item:DocumentItem)=>number;
const liveNumberReservations=new WeakMap<object,NumberReservation>();

export function nextDocumentNumber(vault: VaultPayload, kind: DocumentKind): { number: string; vault: VaultPayload } {
  const year = new Date().getFullYear();
  const sourceNumbering=vault.appSettings.numbering;
  const numbering = { ...sourceNumbering };
  const isProforma = kind === 'proforma';
  const yearKey = isProforma ? 'proformaYear' : 'invoiceYear';
  const lastKey = isProforma ? 'proformaLast' : 'invoiceLast';
  const prefixKey = isProforma ? 'proformaPrefix' : 'invoicePrefix';
  const fallbackPrefix = isProforma ? 'PI' : 'INV';

  if (numbering[yearKey] !== year) {
    numbering[yearKey] = year;
    numbering[lastKey] = 0;
  }

  const prefix = (numbering[prefixKey] || fallbackPrefix)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8) || fallbackPrefix;
  numbering[prefixKey] = prefix;

  // Calls can overlap before the first encrypted write updates React state.
  // Keep a short-lived reservation against the exact numbering object so two
  // same-tab actions can never receive the same sequence from one stale vault.
  // WeakMap keeps independent vaults/tests isolated and lets old state collect.
  const live=liveNumberReservations.get(sourceNumbering);
  const reserved=live?.year===year?(isProforma?live.proforma:live.invoice):0;
  const used = new Set(vault.documents.map(document => document.number.trim().toLowerCase()).filter(Boolean));
  let seq = Math.max(0, Math.trunc(numbering[lastKey] || 0),reserved);
  let number = '';
  do {
    seq += 1;
    number = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  } while (used.has(number.toLowerCase()));
  numbering[lastKey] = seq;
  const reservation: NumberReservation = live?.year===year
    ? {...live}
    : {year,proforma:0,invoice:0,creditNote:0};
  if(isProforma)reservation.proforma=seq;else reservation.invoice=seq;
  liveNumberReservations.set(sourceNumbering,reservation);

  return {
    number,
    vault: { ...vault, appSettings: { ...vault.appSettings, numbering } }
  };
}

export function nextCreditNoteNumber(vault:VaultPayload):{number:string;vault:VaultPayload}{
  const year=new Date().getFullYear();
  const sourceNumbering=vault.appSettings.numbering;
  const numbering={...sourceNumbering};
  if(numbering.creditNoteYear!==year){numbering.creditNoteYear=year;numbering.creditNoteLast=0;}
  const prefix=(numbering.creditNotePrefix||'CN').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||'CN';
  numbering.creditNotePrefix=prefix;
  const live=liveNumberReservations.get(sourceNumbering);
  const reserved=live?.year===year?live.creditNote:0;
  const used=new Set(vault.documents.map(document=>document.number.trim().toLowerCase()).filter(Boolean));
  let seq=Math.max(0,Math.trunc(numbering.creditNoteLast||0),reserved);
  let number='';
  do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4, '0')}`;}while(used.has(number.toLowerCase()));
  numbering.creditNoteLast=seq;
  const reservation: NumberReservation=live?.year===year?{...live}:{year,proforma:0,invoice:0,creditNote:0};
  reservation.creditNote=seq;
  liveNumberReservations.set(sourceNumbering,reservation);
  return{number,vault:{...vault,appSettings:{...vault.appSettings,numbering}}};
}

export function emptyItem(): DocumentItem {
  return { id: makeId('item'), descriptionEn: '', descriptionAr: '', hsCode: '', origin: '', packing: '', quantity: '1', unit: 'Carton', unitPrice: '', unitCost:'' };
}

export function createBlankDocument(kind: DocumentKind, number: string, company: CompanySettings): LourexDocument {
  const issueDate = todayIso();
  const validityDays=normalizeValidityDays(company.defaultValidityDays);
  const paymentPreset=defaultPaymentTermPreset(company);
  const taxPreset=defaultTaxPreset(company);
  return {
    id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:paymentPreset?.id||'', number, issueDate,
    dueDate: kind === 'proforma' ? addDaysIso(issueDate, validityDays) : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',
    currency: company.defaultCurrency, language: company.defaultLanguage, customerSnapshot: null,
    companySnapshot: companySnapshotFrom(company), items: [emptyItem()],
    terms: { incoterm: company.defaultIncoterm, paymentTerms: paymentPreset?.label||company.defaultPaymentTerms, packing: '', deliveryTime: company.defaultDeliveryTime, portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },
    adjustments: { discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping: '0.00', otherChargesEnabled: false, otherCharges: '0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },
    internalCosts:{shippingCost:'0.00',otherCost:'0.00'},
    appearance: { templateId: 'executive', paletteMode: 'auto', accentColor: '#b58b4f', latinFont: 'auto', arabicFont: 'auto', showBank: true, showSignature: Boolean(company.signatureDataUrl), showStamp: Boolean(company.stampDataUrl), showHsCode: true, showOrigin: true, showPacking: false },
    notes: company.defaultNotes, convertedFromId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export function hasDocumentCustomer(doc:LourexDocument):boolean{
  const customer=doc.customerSnapshot;
  return Boolean(customer&&(customer.companyNameEn.trim()||customer.companyNameAr.trim()));
}

function documentSubtotalCents(doc:LourexDocument):bigint{
  return doc.items.reduce((sum,item)=>sum+decimalToScaled(lineTotal(item.quantity,item.unitPrice),2),0n);
}

export function validateDocument(doc: LourexDocument): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!doc.number.trim()) errors.number = 'Document number is required.';
  if (!doc.issueDate) errors.issueDate = 'Issue date is required.';
  else if(!isIsoDate(doc.issueDate))errors.issueDate='Issue date is invalid.';
  if (doc.kind === 'proforma' && !doc.dueDate) errors.dueDate = 'Valid until date is required.';
  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=doc.kind==='proforma'?'Valid until date is invalid.':'Due date is invalid.';
  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=doc.kind==='proforma'?'Valid until date cannot be before issue date.':'Due date cannot be before issue date.';
  if (!doc.currency.trim()) errors.currency = 'Currency is required.';
  if (!hasDocumentCustomer(doc)) errors.customer = 'Select a customer.';
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
    if (!isDecimalInput(item.quantity) || decimalToScaled(item.quantity) <= 0n) errors[`item-${index}-quantity`] = 'Quantity must be greater than 0.';
    if (!item.unit.trim()) errors[`item-${index}-unit`] = 'Unit is required.';
    if (!item.unitPrice.trim()) errors[`item-${index}-price`] = 'Unit price is required.';
    else if (!isDecimalInput(item.unitPrice) || decimalToScaled(item.unitPrice) < 0n) errors[`item-${index}-price`] = 'Unit price must be 0 or greater.';
  });
  const nonNegative = (value: string) => isDecimalInput(value) && decimalToScaled(value) >= 0n;
  if (doc.adjustments.discountEnabled) {
    if(!nonNegative(doc.adjustments.discountValue))errors.discount='Discount must be 0 or greater.';
    else if(doc.adjustments.discountMode==='percent'&&decimalToScaled(doc.adjustments.discountValue)>decimalToScaled('100'))errors.discount='Discount percentage cannot exceed 100%.';
    else if(doc.adjustments.discountMode==='fixed'&&decimalToScaled(doc.adjustments.discountValue,2)>documentSubtotalCents(doc))errors.discount='Discount cannot exceed subtotal.';
  }
  if (doc.adjustments.shippingEnabled && !nonNegative(doc.adjustments.shipping)) errors.shipping = 'Shipping must be 0 or greater.';
  if (doc.adjustments.otherChargesEnabled && !nonNegative(doc.adjustments.otherCharges)) errors.otherCharges = 'Other charges must be 0 or greater.';
  if (doc.adjustments.taxEnabled && !nonNegative(doc.adjustments.taxPercent)) errors.tax = 'Tax must be 0 or greater.';
  return errors;
}

function daysBetween(start:string,end:string):number{
  if(!isIsoDate(start)||!isIsoDate(end))return 0;
  const a=Date.UTC(Number(start.slice(0,4)),Number(start.slice(5,7))-1,Number(start.slice(8,10)));
  const b=Date.UTC(Number(end.slice(0,4)),Number(end.slice(5,7))-1,Number(end.slice(8,10)));
  return Math.max(0,Math.round((b-a)/86_400_000));
}

export function duplicateDocument(source: LourexDocument, number: string): LourexDocument {
  const now = new Date().toISOString();
  const issueDate = todayIso();
  // Preserve the original commercial date interval instead of silently dropping
  // invoice due dates. Proformas keep their validity window and invoices keep
  // their payment due window relative to the new issue date.
  let dueDate = source.dueDate;
  if (source.issueDate && source.dueDate) {
    dueDate = addDaysIso(issueDate, daysBetween(source.issueDate,source.dueDate));
  }
  return { ...structuredClone(source), id: makeId('doc'), number, issueDate, dueDate, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', convertedFromId: '', createdAt: now, updatedAt: now, items: source.items.map(i => ({ ...structuredClone(i), id: makeId('item') })) };
}

function conversionReference(source:LourexDocument):string{
  if(source.language==='ar')return `مرجع عرض السعر: ${source.number}`;
  if(source.language==='bilingual')return `Based on ${source.number} / مرجع عرض السعر: ${source.number}`;
  return `Based on ${source.number}`;
}

export function convertToInvoice(source: LourexDocument, number: string): LourexDocument {
  if(source.kind!=='proforma'||source.role!=='standard'||source.status!=='final'||source.lifecycleStatus==='voided'){
    throw new Error(t('Only an active Final quotation can be converted to an invoice.','يمكن تحويل عرض سعر نهائي ونشط فقط إلى فاتورة.'));
  }
  const d = duplicateDocument(source, number);
  const reference=conversionReference(source);
  const remarks=[reference,d.terms.remarks.trim()].filter(Boolean).join('\n');
  return { ...d, kind: 'invoice', role:'standard', convertedFromId: source.id, dueDate: '', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', terms:{...d.terms,remarks} };
}

export function refreshCompanySnapshot(doc: LourexDocument, company: CompanySettings): LourexDocument {
  const companySnapshot=companySnapshotFrom(company);
  const configuredBank=doc.bankAccountId?bankDetailsForId(company,doc.bankAccountId):null;
  const inferredBankId=!configuredBank&&doc.companySnapshot?.bank?bankAccountIdForDetails(company,doc.companySnapshot.bank):'';
  const bankAccountId=configuredBank?doc.bankAccountId:(inferredBankId||company.defaultBankAccountId||'primary');
  const selectedBank=bankDetailsForId(company,bankAccountId)||companySnapshot.bank;
  return { ...doc, bankAccountId, companySnapshot:{...companySnapshot,bank:{...selectedBank}}, updatedAt: new Date().toISOString() };
}

export function paginateItems(items: DocumentItem[], reserveFinalDetails = true, firstPageCapacity = 7, language:DocumentLanguage='bilingual', customWeight?:DocumentItemWeight): DocumentItem[][] {
  const pages: DocumentItem[][] = [];
  let current: DocumentItem[] = [];
  let used = 0;
  const defaultWeight = (item: DocumentItem): number => {
    const text = language==='en'?item.descriptionEn:language==='ar'?item.descriptionAr:`${item.descriptionEn} ${item.descriptionAr}`.trim();
    return Math.max(1, Math.ceil(text.trim().length / 95));
  };
  const weightOf=(item:DocumentItem):number=>{
    const value=customWeight?customWeight(item):defaultWeight(item);
    return Number.isFinite(value)?Math.max(1,Math.ceil(value)):1;
  };
  const safeFirstPageCapacity=Math.max(1,Math.min(7,Math.trunc(firstPageCapacity)||7));
  const capacity = () => pages.length === 0 ? safeFirstPageCapacity : 13;
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