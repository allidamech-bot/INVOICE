import type { AppSettings, CompanySettings, CustomerSnapshot, CompanySnapshot, VaultPayload } from '../types.js';
import { defaultBankDetails } from './commercial-controls.js';

// Compatibility marker: APP_SCHEMA_VERSION = 7 introduced encrypted payment records.
// v9 adds encrypted internal cost metadata for profitability analysis.
// v10 adds commercial controls, bank choices and customer credit policy.
// v11 adds encrypted suppliers, purchases, expenses and inventory ledger records.
export const APP_SCHEMA_VERSION = 11;
export const KDF_ITERATIONS = 310_000;

export function defaultCompany(): CompanySettings {
  return {
    nameEn: '', nameAr: '', logoDataUrl: '',
    addressEn: '', addressAr: '', city: '', country: '', phone: '', email: '', website: '',
    vatNumber: '', taxNumber: '', commercialRegistration: '',
    bank: { bankName: '', accountName: '', iban: '', swift: '', currency: 'USD' },
    bankAccounts: [], defaultBankAccountId: 'primary',
    commercial: {
      taxPresets: [], defaultTaxPresetId: '',
      paymentTermPresets: [
        { id:'term-due', label:'Due on receipt', days:0 },
        { id:'term-net7', label:'Net 7', days:7 },
        { id:'term-net15', label:'Net 15', days:15 },
        { id:'term-net30', label:'Net 30', days:30 },
        { id:'term-net45', label:'Net 45', days:45 },
        { id:'term-net60', label:'Net 60', days:60 }
      ],
      defaultPaymentTermPresetId: '', pricing:{ method:'markup', percent:'0', rounding:'0.01' }
    },
    signatureDataUrl: '', stampDataUrl: '', defaultCurrency: 'USD', defaultLanguage: 'en',
    defaultPaymentTerms: '', defaultIncoterm: '', defaultDeliveryTime: '', defaultValidityDays: 7,
    defaultFooterText: '', defaultNotes: ''
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    autoLockMinutes: 0,
    uiLanguage: 'en',
    numbering: { proformaPrefix: 'PI', invoicePrefix: 'INV', creditNotePrefix: 'CN', proformaLast: 0, invoiceLast: 0, creditNoteLast: 0, proformaYear: new Date().getFullYear(), invoiceYear: new Date().getFullYear(), creditNoteYear: new Date().getFullYear() },
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
  return { schemaVersion: APP_SCHEMA_VERSION, company: defaultCompany(), appSettings: defaultAppSettings(), customers: [], suppliers: [], purchases: [], expenses: [], inventoryMovements: [], documents: [], documentEvents: [], documentRevisions: [], payments: [], savedItems: [] };
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
    bank: { ...defaultBankDetails(company) }, signatureDataUrl: company.signatureDataUrl, stampDataUrl: company.stampDataUrl,
    footerText: company.defaultFooterText
  };
}
