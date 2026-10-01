export type DocumentKind = 'draft' | 'rfq' | 'proforma' | 'proforma-invoice' | 'purchase-order' | 'invoice' | 'delivery-note' | 'payment-receipt';
export type DocumentLanguage = 'en' | 'ar' | 'bilingual';
export type UiLanguage = 'en' | 'ar';
export type TemplateId = 'executive' | 'minimal' | 'trade' | 'signature' | 'obsidian' | 'cobalt' | 'editorial' | 'split' | 'prism' | 'slate' | 'horizon' | 'mono' | 'aurora' | 'ledger' | 'noir' | 'midnight' | 'blackivory' | 'carbon';
export type DocumentStatus = 'draft' | 'final';
export type DocumentRole = 'standard' | 'credit-note';
export type DocumentLifecycleStatus = 'active' | 'voided';
export type DocumentEventType = 'created' | 'issued' | 'reissued' | 'revision-started' | 'revision-discarded' | 'voided' | 'credit-note-created' | 'payment-recorded' | 'payment-deleted' | 'converted' | 'audit';
export type PaymentStatus = 'unpaid' | 'partially-paid' | 'paid' | 'overdue';
export type PaymentMethod = 'cash' | 'bank-transfer' | 'card' | 'cheque' | 'other';
export type PurchaseStatus = 'draft' | 'posted' | 'reversed';
export type InventoryMovementType = 'opening' | 'purchase' | 'purchase-reversal' | 'issue' | 'adjustment' | 'transfer';
export type PricingMethod = 'markup' | 'margin';
export type DiscountMode = 'fixed' | 'percent';
export type AutoLockMinutes = 0 | 5 | 15 | 30;
export type PaletteMode = 'auto' | 'custom';
export type LatinFontId = 'auto' | 'inter' | 'source-sans' | 'montserrat' | 'playfair';
export type ArabicFontId = 'auto' | 'cairo' | 'tajawal' | 'noto-kufi' | 'noto-naskh';
export type TeamRole = 'owner' | 'admin' | 'finance' | 'sales' | 'purchasing' | 'viewer';
export type TeamMemberStatus = 'active' | 'suspended';
export type ApprovalAction = 'issue-document' | 'post-purchase' | 'reverse-purchase';
export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected';

export interface WorkspaceScopeFields { workspaceId?: string; branchId?: string; }

export interface BankDetails {
  bankName: string;
  accountName: string;
  iban: string;
  swift: string;
  currency: string;
}

export interface BankAccount extends BankDetails {
  id: string;
  label: string;
}

export interface TaxPreset {
  id: string;
  name: string;
  rate: string;
}

export interface PaymentTermPreset {
  id: string;
  label: string;
  days: number;
}

export interface PricingPolicy {
  method: PricingMethod;
  percent: string;
  rounding: string;
}

export interface CommercialControls {
  taxPresets: TaxPreset[];
  defaultTaxPresetId: string;
  paymentTermPresets: PaymentTermPreset[];
  defaultPaymentTermPresetId: string;
  pricing: PricingPolicy;
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
  bankAccounts: BankAccount[];
  defaultBankAccountId: string;
  commercial: CommercialControls;
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

export interface Supplier extends WorkspaceScopeFields {
  id: string;
  createdAt: string;
  updatedAt: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
  defaultCurrency: string;
  paymentTerms: string;
  notes: string;
}

export interface SupplierSnapshot {
  sourceSupplierId: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  vatTaxNumber: string;
  commercialRegistration: string;
}

export interface PurchaseItem {
  id: string;
  savedItemId: string;
  sku: string;
  descriptionEn: string;
  descriptionAr: string;
  quantity: string;
  unit: string;
  unitCost: string;
  landedUnitCost: string;
  previousUnitCost: string;
  previousCostCurrency: string;
}

export interface PurchaseRecord extends WorkspaceScopeFields {
  id: string;
  number: string;
  date: string;
  dueDate: string;
  supplierSnapshot: SupplierSnapshot | null;
  currency: string;
  items: PurchaseItem[];
  freight: string;
  duty: string;
  otherCosts: string;
  notes: string;
  status: PurchaseStatus;
  postedAt: string;
  reversedAt: string;
  reverseReason: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPaymentRecord extends WorkspaceScopeFields {
  id: string;
  purchaseId: string;
  purchaseNumber: string;
  supplierId: string;
  supplierNameEn: string;
  supplierNameAr: string;
  currency: string;
  amount: string;
  date: string;
  method: PaymentMethod;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseRecord extends WorkspaceScopeFields {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  supplierId: string;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryMovementRecord extends WorkspaceScopeFields {
  id: string;
  itemId: string;
  itemNameEn: string;
  itemNameAr: string;
  sku: string;
  date: string;
  type: InventoryMovementType;
  quantity: string;
  unitCost: string;
  currency: string;
  sourceId: string;
  sourceNumber: string;
  note: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  createdAt: string;
}

export type TreasuryLedgerType = 'deposit' | 'withdrawal' | 'transfer';
export interface TreasuryLedgerRecord extends WorkspaceScopeFields {
  id:string;type:TreasuryLedgerType;date:string;currency:string;amount:string;fromAccountId:string;toAccountId:string;reference:string;notes:string;createdAt:string;updatedAt:string;
}
export interface TreasuryReconciliationRecord extends WorkspaceScopeFields {
  id:string;movementKey:string;reconciledAt:string;note:string;createdAt:string;updatedAt:string;
}
export interface FxRateRecord extends WorkspaceScopeFields {
  id:string;date:string;fromCurrency:string;toCurrency:string;rate:string;sourceLabel:string;notes:string;createdAt:string;updatedAt:string;
}
export interface WarehouseRecord extends WorkspaceScopeFields {
  id:string;name:string;code:string;active:boolean;createdAt:string;updatedAt:string;
}

export interface Customer extends WorkspaceScopeFields {
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
  preferredCurrency: string;
  paymentTermPresetId: string;
  paymentTerms: string;
  paymentDueDays: string;
  creditLimit: string;
  creditCurrency: string;
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
  unitCost: string;
}

export interface DocumentAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export interface SavedItem extends WorkspaceScopeFields {
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
  lastUnitCost?: string;
  lastCostCurrency?: string;
  usageCount: number;
  lastUsedAt: string;
  category?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
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

export interface InternalCostAdjustments {
  shippingCost: string;
  otherCost: string;
}

export interface DocumentWatermark {
  enabled: boolean;
  type: 'text' | 'logo';
  pattern: 'single' | 'repeat';
  text: string;
  opacity: number;
  color: string;
  angle: number;
  size: number;
}

export type LetterBlockType = 'paragraph' | 'heading' | 'subheading' | 'bullet' | 'quote' | 'spacer';
export type LetterDirection = 'auto' | 'ltr' | 'rtl';
export type LetterAlign = 'start' | 'center' | 'end' | 'justify';
export type LetterFontId = 'system' | 'inter' | 'source-sans' | 'montserrat' | 'playfair' | 'cairo' | 'tajawal' | 'noto-kufi' | 'noto-naskh';

export interface LetterBlock {
  id: string;
  type: LetterBlockType;
  text: string;
  direction: LetterDirection;
  align: LetterAlign;
  font: LetterFontId;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  lineHeight: number;
  spacingBefore: number;
  spacingAfter: number;
}

export interface LetterDocumentData {
  preset: 'blank' | 'formal-letter' | 'company-letter' | 'letter-of-intent' | 'memo' | 'notice';
  recipient: string;
  attention: string;
  subject: string;
  reference: string;
  pageStyle: 'plain' | 'ruled' | 'grid';
  headerStyle: 'classic' | 'minimal' | 'accent';
  footerStyle: 'company' | 'minimal' | 'none';
  showLogo: boolean;
  showCompanyDetails: boolean;
  showDate: boolean;
  showReference: boolean;
  showSignature: boolean;
  showStamp: boolean;
  accentColor: string;
  bodyWidth: 'narrow' | 'comfortable' | 'wide';
  blocks: LetterBlock[];
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
  watermark: DocumentWatermark;
}

export interface LourexDocument extends WorkspaceScopeFields {
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
  bankAccountId: string;
  paymentTermPresetId: string;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  language: DocumentLanguage;
  customerSnapshot: CustomerSnapshot | null;
  supplierSnapshot?: SupplierSnapshot | null;
  supplierReference?: string;
  attachments?: DocumentAttachment[];
  companySnapshot: CompanySnapshot;
  items: DocumentItem[];
  terms: CommercialTerms;
  adjustments: FinancialAdjustments;
  internalCosts: InternalCostAdjustments;
  appearance: DocumentAppearance;
  letter: LetterDocumentData | null;
  notes: string;
  convertedFromId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord extends WorkspaceScopeFields {
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
  auditEntityType?: 'document'|'customer'|'supplier'|'product'|'purchase';
  auditEntityId?: string;
  auditEntityLabel?: string;
  auditAction?: 'created'|'updated'|'deleted'|'posted'|'reversed';
  auditActorKind?: 'user'|'system';
  workspaceId?: string;
  branchId?: string;
}

export interface DocumentRevisionRecord extends WorkspaceScopeFields {
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
  purchaseOrderPrefix?: string;
  draftPrefix?: string;
  proformaLast: number;
  invoiceLast: number;
  creditNoteLast: number;
  purchaseOrderLast?: number;
  draftLast?: number;
  proformaYear: number;
  invoiceYear: number;
  creditNoteYear: number;
  purchaseOrderYear?: number;
  draftYear?: number;
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
  activeTeamMemberId: string;
  activeWorkspaceId: string;
  activeBranchId: string;
  numbering: NumberingSettings;
  smartDefaults: SmartDocumentDefaults;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  company: CompanySettings;
  numbering: NumberingSettings;
  smartDefaults: SmartDocumentDefaults;
  createdAt: string;
  updatedAt: string;
}

export interface BranchRecord {
  id: string;
  workspaceId: string;
  name: string;
  code: string;
  city: string;
  country: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMemberRecord {
  id: string;
  displayName: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalPolicyRecord {
  id: string;
  action: ApprovalAction;
  enabled: boolean;
  approverRoles: TeamRole[];
}

export interface ApprovalRequestRecord extends WorkspaceScopeFields {
  id: string;
  action: ApprovalAction;
  entityType: 'document' | 'purchase';
  entityId: string;
  entityLabel: string;
  entityUpdatedAt: string;
  requestedByMemberId: string;
  status: ApprovalRequestStatus;
  decidedByMemberId: string;
  decisionNote: string;
  createdAt: string;
  decidedAt: string;
}

export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringTarget = 'document' | 'purchase';

export interface RecurringGeneratedRun {
  id: string;
  scheduledFor: string;
  generatedId: string;
  generatedNumber: string;
  createdAt: string;
}

export interface RecurringWorkflowRecord {
  id: string;
  workspaceId: string;
  branchId: string;
  target: RecurringTarget;
  title: string;
  sourceId: string;
  sourceNumber: string;
  cadence: RecurringCadence;
  interval: number;
  nextRunDate: string;
  endDate: string;
  enabled: boolean;
  documentTemplate: LourexDocument | null;
  purchaseTemplate: PurchaseRecord | null;
  generatedRuns: RecurringGeneratedRun[];
  createdAt: string;
  updatedAt: string;
}

export interface VaultPayload {
  schemaVersion: number;
  company: CompanySettings;
  appSettings: AppSettings;
  customers: Customer[];
  suppliers: Supplier[];
  purchases: PurchaseRecord[];
  supplierPayments: SupplierPaymentRecord[];
  expenses: ExpenseRecord[];
  inventoryMovements: InventoryMovementRecord[];
  treasuryEntries: TreasuryLedgerRecord[];
  treasuryReconciliations: TreasuryReconciliationRecord[];
  fxRates: FxRateRecord[];
  warehouses: WarehouseRecord[];
  workspaces: WorkspaceRecord[];
  branches: BranchRecord[];
  teamMembers: TeamMemberRecord[];
  approvalPolicies: ApprovalPolicyRecord[];
  approvalRequests: ApprovalRequestRecord[];
  recurringWorkflows: RecurringWorkflowRecord[];
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
  pinWrapIv?: string;
  pinWrapCipher?: string;
  recoveryIterations?: number;
  recoverySalt?: string;
  recoveryWrapIv?: string;
  recoveryWrapCipher?: string;
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
