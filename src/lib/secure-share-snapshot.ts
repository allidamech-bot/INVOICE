import type { LourexDocument } from '../types.js';
import { calculateTotals, lineTotal } from './money.js';

export interface PublicShareSnapshot{
  version:1;documentNumber:string;kind:string;language:string;currency:string;issueDate:string;dueDate:string;
  company:{nameEn:string;nameAr:string;addressEn:string;addressAr:string;city:string;country:string;phone:string;email:string;website:string;vatNumber:string;taxNumber:string;commercialRegistration:string;bank:null|{bankName:string;accountName:string;iban:string;swift:string;currency:string};footerText:string};
  customer:{companyNameEn:string;companyNameAr:string;contactPerson:string;city:string;country:string};
  items:Array<{descriptionEn:string;descriptionAr:string;hsCode:string;origin:string;packing:string;quantity:string;unit:string;unitPrice:string;lineTotal:string}>;
  terms:{incoterm:string;paymentTerms:string;packing:string;deliveryTime:string;portOfLoading:string;finalDestination:string;countryOfOrigin:string;validity:string;remarks:string};
  totals:{subtotal:string;discount:string;shipping:string;other:string;tax:string;grandTotal:string};
  notes:string;canRespond:boolean;
}

const MAX_SNAPSHOT_BYTES=650_000;
const ALLOWED_KINDS=new Set(['proforma','proforma-invoice','invoice','delivery-note','payment-receipt']);

export function secureShareEligible(doc:LourexDocument):boolean{
  return ALLOWED_KINDS.has(doc.kind)&&doc.role==='standard'&&doc.status==='final'&&doc.lifecycleStatus!=='voided'&&Boolean(doc.customerSnapshot?.sourceCustomerId);
}

export function buildPublicShareSnapshot(doc:LourexDocument):PublicShareSnapshot{
  if(!secureShareEligible(doc))throw new Error('Only active finalized customer documents can be shared securely.');
  const customer=doc.customerSnapshot;if(!customer)throw new Error('Customer information is required before sharing.');
  const calculated=calculateTotals(doc.items,doc.adjustments),company=doc.companySnapshot,showBank=Boolean(doc.appearance.showBank);
  const snapshot:PublicShareSnapshot={
    version:1,documentNumber:doc.number,kind:doc.kind,language:doc.language,currency:doc.currency,issueDate:doc.issueDate,dueDate:doc.dueDate,
    company:{nameEn:company.nameEn,nameAr:company.nameAr,addressEn:company.addressEn,addressAr:company.addressAr,city:company.city,country:company.country,phone:company.phone,email:company.email,website:company.website,vatNumber:company.vatNumber,taxNumber:company.taxNumber,commercialRegistration:company.commercialRegistration,bank:showBank?{bankName:company.bank.bankName,accountName:company.bank.accountName,iban:company.bank.iban,swift:company.bank.swift,currency:company.bank.currency}:null,footerText:company.footerText},
    customer:{companyNameEn:customer.companyNameEn,companyNameAr:customer.companyNameAr,contactPerson:customer.contactPerson,city:customer.city,country:customer.country},
    items:doc.items.map(item=>({descriptionEn:item.descriptionEn,descriptionAr:item.descriptionAr,hsCode:doc.appearance.showHsCode?item.hsCode:'',origin:doc.appearance.showOrigin?item.origin:'',packing:doc.appearance.showPacking?item.packing:'',quantity:item.quantity,unit:item.unit,unitPrice:item.unitPrice,lineTotal:lineTotal(item.quantity,item.unitPrice)})),
    terms:{incoterm:doc.terms.incoterm,paymentTerms:doc.terms.paymentTerms,packing:doc.terms.packing,deliveryTime:doc.terms.deliveryTime,portOfLoading:doc.terms.portOfLoading,finalDestination:doc.terms.finalDestination,countryOfOrigin:doc.terms.countryOfOrigin,validity:doc.terms.validity,remarks:doc.terms.remarks},
    totals:{subtotal:calculated.subtotal,discount:calculated.discount,shipping:calculated.shipping,other:calculated.otherCharges,tax:calculated.tax,grandTotal:calculated.grandTotal},notes:doc.notes,canRespond:doc.kind==='proforma'||doc.kind==='proforma-invoice'
  };
  const bytes=new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;if(bytes>MAX_SNAPSHOT_BYTES)throw new Error('This document is too large for Secure Share. Remove oversized customer-facing content and try again.');
  return snapshot;
}
