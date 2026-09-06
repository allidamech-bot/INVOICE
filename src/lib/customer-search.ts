import type { Customer } from '../types.js';

function normalizeSearchValue(value:string):string{
  return value.trim().toLocaleLowerCase();
}

export function customerSearchText(customer:Customer):string{
  return [
    customer.companyNameEn,
    customer.companyNameAr,
    customer.contactPerson,
    customer.addressEn,
    customer.addressAr,
    customer.city,
    customer.country,
    customer.phone,
    customer.email,
    customer.vatTaxNumber,
    customer.commercialRegistration,
    customer.preferredCurrency,
    customer.paymentTerms,
    customer.paymentDueDays,
    customer.creditCurrency,
    customer.notes
  ].map(normalizeSearchValue).filter(Boolean).join(' ');
}

export function customerMatchesSearch(customer:Customer,query:string):boolean{
  const terms=normalizeSearchValue(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const haystack=customerSearchText(customer);
  return terms.every(term=>haystack.includes(term));
}
