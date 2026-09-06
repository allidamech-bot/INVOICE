import type { Customer } from '../types.js';

export function customerMatchesQuery(customer:Customer,rawQuery:string):boolean{
  const terms=rawQuery.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const haystack=[
    customer.companyNameEn,
    customer.companyNameAr,
    customer.contactPerson,
    customer.email,
    customer.phone,
    customer.city,
    customer.country,
    customer.vatTaxNumber,
    customer.commercialRegistration,
    customer.preferredCurrency,
    customer.creditCurrency,
    customer.paymentTerms,
    customer.notes
  ].join(' ').toLocaleLowerCase();
  return terms.every(term=>haystack.includes(term));
}
