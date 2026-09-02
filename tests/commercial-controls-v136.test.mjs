import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBlankDocument } from '../dist/src/lib/documents.js';
import { APP_SCHEMA_VERSION, defaultCompany, emptyVault } from '../dist/src/lib/defaults.js';
import { migrateVault } from '../dist/src/storage/vault.js';
import { addDaysIso } from '../dist/src/lib/id.js';
import {
  applyCustomerCommercialDefaults,
  assertCustomerCreditLimit,
  bankAccountsForCompany,
  customerCreditStatus,
  pricingSuggestedUnitPrice,
  validateCommercialCompany,
  validateCustomerCommercial
} from '../dist/src/lib/commercial-controls.js';

const read=path=>readFile(path,'utf8');
const now='2026-01-01T00:00:00.000Z';
function customer(overrides={}){return{id:'cust-a',createdAt:now,updatedAt:now,companyNameEn:'Alpha Trading',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',preferredCurrency:'',paymentTermPresetId:'',paymentTerms:'',paymentDueDays:'',creditLimit:'',creditCurrency:'',notes:'',...overrides};}
function invoice(company,{id='inv-1',number='INV-1',price='700.00',currency='USD',status='final',customerId='cust-a'}={}){const doc=createBlankDocument('invoice',number,company);doc.id=id;doc.status=status;doc.issueDate='2026-01-10';doc.dueDate='2026-02-09';doc.currency=currency;doc.customerSnapshot={sourceCustomerId:customerId,companyNameEn:'Alpha Trading',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:''};doc.items=[{...doc.items[0],descriptionEn:'Product',quantity:'1',unitPrice:price,unitCost:'400.00'}];return doc;}
function payment(doc,amount='250.00'){return{id:'pay-1',invoiceId:doc.id,invoiceNumber:doc.number,customerId:doc.customerSnapshot.sourceCustomerId,customerNameEn:'Alpha Trading',customerNameAr:'',currency:doc.currency,amount,date:'2026-01-15',method:'bank-transfer',reference:'TRX-1',notes:'',createdAt:now,updatedAt:now};}
function credit(company,source,amount='200.00'){const doc=invoice(company,{id:'cn-1',number:'CN-1',price:amount,currency:source.currency,status:'final',customerId:source.customerSnapshot.sourceCustomerId});doc.role='credit-note';doc.creditForId=source.id;doc.creditForNumber=source.number;return doc;}

test('v136 migrates legacy vaults to commercial controls without changing historical snapshots',()=>{
  const legacy=emptyVault();legacy.schemaVersion=9;
  delete legacy.company.bankAccounts;delete legacy.company.defaultBankAccountId;delete legacy.company.commercial;
  legacy.customers=[{id:'legacy-c',createdAt:now,updatedAt:now,companyNameEn:'Legacy',companyNameAr:'',contactPerson:'',addressEn:'',addressAr:'',city:'',country:'',phone:'',email:'',vatTaxNumber:'',commercialRegistration:'',notes:''}];
  const oldDoc=createBlankDocument('invoice','INV-OLD',defaultCompany());delete oldDoc.bankAccountId;delete oldDoc.paymentTermPresetId;oldDoc.companySnapshot.bank.bankName='Historical Bank';legacy.documents=[oldDoc];
  const migrated=migrateVault(legacy);
  assert.equal(migrated.schemaVersion,APP_SCHEMA_VERSION);assert.ok(APP_SCHEMA_VERSION>=10);assert.equal(migrated.company.defaultBankAccountId,'primary');assert.ok(Array.isArray(migrated.company.bankAccounts));assert.ok(migrated.company.commercial.paymentTermPresets.some(item=>item.days===30));
  assert.equal(migrated.customers[0].creditLimit,'');assert.equal(migrated.customers[0].preferredCurrency,'');assert.equal(migrated.documents[0].bankAccountId,'');assert.equal(migrated.documents[0].companySnapshot.bank.bankName,'Historical Bank');
});

test('v136 chooses and snapshots the configured default bank without mutating the primary bank',()=>{
  const company=defaultCompany();company.bank={bankName:'Primary Bank',accountName:'LOUREX',iban:'P1',swift:'P1SW',currency:'USD'};company.bankAccounts=[{id:'eur-bank',label:'EUR Account',bankName:'Euro Bank',accountName:'LOUREX EU',iban:'E1',swift:'E1SW',currency:'EUR'}];company.defaultBankAccountId='eur-bank';
  const accounts=bankAccountsForCompany(company);assert.deepEqual(accounts.map(item=>item.id),['primary','eur-bank']);
  const doc=createBlankDocument('invoice','INV-BANK',company);assert.equal(doc.bankAccountId,'eur-bank');assert.equal(doc.companySnapshot.bank.bankName,'Euro Bank');assert.equal(company.bank.bankName,'Primary Bank');
});

test('v136 default tax and payment-term presets initialize invoice totals policy and due date',()=>{
  const company=defaultCompany();company.commercial.taxPresets=[{id:'vat-15',name:'VAT',rate:'15'}];company.commercial.defaultTaxPresetId='vat-15';company.commercial.defaultPaymentTermPresetId='term-net30';
  const doc=createBlankDocument('invoice','INV-PRESET',company);
  assert.equal(doc.adjustments.taxEnabled,true);assert.equal(doc.adjustments.taxPercent,'15');assert.equal(doc.paymentTermPresetId,'term-net30');assert.equal(doc.terms.paymentTerms,'Net 30');assert.equal(doc.dueDate,addDaysIso(doc.issueDate,30));
});

test('v136 customer defaults can set invoice currency and due date without contaminating snapshots',()=>{
  const company=defaultCompany();const c=customer({preferredCurrency:'EUR',paymentTermPresetId:'term-net45',paymentTerms:'Net 45',paymentDueDays:'45',creditLimit:'5000',creditCurrency:'EUR'});const doc=invoice(company,{status:'draft',price:'100.00'});
  const next=applyCustomerCommercialDefaults(doc,c,company);assert.equal(next.currency,'EUR');assert.equal(next.paymentTermPresetId,'term-net45');assert.equal(next.terms.paymentTerms,'Net 45');assert.equal(next.dueDate,addDaysIso(next.issueDate,45));
  assert.equal('creditLimit' in next.customerSnapshot,false);
});

test('v136 pricing suggestions support markup margin and explicit upward price rounding',()=>{
  assert.equal(pricingSuggestedUnitPrice('80.00',{method:'markup',percent:'25',rounding:'0.01'}),'100.00');
  assert.equal(pricingSuggestedUnitPrice('80.00',{method:'margin',percent:'20',rounding:'0.01'}),'100.00');
  assert.equal(pricingSuggestedUnitPrice('10.00',{method:'markup',percent:'1',rounding:'0.50'}),'10.50');
  assert.equal(pricingSuggestedUnitPrice('80.00',{method:'margin',percent:'100',rounding:'0.01'}),'');
  const invalid=defaultCompany();invalid.commercial.pricing={method:'margin',percent:'100',rounding:'0.01'};assert.match(validateCommercialCompany(invalid),/100/);
});

test('v136 credit control blocks only same-currency projected exposure above the customer limit',()=>{
  const company=defaultCompany();const c=customer({creditLimit:'1000.00',creditCurrency:'USD'});const existing=invoice(company,{price:'700.00'});const candidate=invoice(company,{id:'draft-2',number:'INV-2',price:'400.00',status:'draft'});
  let status=customerCreditStatus(candidate,[c],[existing],[],'2026-01-20');assert.equal(status.comparable,true);assert.equal(status.outstanding,'700.00');assert.equal(status.candidate,'400.00');assert.equal(status.projected,'1100.00');assert.equal(status.exceeded,true);assert.throws(()=>assertCustomerCreditLimit({...candidate,status:'final'},[c],[existing],[]),/credit limit exceeded/i);
  status=customerCreditStatus(candidate,[c],[existing],[payment(existing)],'2026-01-20');assert.equal(status.outstanding,'450.00');assert.equal(status.projected,'850.00');assert.equal(status.exceeded,false);
  assert.doesNotThrow(()=>assertCustomerCreditLimit({...candidate,status:'final'},[c],[existing],[payment(existing)]));
});

test('v136 active credit notes reduce exposure while cross-currency limits never use hidden FX',()=>{
  const company=defaultCompany();const c=customer({creditLimit:'1000.00',creditCurrency:'USD'});const existing=invoice(company,{price:'900.00'});const cn=credit(company,existing,'200.00');const candidate=invoice(company,{id:'draft-2',number:'INV-2',price:'250.00',status:'draft'});
  const afterCredit=customerCreditStatus(candidate,[c],[existing,cn],[],'2026-01-20');assert.equal(afterCredit.outstanding,'700.00');assert.equal(afterCredit.projected,'950.00');assert.equal(afterCredit.exceeded,false);
  const eur={...candidate,currency:'EUR'};const cross=customerCreditStatus(eur,[c],[existing,cn],[],'2026-01-20');assert.equal(cross.comparable,false);assert.equal(cross.creditCurrency,'USD');assert.doesNotThrow(()=>assertCustomerCreditLimit({...eur,status:'final'},[c],[existing,cn],[]));
});

test('v136 validates customer credit metadata and ships all controls offline',async()=>{
  assert.ok(validateCustomerCommercial(customer({creditLimit:'-1',creditCurrency:'USD'})));assert.ok(validateCustomerCommercial(customer({creditLimit:'1000',creditCurrency:''})));assert.equal(validateCustomerCommercial(customer({creditLimit:'1000',creditCurrency:'SAR',paymentDueDays:'30'})),'');
  const [app,editor,customers,settings,commercialSettings,logic,defaults,html,sw,css]=await Promise.all([read('src/app/App.tsx'),read('src/components/EditorPageCore.tsx'),read('src/components/CustomersPage.tsx'),read('src/components/SettingsModal.tsx'),read('src/components/CommercialControlsSettings.tsx'),read('src/lib/commercial-controls.ts'),read('src/lib/defaults.ts'),read('index.html'),read('public/sw.js'),read('src/styles/commercial-controls-v136.css')]);
  assert.ok(defaults.includes(`APP_SCHEMA_VERSION = ${APP_SCHEMA_VERSION}`));assert.ok(APP_SCHEMA_VERSION>=10);assert.ok(settings.includes("'commercial'"));for(const term of ['Bank accounts','Tax presets','Payment terms','Pricing policy','Target gross margin'])assert.ok(commercialSettings.includes(term),term);
  for(const term of ['Credit Limit','Credit Currency','Preferred Currency'])assert.ok(customers.includes(term),term);
  for(const term of ['pricingSuggestedUnitPrice','credit-limit-banner','Bank Account','commercial-preset-chips'])assert.ok(editor.includes(term),term);
  assert.ok(app.includes("assertCustomerCreditLimit(updated"));assert.ok(app.includes("assertCustomerCreditLimit(target"),'print/PDF issuance must not bypass credit policy');assert.ok(app.includes('convertedPaymentPreset'));
  assert.ok(!logic.includes('exchangeRate'));assert.ok(!logic.includes('fxRate'));assert.ok(logic.includes('comparable=currency===creditCurrency'));
  assert.ok(html.includes('commercial-controls-v136.css'));assert.ok(html.indexOf('commercial-controls-v136.css')<html.indexOf('performance-polish-v100.css'));
  const activeCacheVersion=Number(sw.match(/^const CACHE = 'lourex-invoice-v(\d+)';/m)?.[1]??0);assert.ok(activeCacheVersion>=136);assert.ok(sw.includes("const CACHE = 'lourex-invoice-v135'"));for(const asset of ['commercial-controls-v136.css','CommercialControlsSettings.js','commercial-controls.js'])assert.ok(sw.includes(asset),asset);
  assert.ok(css.includes('@media print'));assert.ok(css.includes('.credit-limit-banner'));assert.ok(css.includes('.pricing-suggestion-chip'));
});
