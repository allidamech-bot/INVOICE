import type { CompanySettings, DocumentKind, DocumentItem, DocumentLanguage, LourexDocument, VaultPayload } from '../types.js';
import { addDaysIso, compareIsoDates, isIsoDate, makeId, normalizeValidityDays, todayIso } from './id.js';
import { companySnapshotFrom } from './defaults.js';
import { bankAccountIdForDetails, bankDetailsForId, defaultPaymentTermPreset, defaultTaxPreset } from './commercial-controls.js';
import { decimalToScaled, isDecimalInput, isNonNegativeDecimalInput, lineTotal } from './money.js';
import { t } from './i18n.js';
import { defaultLetterData, defaultWatermark } from './document-extras.js';
import { documentBankAllowed, documentCanConvertToInvoice, documentNumberPrefix, documentPriceOptional, documentSecondaryDateKind, documentUsesCommercialDefaults, isSupplierDocumentKind } from './document-kinds.js';

type NumberReservation={year:number;proforma:number;invoice:number;creditNote:number;purchaseOrder:number;draft:number};
export type DocumentItemWeight=(item:DocumentItem)=>number;
const liveNumberReservations=new WeakMap<object,NumberReservation>();
const liveAuxiliaryReservations=new WeakMap<object,{year:number;values:Record<string,number>}>();

export function nextDocumentNumber(vault: VaultPayload, kind: DocumentKind): { number: string; vault: VaultPayload } {
  const year = new Date().getFullYear();
  const sourceNumbering=vault.appSettings.numbering;
  const numbering = { ...sourceNumbering };
  const isProforma=kind==='proforma';
  const isPurchaseOrder=kind==='purchase-order';
  const isDraft=kind==='draft';
  const fallbackPrefix=isProforma?'QUO':isPurchaseOrder?'PO':isDraft?'DR':'INV';
  let prefix='';
  let seq=0;
  const live=liveNumberReservations.get(sourceNumbering);
  const used=new Set(vault.documents.map(document=>document.number.trim().toLowerCase()).filter(Boolean));
  const auxiliaryKind=kind==='rfq'||kind==='proforma-invoice'||kind==='delivery-note'||kind==='payment-receipt';
  if(auxiliaryKind){
    prefix=documentNumberPrefix(kind);
    const escapedPrefix=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const matchPattern=new RegExp(`^${escapedPrefix}-${year}-(\\d+)$`,'i');
    const scanned=vault.documents.reduce((max,document)=>{const match=document.number.trim().match(matchPattern);return match?Math.max(max,Number(match[1])||0):max;},0);
    const live=liveAuxiliaryReservations.get(sourceNumbering);const reserved=live?.year===year?(live.values[kind]??0):0;seq=Math.max(scanned,reserved);
    let number='';
    do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4,'0')}`;}while(used.has(number.toLowerCase()));
    const values=live?.year===year?{...live.values}:{};values[kind]=seq;liveAuxiliaryReservations.set(sourceNumbering,{year,values});
    return {number,vault};
  }

  if(isProforma){
    if(numbering.proformaYear!==year){numbering.proformaYear=year;numbering.proformaLast=0;}
    prefix=(numbering.proformaPrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.proformaPrefix=prefix;
    const reserved=live?.year===year?live.proforma:0;
    seq=Math.max(0,Math.trunc(numbering.proformaLast||0),reserved);
  }else if(isDraft){
    if((numbering.draftYear??year)!==year){numbering.draftYear=year;numbering.draftLast=0;}
    prefix=(numbering.draftPrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.draftPrefix=prefix;
    const reserved=live?.year===year?live.draft:0;
    seq=Math.max(0,Math.trunc(numbering.draftLast||0),reserved);
  }else if(isPurchaseOrder){
    if((numbering.purchaseOrderYear??year)!==year){numbering.purchaseOrderYear=year;numbering.purchaseOrderLast=0;}
    prefix=(numbering.purchaseOrderPrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.purchaseOrderPrefix=prefix;
    const reserved=live?.year===year?live.purchaseOrder:0;
    seq=Math.max(0,Math.trunc(numbering.purchaseOrderLast||0),reserved);
  }else{
    if(numbering.invoiceYear!==year){numbering.invoiceYear=year;numbering.invoiceLast=0;}
    prefix=(numbering.invoicePrefix||fallbackPrefix).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)||fallbackPrefix;
    numbering.invoicePrefix=prefix;
    const reserved=live?.year===year?live.invoice:0;
    seq=Math.max(0,Math.trunc(numbering.invoiceLast||0),reserved);
  }

  let number='';
  do{seq+=1;number=`${prefix}-${year}-${String(seq).padStart(4, '0')}`;}while(used.has(number.toLowerCase()));
  const reservation:NumberReservation=live?.year===year?{...live}:{year,proforma:0,invoice:0,creditNote:0,purchaseOrder:0,draft:0};
  if(isProforma){numbering.proformaLast=seq;reservation.proforma=seq;}
  else if(isDraft){numbering.draftLast=seq;numbering.draftYear=year;reservation.draft=seq;}
  else if(isPurchaseOrder){numbering.purchaseOrderLast=seq;numbering.purchaseOrderYear=year;reservation.purchaseOrder=seq;}
  else{numbering.invoiceLast=seq;reservation.invoice=seq;}
  liveNumberReservations.set(sourceNumbering,reservation);
  return {number,vault:{...vault,appSettings:{...vault.appSettings,numbering}}};
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
  const reservation: NumberReservation=live?.year===year?{...live}:{year,proforma:0,invoice:0,creditNote:0,purchaseOrder:0,draft:0};
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
  const usesCommercialDefaults=documentUsesCommercialDefaults(kind);
  return {
    id: makeId('doc'), kind, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', bankAccountId:company.defaultBankAccountId||'primary', paymentTermPresetId:usesCommercialDefaults?(paymentPreset?.id||''):'', number, issueDate,
    dueDate: (kind === 'proforma' || kind === 'proforma-invoice') ? addDaysIso(issueDate, validityDays) : kind === 'purchase-order' || kind === 'draft' || kind === 'rfq' || kind === 'delivery-note' || kind === 'payment-receipt' ? '' : paymentPreset ? addDaysIso(issueDate,paymentPreset.days) : '',
    currency: company.defaultCurrency, language: company.defaultLanguage, customerSnapshot: null,
    supplierSnapshot:null, supplierReference:'', attachments:[],
    companySnapshot: companySnapshotFrom(company), items: kind==='draft'?[]:[emptyItem()],
    terms: { incoterm: usesCommercialDefaults?company.defaultIncoterm:'', paymentTerms: usesCommercialDefaults?(paymentPreset?.label||company.defaultPaymentTerms):'', packing: '', deliveryTime: usesCommercialDefaults?company.defaultDeliveryTime:'', portOfLoading: '', finalDestination: '', countryOfOrigin: '', validity: '', remarks: '' },
    adjustments: documentPriceOptional(kind)?{ discountEnabled:false, discountMode:'fixed', discountValue:'0.00', shippingEnabled:false, shipping:'0.00', otherChargesEnabled:false, otherCharges:'0.00', taxEnabled:false, taxPercent:'0' }:{ discountEnabled: false, discountMode: 'fixed', discountValue: '0.00', shippingEnabled: false, shipping:'0.00', otherChargesEnabled: false, otherCharges:'0.00', taxEnabled: Boolean(taxPreset), taxPercent: taxPreset?.rate||'0' },
    internalCosts:{shippingCost:'0.00',otherCost:'0.00'},
    appearance: { templateId: 'executive', paletteMode: 'auto', accentColor: kind==='draft'?'#8e7cf3':kind==='rfq'?'#2563eb':kind==='purchase-order'?'#c88f37':kind==='delivery-note'?'#7c8b95':kind==='payment-receipt'?'#0f9f7f':'#159fa7', latinFont: 'auto', arabicFont: 'auto', showBank: documentBankAllowed(kind), showSignature: Boolean(company.signatureDataUrl), showStamp: Boolean(company.stampDataUrl), showHsCode: true, showOrigin: true, showPacking: false, watermark: defaultWatermark() },
    letter: kind==='draft'?defaultLetterData(company.defaultLanguage):null,
    notes: kind==='draft'?'':company.defaultNotes, convertedFromId: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export function hasDocumentSupplier(doc:LourexDocument):boolean{
  const supplier=doc.supplierSnapshot;
  return Boolean(supplier&&(supplier.nameEn.trim()||supplier.nameAr.trim()));
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
  if(doc.kind==='draft')return errors;
  const secondaryDate=documentSecondaryDateKind(doc.kind,doc.role);
  if(secondaryDate==='valid-until'&&!doc.dueDate)errors.dueDate='Valid until date is required.';
  if(secondaryDate==='requested-delivery'&&!doc.dueDate)errors.dueDate='Requested delivery date is required.';
  if(doc.dueDate&&!isIsoDate(doc.dueDate))errors.dueDate=secondaryDate==='valid-until'?'Valid until date is invalid.':secondaryDate==='requested-delivery'?'Requested delivery date is invalid.':secondaryDate==='response-due'?'Response due date is invalid.':'Due date is invalid.';
  else if(doc.dueDate&&isIsoDate(doc.issueDate)&&compareIsoDates(doc.dueDate,doc.issueDate)<0)errors.dueDate=secondaryDate==='valid-until'?'Valid until date cannot be before issue date.':secondaryDate==='requested-delivery'?'Requested delivery cannot be before order date.':secondaryDate==='response-due'?'Response due date cannot be before issue date.':'Due date cannot be before issue date.';
  if (!doc.currency.trim()) errors.currency = 'Currency is required.';
  if(isSupplierDocumentKind(doc.kind)){if(!hasDocumentSupplier(doc))errors.supplier='Select a supplier.';}
  else if (!hasDocumentCustomer(doc)) errors.customer = 'Select a customer.';
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
    if (!documentPriceOptional(doc.kind) && !item.unitPrice.trim()) errors[`item-${index}-price`] = 'Unit price is required.';
    else if (item.unitPrice.trim() && !isNonNegativeDecimalInput(item.unitPrice)) errors[`item-${index}-price`] = 'Unit price must be 0 or greater.';
  });
  const nonNegative = (value: string) => isNonNegativeDecimalInput(value);
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
  let dueDate = source.dueDate;
  if (source.issueDate && source.dueDate) {
    dueDate = addDaysIso(issueDate, daysBetween(source.issueDate,source.dueDate));
  }
  // Attachment data URLs can be multi-megabyte immutable strings. Remove them
  // from structuredClone so WebKit does not allocate another transient copy of
  // every payload just to duplicate the surrounding document object. Metadata is
  // still copied and the duplicate intentionally keeps the same attachment files.
  const attachmentRefs=(source.attachments??[]).map(attachment=>({...attachment}));
  const clone=structuredClone({...source,attachments:[]}) as LourexDocument;
  return { ...clone, attachments:attachmentRefs, id: makeId('doc'), number, issueDate, dueDate, role:'standard', status: 'draft', lifecycleStatus:'active', revision:1, creditForId:'', creditForNumber:'', voidedAt:'', voidReason:'', convertedFromId: '', createdAt: now, updatedAt: now, items: source.items.map(i => ({ ...i, id: makeId('item') })) };
}

function conversionReference(source:LourexDocument):string{
  const proformaInvoice=source.kind==='proforma-invoice';
  if(source.language==='ar')return `${proformaInvoice?'مرجع الفاتورة المبدئية':'مرجع عرض السعر'}: ${source.number}`;
  if(source.language==='bilingual')return `${proformaInvoice?'Based on Proforma Invoice':'Based on Quotation'} ${source.number} / ${proformaInvoice?'مرجع الفاتورة المبدئية':'مرجع عرض السعر'}: ${source.number}`;
  return `${proformaInvoice?'Based on Proforma Invoice':'Based on Quotation'} ${source.number}`;
}

export function convertToInvoice(source: LourexDocument, number: string): LourexDocument {
  if(!documentCanConvertToInvoice(source.kind)||source.role!=='standard'||source.status!=='final'||source.lifecycleStatus==='voided'){
    throw new Error(t('Only an active Final quotation or proforma invoice can be converted to a Commercial Invoice.','يمكن تحويل عرض سعر أو فاتورة مبدئية نهائية ونشطة فقط إلى فاتورة تجارية.'));
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
