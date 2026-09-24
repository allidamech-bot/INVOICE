import type { DocumentKind, DocumentRole } from '../types.js';

export interface BusinessDocumentDefinition {
  kind: DocumentKind | 'credit-note' | 'statement-account';
  order: number;
  en: string;
  ar: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  prefix: string;
  party: 'customer' | 'supplier' | 'freeform';
  financial: boolean;
  priceOptional: boolean;
  bankAllowed: boolean;
}

export const BUSINESS_DOCUMENT_CATALOG: readonly BusinessDocumentDefinition[] = [
  {kind:'draft',order:1,en:'Draft',ar:'مسودة',titleEn:'DRAFT',titleAr:'مسودة',descriptionEn:'Free-form company document',descriptionAr:'مستند شركة حر',prefix:'DR',party:'freeform',financial:false,priceOptional:true,bankAllowed:false},
  {kind:'rfq',order:2,en:'RFQ',ar:'طلب عرض سعر',titleEn:'REQUEST FOR QUOTATION',titleAr:'طلب عرض سعر',descriptionEn:'Request prices and terms from a supplier',descriptionAr:'طلب أسعار وشروط من مورد',prefix:'RFQ',party:'supplier',financial:false,priceOptional:true,bankAllowed:false},
  {kind:'proforma',order:3,en:'Quotation',ar:'عرض سعر',titleEn:'QUOTATION',titleAr:'عرض سعر',descriptionEn:'Commercial quotation for a customer',descriptionAr:'عرض تجاري للعميل',prefix:'QUO',party:'customer',financial:false,priceOptional:false,bankAllowed:true},
  {kind:'proforma-invoice',order:4,en:'Proforma Invoice',ar:'فاتورة مبدئية',titleEn:'PROFORMA INVOICE',titleAr:'فاتورة مبدئية',descriptionEn:'Pre-shipment / pre-payment invoice',descriptionAr:'فاتورة قبل الشحن أو الدفع',prefix:'PI',party:'customer',financial:false,priceOptional:false,bankAllowed:true},
  {kind:'purchase-order',order:5,en:'Purchase Order',ar:'طلب شراء',titleEn:'PURCHASE ORDER',titleAr:'طلب شراء',descriptionEn:'Order goods from a supplier',descriptionAr:'طلب بضائع من مورد',prefix:'PO',party:'supplier',financial:false,priceOptional:false,bankAllowed:false},
  {kind:'invoice',order:6,en:'Commercial Invoice',ar:'فاتورة تجارية',titleEn:'COMMERCIAL INVOICE',titleAr:'فاتورة تجارية',descriptionEn:'Final commercial sales invoice',descriptionAr:'فاتورة البيع التجارية النهائية',prefix:'INV',party:'customer',financial:true,priceOptional:false,bankAllowed:true},
  {kind:'delivery-note',order:7,en:'Delivery Note',ar:'سند تسليم',titleEn:'DELIVERY NOTE',titleAr:'سند تسليم',descriptionEn:'Confirm goods delivered to a customer',descriptionAr:'إثبات تسليم البضاعة للعميل',prefix:'DN',party:'customer',financial:false,priceOptional:true,bankAllowed:false},
  {kind:'payment-receipt',order:8,en:'Payment Receipt',ar:'إيصال دفع',titleEn:'PAYMENT RECEIPT',titleAr:'إيصال دفع',descriptionEn:'Acknowledge a received payment',descriptionAr:'إثبات استلام دفعة',prefix:'RCPT',party:'customer',financial:false,priceOptional:false,bankAllowed:false},
  {kind:'credit-note',order:9,en:'Credit Note',ar:'إشعار دائن',titleEn:'CREDIT NOTE',titleAr:'إشعار دائن',descriptionEn:'Created from an issued commercial invoice',descriptionAr:'يُنشأ من فاتورة تجارية صادرة',prefix:'CN',party:'customer',financial:true,priceOptional:false,bankAllowed:false},
  {kind:'statement-account',order:10,en:'Statement of Account',ar:'كشف حساب',titleEn:'STATEMENT OF ACCOUNT',titleAr:'كشف حساب',descriptionEn:'Customer account statement',descriptionAr:'كشف حركة ورصيد حساب العميل',prefix:'SOA',party:'customer',financial:false,priceOptional:false,bankAllowed:false}
] as const;

export function businessDocumentDefinition(kind:DocumentKind,role:DocumentRole='standard'):BusinessDocumentDefinition{
  const key=role==='credit-note'?'credit-note':kind;
  return BUSINESS_DOCUMENT_CATALOG.find(item=>item.kind===key)
    ?? BUSINESS_DOCUMENT_CATALOG.find(item=>item.kind==='invoice')!;
}

export function documentKindLabel(kind:DocumentKind,role:DocumentRole='standard'):{en:string;ar:string}{
  const item=businessDocumentDefinition(kind,role);
  return {en:item.en,ar:item.ar};
}

export function documentKindTitle(kind:DocumentKind,role:DocumentRole='standard'):{en:string;ar:string}{
  const item=businessDocumentDefinition(kind,role);
  return {en:item.titleEn,ar:item.titleAr};
}

export function documentNumberPrefix(kind:DocumentKind):string{
  return businessDocumentDefinition(kind).prefix;
}

export function documentParty(kind:DocumentKind):'customer'|'supplier'|'freeform'{
  return businessDocumentDefinition(kind).party;
}

export function isSupplierDocumentKind(kind:DocumentKind):boolean{return documentParty(kind)==='supplier';}
export function isFreeformDocumentKind(kind:DocumentKind):boolean{return documentParty(kind)==='freeform';}
export function isFinancialDocumentKind(kind:DocumentKind,role:DocumentRole='standard'):boolean{return businessDocumentDefinition(kind,role).financial;}
export function documentPriceOptional(kind:DocumentKind):boolean{return businessDocumentDefinition(kind).priceOptional;}
export function documentBankAllowed(kind:DocumentKind,role:DocumentRole='standard'):boolean{return businessDocumentDefinition(kind,role).bankAllowed;}
export function documentCanConvertToInvoice(kind:DocumentKind):boolean{return kind==='proforma'||kind==='proforma-invoice';}
export type DocumentSecondaryDateKind='none'|'valid-until'|'requested-delivery'|'due-date'|'response-due';
export function documentSecondaryDateKind(kind:DocumentKind,role:DocumentRole='standard'):DocumentSecondaryDateKind{
  if(role==='credit-note'||kind==='draft'||kind==='delivery-note'||kind==='payment-receipt')return'none';
  if(kind==='proforma'||kind==='proforma-invoice')return'valid-until';
  if(kind==='purchase-order')return'requested-delivery';
  if(kind==='rfq')return'response-due';
  return'due-date';
}
export function documentUsesCommercialDefaults(kind:DocumentKind):boolean{return kind!=='draft'&&kind!=='payment-receipt';}
