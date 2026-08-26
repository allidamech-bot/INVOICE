import type { AppSettings, CompanySettings, CustomerSnapshot, CompanySnapshot, VaultPayload } from '../types.js';

export const APP_SCHEMA_VERSION = 4;
export const KDF_ITERATIONS = 310_000;

export function defaultCompany(): CompanySettings {
  return {
    nameEn: '', nameAr: '', logoDataUrl: '',
    addressEn: '', addressAr: '', city: '', country: '', phone: '', email: '', website: '',
    vatNumber: '', taxNumber: '', commercialRegistration: '',
    bank: { bankName: '', accountName: '', iban: '', swift: '', currency: 'USD' },
    signatureDataUrl: '', stampDataUrl: '', defaultCurrency: 'USD', defaultLanguage: 'en',
    defaultPaymentTerms: '', defaultIncoterm: '', defaultDeliveryTime: '', defaultValidityDays: 7,
    defaultFooterText: '', defaultNotes: ''
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    autoLockMinutes: 0,
    uiLanguage: 'en',
    numbering: { proformaPrefix: 'PI', invoicePrefix: 'INV', proformaLast: 0, invoiceLast: 0, proformaYear: new Date().getFullYear(), invoiceYear: new Date().getFullYear() },
    smartDefaults: {
      currency:'USD',
      language:'en',
      incoterm:'',
      paymentTerms:'',
      deliveryTime:'',
      quoteTemplateId:'executive',
      invoiceTemplateId:'executive',
      favoriteTemplateIds:[]
    }
  };
}

export function emptyVault(): VaultPayload {
  return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], documents: [], savedItems: [] };
}

export function customerSnapshotFrom(customer: { id: string; companyNameEn: string; companyNameAr: string; contactPerson: string; addressEn: string; addressAr: string; city: string; country: string; phone: string; email: string; vatTaxNumber: string; commercialRegistration: string }): CustomerSnapshot {
  return {
    sourceCustomerId: customer.id, companyNameEn: customer.companyNameEn, companyNameAr: customer.companyNameAr,
    contactPerson: customer.contactPerson, addressEn: customer.addressEn, addressAr: customer.addressAr, city: customer.city,
    country: customer.country, phone: customer.phone, email: customer.email, vatTaxNumber: customer.vatTaxNumber,
    commercialRegistration: customer.commercialRegistration
  };
}

export function companySnapshotFrom(company: CompanySettings): CompanySnapshot {
  return {
    nameEn: company.nameEn, nameAr: company.nameAr, logoDataUrl: company.logoDataUrl,
    addressEn: company.addressEn, addressAr: company.addressAr, city: company.city, country: company.country,
    phone: company.phone, email: company.email, website: company.website, vatNumber: company.vatNumber,
    taxNumber: company.taxNumber, commercialRegistration: company.commercialRegistration,
    bank: { ...company.bank }, signatureDataUrl: company.signatureDataUrl, stampDataUrl: company.stampDataUrl,
    footerText: company.defaultFooterText
  };
}
