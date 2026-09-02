export type DocumentKind = 'proforma' | 'invoice';
export type DocumentLanguage = 'en' | 'ar' | 'bilingual';
export type UiLanguage = 'en' | 'ar';
export type TemplateId = 'executive' | 'minimal' | 'trade' | 'signature' | 'obsidian' | 'cobalt' | 'editorial' | 'split' | 'prism' | 'slate' | 'horizon' | 'mono' | 'aurora' | 'ledger' | 'noir' | 'midnight' | 'blackivory' | 'carbon';
export type DocumentStatus = 'draft' | 'final';
export type DocumentRole = 'standard' | 'credit-note';
export type DocumentLifecycleStatus = 'active' | 'voided';
export type DocumentEventType = 'created' | 'issued' | 'reissued' | 'revision-started' | 'revision-discarded' | 'voided' | 'credit-note-created' | 'payment-recorded' | 'payment-deleted' | 'converted';
export type PaymentStatus = 'unpaid' | 'partially-paid' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank-transfer' | 'card' | 'cheque' | 'other';
export type DiscountMode = 'fixed' | 'percent';
export type AutoLockMinutes = 0 | 5 | 15 | 30;
export type PaletteMode = 'auto' | 'custom';
export type LatinFontId = 'auto' | 'inter' | 'source-sans' | 'montserrat' | 'playfair';
export type ArabicFontId = 'auto' | 'cairo' | 'tajawal' | 'noto-kufi' | 'noto-naskh';

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

export interface SavedItem {
  id: string;
  createdAt: string;
  updatedAt: string;
  sku?: string;
  descriptionEn: string;
  descriptionAr: string;
  hsCode: string;
  origin: string;
  packing: string;
  unit: string;
  lastUnitPrice: string;
  lastCurrency: string;
  usageCount: number;
  lastUsedAt: string;
  category?: string;
  tags?: string[];
  favorite?: boolean;
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
  paletteMode: PaletteMode;
  accentColor: string;
  latinFont: LatinFontId;
  arabicFont: ArabicFontId;
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
  role: DocumentRole;
  status: DocumentStatus;
  lifecycleStatus: DocumentLifecycleStatus;
  revision: number;
  creditForId: string;
  creditForNumber: string;
  voidedAt: string;
  voidReason: string;
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

export interface PaymentRecord {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerNameEn: string;
  customerNameAr: string;
  currency: string;
  amount: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentEventRecord {
  id: string;
  documentId: string;
  documentNumber: string;
  type: DocumentEventType;
  at: string;
  note: string;
  relatedDocumentId: string;
  relatedDocumentNumber: string;
  amount: string;
  currency: string;
}

export interface DocumentRevisionRecord {
  id: string;
  documentId: string;
  documentNumber: string;
  revision: number;
  snapshot: LourexDocument;
  createdAt: string;
}

export interface NumberingSettings {
  proformaPrefix: string;
  invoicePrefix: string;
  creditNotePrefix: string;
  proformaLast: number;
  invoiceLast: number;
  creditNoteLast: number;
  proformaYear: number;
  invoiceYear: number;
  creditNoteYear: number;
}

export interface SmartDocumentDefaults {
  currency: string;
  language: DocumentLanguage;
  incoterm: string;
  paymentTerms: string;
  deliveryTime: string;
  quoteTemplateId: TemplateId;
  invoiceTemplateId: TemplateId;
  favoriteTemplateIds: TemplateId[];
}

export interface AppSettings {
  autoLockMinutes: AutoLockMinutes;
  uiLanguage: UiLanguage;
  numbering: NumberingSettings;
  smartDefaults: SmartDocumentDefaults;
}

export interface VaultPayload {
  schemaVersion: number;
  company: CompanySettings;
  appSettings: AppSettings;
  customers: Customer[];
  documents: LourexDocument[];
  documentEvents: DocumentEventRecord[];
  documentRevisions: DocumentRevisionRecord[];
  payments: PaymentRecord[];
  savedItems: SavedItem[];
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

export type SafetySnapshotReason = 'pre-migration' | 'pre-restore' | 'pre-pin-change';

export interface SafetySnapshotRecord {
  id: 'safety-snapshot';
  createdAt: string;
  sourceSchemaVersion: number;
  reason: SafetySnapshotReason;
  security: SecurityMetadata;
  vault: EncryptedVaultRecord;
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
