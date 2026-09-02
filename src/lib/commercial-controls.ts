import type { BankAccount, BankDetails, CompanySettings, Customer, LourexDocument, PaymentRecord, PaymentTermPreset, PricingPolicy, TaxPreset } from '../types.js';
import { addDaysIso, todayIso } from './id.js';
import { calculateTotals, decimalToScaled, isDecimalInput } from './money.js';
import { receivablesByCurrency } from './receivables.js';
import { t } from './i18n.js';

export const PRIMARY_BANK_ACCOUNT_ID='primary';
const ROUNDING_STEPS=new Set(['0.01','0.05','0.10','0.50','1.00']);

function cleanCurrency(value:string,fallback='USD'):string{return value.trim().toUpperCase()||fallback;}
function centsString(cents:bigint):string{const sign=cents<0n?'-':'';const abs=cents<0n?-cents:cents;return `${sign}${abs/100n}.${(abs%100n).toString().padStart(2,'0')}`;}
function bankDetails(account:BankDetails):BankDetails{return{bankName:account.bankName,accountName:account.accountName,iban:account.iban,swift:account.swift,currency:cleanCurrency(account.currency)};}
function sameBank(a:BankDetails,b:BankDetails):boolean{return a.bankName===b.bankName&&a.accountName===b.accountName&&a.iban===b.iban&&a.swift===b.swift&&cleanCurrency(a.currency)===cleanCurrency(b.currency);}

export function bankAccountsForCompany(company:CompanySettings):BankAccount[]{
  const primary:BankAccount={id:PRIMARY_BANK_ACCOUNT_ID,label:company.bank.bankName.trim()||t('Primary bank','البنك الرئيسي'),...bankDetails(company.bank)};
  const extras=(company.bankAccounts??[]).filter(account=>account.id&&account.id!==PRIMARY_BANK_ACCOUNT_ID).map(account=>({...account,...bankDetails(account)}));
  return [primary,...extras];
}

export function bankDetailsForId(company:CompanySettings,id:string):BankDetails|null{
  if(!id||id===PRIMARY_BANK_ACCOUNT_ID)return bankDetails(company.bank);
  const account=(company.bankAccounts??[]).find(item=>item.id===id);
  return account?bankDetails(account):null;
}

export function defaultBankDetails(company:CompanySettings):BankDetails{
  return bankDetailsForId(company,company.defaultBankAccountId)||bankDetails(company.bank);
}

export function bankAccountIdForDetails(company:CompanySettings,details:BankDetails):string{
  const match=bankAccountsForCompany(company).find(account=>sameBank(account,details));
  return match?.id||'';
}

export function taxPresetById(company:CompanySettings,id:string):TaxPreset|null{return (company.commercial?.taxPresets??[]).find(item=>item.id===id)??null;}
export function defaultTaxPreset(company:CompanySettings):TaxPreset|null{return taxPresetById(company,company.commercial?.defaultTaxPresetId||'');}
export function paymentTermPresetById(company:CompanySettings,id:string):PaymentTermPreset|null{return (company.commercial?.paymentTermPresets??[]).find(item=>item.id===id)??null;}
export function paymentTermPresetByLabel(company:CompanySettings,label:string):PaymentTermPreset|null{
  const key=label.trim().toLocaleLowerCase();if(!key)return null;
  return (company.commercial?.paymentTermPresets??[]).find(item=>item.label.trim().toLocaleLowerCase()===key)??null;
}
export function defaultPaymentTermPreset(company:CompanySettings):PaymentTermPreset|null{return paymentTermPresetById(company,company.commercial?.defaultPaymentTermPresetId||'');}

export function applyPaymentTermPreset(document:LourexDocument,preset:PaymentTermPreset):LourexDocument{
  const dueDate=document.kind==='invoice'?addDaysIso(document.issueDate,preset.days):document.dueDate;
  return {...document,paymentTermPresetId:preset.id,terms:{...document.terms,paymentTerms:preset.label},dueDate};
}

export function applyCustomerCommercialDefaults(document:LourexDocument,customer:Customer,company:CompanySettings):LourexDocument{
  let next={...document,currency:cleanCurrency(customer.preferredCurrency||document.currency,document.currency||'USD')};
  const preset=paymentTermPresetById(company,customer.paymentTermPresetId||'');
  if(preset)return applyPaymentTermPreset(next,preset);
  const paymentTerms=customer.paymentTerms.trim();
  if(paymentTerms)next={...next,paymentTermPresetId:'',terms:{...next.terms,paymentTerms}};
  const rawDays=customer.paymentDueDays.trim();
  if(next.kind==='invoice'&&/^\d+$/.test(rawDays))next={...next,dueDate:addDaysIso(next.issueDate,Math.min(3650,Number(rawDays)))};
  return next;
}

export function pricingSuggestedUnitPrice(cost:string,policy:PricingPolicy):string{
  if(!cost.trim()||!isDecimalInput(cost)||!policy.percent.trim()||!isDecimalInput(policy.percent))return'';
  const costScaled=decimalToScaled(cost,4);const percentScaled=decimalToScaled(policy.percent,4);const hundredScaled=1_000_000n;
  if(costScaled<0n||percentScaled<=0n)return'';
  let priceScaled:bigint;
  if(policy.method==='margin'){
    const denominator=hundredScaled-percentScaled;if(denominator<=0n)return'';
    priceScaled=(costScaled*hundredScaled+denominator-1n)/denominator;
  }else priceScaled=(costScaled*(hundredScaled+percentScaled)+hundredScaled/2n)/hundredScaled;
  let cents=(priceScaled+50n)/100n;
  const rounding=ROUNDING_STEPS.has(policy.rounding)?policy.rounding:'0.01';
  const increment=decimalToScaled(rounding,2);
  if(increment>1n)cents=((cents+increment-1n)/increment)*increment;
  return centsString(cents);
}

export interface CustomerCreditStatus{
  customerId:string;
  customerName:string;
  currency:string;
  creditCurrency:string;
  limit:string;
  outstanding:string;
  candidate:string;
  projected:string;
  available:string;
  comparable:boolean;
  exceeded:boolean;
}

export function customerCreditStatus(document:LourexDocument,customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[],asOf=todayIso()):CustomerCreditStatus|null{
  if(document.kind!=='invoice'||document.role==='credit-note'||document.lifecycleStatus==='voided')return null;
  const customerId=document.customerSnapshot?.sourceCustomerId||'';const customer=customers.find(item=>item.id===customerId);if(!customer)return null;
  const limitRaw=customer.creditLimit.trim();if(!limitRaw||!isDecimalInput(limitRaw)||decimalToScaled(limitRaw,2)<0n)return null;
  const currency=cleanCurrency(document.currency);const creditCurrency=cleanCurrency(customer.creditCurrency||customer.preferredCurrency||currency,currency);
  const persisted=documents.find(item=>item.id===document.id);
  const alreadyFinal=Boolean(persisted?.status==='final'&&persisted.lifecycleStatus!=='voided');
  const baseDocuments=alreadyFinal?documents:documents.filter(item=>item.id!==document.id);
  const receivable=receivablesByCurrency(baseDocuments,payments,asOf,customer.id).find(item=>cleanCurrency(item.currency)===currency);
  const outstandingCents=decimalToScaled(receivable?.outstanding||'0.00',2);
  const candidateCents=alreadyFinal?0n:decimalToScaled(calculateTotals(document.items,document.adjustments).grandTotal,2);
  const limitCents=decimalToScaled(limitRaw,2);
  const comparable=currency===creditCurrency;
  const projectedCents=outstandingCents+candidateCents;
  const availableCents=limitCents-outstandingCents;
  return{
    customerId:customer.id,
    customerName:(customer.companyNameEn||customer.companyNameAr).trim(),
    currency,creditCurrency,limit:centsString(limitCents),outstanding:centsString(outstandingCents),candidate:centsString(candidateCents),projected:centsString(projectedCents),available:centsString(availableCents),
    comparable,exceeded:comparable&&projectedCents>limitCents
  };
}

export function assertCustomerCreditLimit(document:LourexDocument,customers:Customer[],documents:LourexDocument[],payments:PaymentRecord[]):void{
  const status=customerCreditStatus(document,customers,documents,payments);if(!status||!status.comparable||!status.exceeded)return;
  throw new Error(t(`Customer credit limit exceeded. Projected exposure is ${status.projected} ${status.currency} against a limit of ${status.limit} ${status.currency}.`,`تم تجاوز حد ائتمان العميل. التعرض المتوقع ${status.projected} ${status.currency} مقابل حد ${status.limit} ${status.currency}.`));
}

export function validateCommercialCompany(company:CompanySettings):string{
  const accounts=bankAccountsForCompany(company);const accountIds=new Set<string>();
  for(const account of accounts){if(accountIds.has(account.id))return t('Bank account IDs must be unique.','يجب أن تكون معرفات الحسابات البنكية فريدة.');accountIds.add(account.id);if(!account.label.trim())return t('Each bank account needs a label.','يحتاج كل حساب بنكي إلى اسم مختصر.');}
  if(company.defaultBankAccountId&&!accountIds.has(company.defaultBankAccountId))return t('Choose a valid default bank account.','اختر حسابًا بنكيًا افتراضيًا صالحًا.');
  const taxIds=new Set<string>();
  for(const preset of company.commercial.taxPresets){if(!preset.id||taxIds.has(preset.id))return t('Tax preset IDs must be unique.','يجب أن تكون معرفات إعدادات الضريبة فريدة.');taxIds.add(preset.id);if(!preset.name.trim())return t('Each tax preset needs a name.','يحتاج كل إعداد ضريبة إلى اسم.');if(!isDecimalInput(preset.rate)||decimalToScaled(preset.rate)<0n)return t('Tax rates must be zero or greater.','يجب أن تكون نسب الضريبة صفرًا أو أكثر.');}
  if(company.commercial.defaultTaxPresetId&&!taxIds.has(company.commercial.defaultTaxPresetId))return t('Choose a valid default tax preset.','اختر إعداد ضريبة افتراضيًا صالحًا.');
  const termIds=new Set<string>();
  for(const preset of company.commercial.paymentTermPresets){if(!preset.id||termIds.has(preset.id))return t('Payment-term preset IDs must be unique.','يجب أن تكون معرفات شروط الدفع فريدة.');termIds.add(preset.id);if(!preset.label.trim())return t('Each payment term needs a label.','يحتاج كل شرط دفع إلى اسم.');if(!Number.isInteger(preset.days)||preset.days<0||preset.days>3650)return t('Payment-term days must be between 0 and 3650.','يجب أن تكون أيام شروط الدفع بين 0 و3650.');}
  if(company.commercial.defaultPaymentTermPresetId&&!termIds.has(company.commercial.defaultPaymentTermPresetId))return t('Choose a valid default payment term.','اختر شرط دفع افتراضيًا صالحًا.');
  const pricing=company.commercial.pricing;if(!isDecimalInput(pricing.percent)||decimalToScaled(pricing.percent)<0n)return t('Pricing percentage must be zero or greater.','يجب أن تكون نسبة التسعير صفرًا أو أكثر.');if(pricing.method==='margin'&&decimalToScaled(pricing.percent)>=decimalToScaled('100'))return t('Target margin must be below 100%.','يجب أن يكون هامش الربح المستهدف أقل من 100%.');if(!ROUNDING_STEPS.has(pricing.rounding))return t('Choose a valid pricing rounding step.','اختر خطوة تقريب صالحة للتسعير.');
  return'';
}

export function validateCustomerCommercial(customer:Customer):string{
  if(customer.creditLimit.trim()&&(!isDecimalInput(customer.creditLimit)||decimalToScaled(customer.creditLimit,2)<0n))return t('Credit limit must be zero or greater.','يجب أن يكون حد الائتمان صفرًا أو أكثر.');
  if(customer.creditLimit.trim()&&!customer.creditCurrency.trim())return t('Choose a currency for the credit limit.','اختر عملة لحد الائتمان.');
  if(customer.paymentDueDays.trim()&&!/^\d+$/.test(customer.paymentDueDays.trim()))return t('Payment due days must be a whole number.','يجب أن تكون أيام الاستحقاق رقمًا صحيحًا.');
  if(/^\d+$/.test(customer.paymentDueDays.trim())&&Number(customer.paymentDueDays)>3650)return t('Payment due days cannot exceed 3650.','لا يمكن أن تتجاوز أيام الاستحقاق 3650 يومًا.');
  return'';
}
