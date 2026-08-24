export type DocumentKind = 'proforma' | 'invoice';
export type DocumentLanguage = 'en' | 'ar' | 'bilingual';
export type UiLanguage = 'en' | 'ar';
export type TemplateId = 'executive' | 'minimal' | 'trade' | 'signature';
export type DocumentStatus = 'draft' | 'final';
export type DiscountMode = 'fixed' | 'percent';
export type AutoLockMinutes = 0 | 5 | 15 | 30;

export interface BankDetails {
  bankName: string;
  accountName: string;
  iban: string;
  swift: string;
  currency: string;
}

export interface CompanySettings {
  nameEn: string;
  nameAr: string;
  logoDataUrl: string;
  addressEn: string;
  addressAr: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
  taxNumber: string;
  commercialRegistration: string;
  bank: BankDetails;
  signatureDataUrl: string;
  stampDataUrl: string;
  defaultCurrency: string;
  defaultLanguage: DocumentLanguage;
  defaultPaymentTerms: string;
  defaultIncoterm: string;
  defaultDeliveryTime: string;
  defaultValidityDays: number;
  defaultFooterText: string;
  defaultNotes: string;
}

export interface Customer {
  id: string;
  createdAt: string;
  updatedAt: string;
  companyNameEn: string;
  companyNameAr: string;
  contactPerson: string;
  addressEn: string;
  addressAr: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
  notes: string;
}

export interface CustomerSnapshot {
  sourceCustomerId: string;
  companyNameEn: string;
  companyNameAr: string;
  contactPerson: string;
  addressEn: string;
  addressAr: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
}

export interface CompanySnapshot {
  nameEn: string;
  nameAr: string;
  logoDataUrl: string;
  addressEn: string;
  addressAr: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
  taxNumber: string;
  commercialRegistration: string;
  bank: BankDetails;
  signatureDataUrl: string;
  stampDataUrl: string;
  footerText: string;
}

export interface DocumentItem {
  id: string;
  descriptionEn: string;
  descriptionAr: string;
  hsCode: string;
  origin: string;
  packing: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

export interface CommercialTerms {
  incoterm: string;
  paymentTerms: string;
  packing: string;
  deliveryTime: string;
  portOfLoading: string;
  finalDestination: string;
  countryOfOrigin: string;
  validity: string;
  remarks: string;
}

export interface FinancialAdjustments {
  discountEnabled: boolean;
  discountMode: DiscountMode;
  discountValue: string;
  shippingEnabled: boolean;
  shipping: string;
  otherChargesEnabled: boolean;
  otherCharges: string;
  taxEnabled: boolean;
  taxPercent: string;
}

export interface DocumentAppearance {
  templateId: TemplateId;
  accentColor: string;
  showBank: boolean;
  showSignature: boolean;
  showStamp: boolean;
  showHsCode: boolean;
  showOrigin: boolean;
  showPacking: boolean;
}

export interface LourexDocument {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  language: DocumentLanguage;
  customerSnapshot: CustomerSnapshot | null;
  companySnapshot: CompanySnapshot;
  items: DocumentItem[];
  terms: CommercialTerms;
  adjustments: FinancialAdjustments;
  appearance: DocumentAppearance;
  notes: string;
  convertedFromId: string;
  createdAt: string;
  updatedAt: string;
}

export interface NumberingSettings {
  proformaPrefix: string;
  invoicePrefix: string;
  proformaLast: number;
  invoiceLast: number;
  proformaYear: number;
  invoiceYear: number;
}

export interface AppSettings {
  autoLockMinutes: AutoLockMinutes;
  uiLanguage: UiLanguage;
  numbering: NumberingSettings;
}

export interface VaultPayload {
  schemaVersion: number;
  company: CompanySettings;
  appSettings: AppSettings;
  customers: Customer[];
  documents: LourexDocument[];
}

export interface SecurityMetadata {
  id: 'security';
  version: number;
  iterations: number;
  salt: string;
  verifierIv: string;
  verifierCipher: string;
}

export interface EncryptedVaultRecord {
  id: 'vault';
  schemaVersion: number;
  iv: string;
  cipher: string;
  updatedAt: string;
}

export interface PublicPreferencesRecord {
  id: 'public-preferences';
  logoDataUrl: string;
  uiLanguage: UiLanguage;
  updatedAt: string;
}

export interface SessionKeyRecord {
  id: 'session-key';
  token: string;
  key: CryptoKey;
  updatedAt: string;
}

export interface CloudAccountRecord {
  id: 'cloud-account';
  uid: string;
  email: string;
  linkedAt: string;
  updatedAt: string;
}

export interface EncryptedBackupFile {
  format: 'LOUREX_BACKUP';
  version: 1;
  createdAt: string;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string; data: string };
}
