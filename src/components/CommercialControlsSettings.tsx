import type { BankAccount, CompanySettings, PaymentTermPreset, PricingPolicy, TaxPreset } from '../types.js';
import { makeId } from '../lib/id.js';
import { PRIMARY_BANK_ACCOUNT_ID, bankAccountsForCompany } from '../lib/commercial-controls.js';
import { t } from '../lib/i18n.js';
import { Button, Field, IconButton, Input, Select } from './UI.js';

interface Props{company:CompanySettings;onChange:(company:CompanySettings)=>void;}

export function CommercialControlsSettings({company,onChange}:Props):any{
  const commercial=company.commercial;
  const updateCommercial=(patch:Partial<CompanySettings['commercial']>)=>onChange({...company,commercial:{...commercial,...patch}});
  const updatePricing=(patch:Partial<PricingPolicy>)=>updateCommercial({pricing:{...commercial.pricing,...patch}});
  const banks=bankAccountsForCompany(company);

  const updateBank=(id:string,key:keyof BankAccount,value:string)=>onChange({...company,bankAccounts:company.bankAccounts.map(account=>account.id===id?{...account,[key]:value}:account)});
  const addBank=()=>onChange({...company,bankAccounts:[...company.bankAccounts,{id:makeId('bank'),label:t('Alternate bank','بنك إضافي'),bankName:'',accountName:'',iban:'',swift:'',currency:company.defaultCurrency||'USD'}]});
  const removeBank=(id:string)=>onChange({...company,bankAccounts:company.bankAccounts.filter(account=>account.id!==id),defaultBankAccountId:company.defaultBankAccountId===id?PRIMARY_BANK_ACCOUNT_ID:company.defaultBankAccountId});

  const updateTax=(id:string,key:keyof TaxPreset,value:string)=>updateCommercial({taxPresets:commercial.taxPresets.map(preset=>preset.id===id?{...preset,[key]:value}:preset)});
  const addTax=()=>updateCommercial({taxPresets:[...commercial.taxPresets,{id:makeId('tax'),name:t('VAT','ضريبة القيمة المضافة'),rate:'0'}]});
  const removeTax=(id:string)=>updateCommercial({taxPresets:commercial.taxPresets.filter(preset=>preset.id!==id),defaultTaxPresetId:commercial.defaultTaxPresetId===id?'':commercial.defaultTaxPresetId});

  const updateTerm=(id:string,key:keyof PaymentTermPreset,value:string|number)=>updateCommercial({paymentTermPresets:commercial.paymentTermPresets.map(preset=>preset.id===id?{...preset,[key]:value}:preset)});
  const addTerm=()=>updateCommercial({paymentTermPresets:[...commercial.paymentTermPresets,{id:makeId('term'),label:t('Net 30','صافي 30 يوم'),days:30}]});
  const removeTerm=(id:string)=>updateCommercial({paymentTermPresets:commercial.paymentTermPresets.filter(preset=>preset.id!==id),defaultPaymentTermPresetId:commercial.defaultPaymentTermPresetId===id?'':commercial.defaultPaymentTermPresetId});

  return <div className="commercial-controls-settings">
    <section className="settings-section commercial-settings-section">
      <div className="commercial-section-heading"><div><h4>{t('Bank accounts','الحسابات البنكية')}</h4><p>{t('Keep the primary bank in Company settings and add alternate receiving accounts here. Choose which one new documents use by default.','احتفظ بالبنك الرئيسي في إعدادات الشركة وأضف هنا حسابات استلام إضافية، ثم اختر الحساب الافتراضي للمستندات الجديدة.')}</p></div><Button icon="plus" onClick={addBank}>{t('Add Bank','إضافة بنك')}</Button></div>
      <Field label={t('Default bank account','الحساب البنكي الافتراضي')}><Select value={company.defaultBankAccountId||PRIMARY_BANK_ACCOUNT_ID} onChange={(e:any)=>onChange({...company,defaultBankAccountId:e.target.value})}>{banks.map(account=><option key={account.id} value={account.id}>{account.label} · {account.currency}</option>)}</Select></Field>
      {company.bankAccounts.length?<div className="commercial-row-list">{company.bankAccounts.map(account=><article className="commercial-row-card bank-account-row" key={account.id}><header><strong>{account.label||t('Alternate bank','بنك إضافي')}</strong><IconButton icon="trash" label={t('Remove bank','حذف البنك')} variant="danger" onClick={()=>removeBank(account.id)}/></header><div className="form-grid two"><Field label={t('Label','الاسم المختصر')}><Input value={account.label} onChange={(e:any)=>updateBank(account.id,'label',e.target.value)}/></Field><Field label={t('Bank Name','اسم البنك')}><Input value={account.bankName} onChange={(e:any)=>updateBank(account.id,'bankName',e.target.value)}/></Field><Field label={t('Account Name','اسم الحساب')}><Input value={account.accountName} onChange={(e:any)=>updateBank(account.id,'accountName',e.target.value)}/></Field><Field label="IBAN"><Input value={account.iban} onChange={(e:any)=>updateBank(account.id,'iban',e.target.value)}/></Field><Field label="SWIFT / BIC"><Input value={account.swift} onChange={(e:any)=>updateBank(account.id,'swift',e.target.value)}/></Field><Field label={t('Currency','العملة')}><Input value={account.currency} onChange={(e:any)=>updateBank(account.id,'currency',e.target.value.toUpperCase())}/></Field></div></article>)}</div>:<p className="commercial-empty-note">{t('No alternate bank accounts. The primary bank remains the default option.','لا توجد حسابات بنكية إضافية. يبقى البنك الرئيسي هو الخيار الافتراضي.')}</p>}
    </section>

    <section className="settings-section commercial-settings-section">
      <div className="commercial-section-heading"><div><h4>{t('Tax presets','إعدادات الضريبة')}</h4><p>{t('Save the rates you actually use. LOUREX never assumes a jurisdiction or tax rate for you.','احفظ فقط النسب التي تستخدمها فعليًا. لا يفترض LOUREX دولة أو نسبة ضريبية من تلقاء نفسه.')}</p></div><Button icon="plus" onClick={addTax}>{t('Add Tax','إضافة ضريبة')}</Button></div>
      <Field label={t('Default tax for new documents','الضريبة الافتراضية للمستندات الجديدة')}><Select value={commercial.defaultTaxPresetId} onChange={(e:any)=>updateCommercial({defaultTaxPresetId:e.target.value})}><option value="">{t('No default tax','بدون ضريبة افتراضية')}</option>{commercial.taxPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.name} · {preset.rate}%</option>)}</Select></Field>
      {commercial.taxPresets.length?<div className="commercial-row-list compact">{commercial.taxPresets.map(preset=><article className="commercial-row-card preset-row" key={preset.id}><div className="form-grid two"><Field label={t('Tax name','اسم الضريبة')}><Input value={preset.name} onChange={(e:any)=>updateTax(preset.id,'name',e.target.value)}/></Field><Field label={t('Rate %','النسبة %')}><Input inputMode="decimal" value={preset.rate} onChange={(e:any)=>updateTax(preset.id,'rate',e.target.value)}/></Field></div><IconButton icon="trash" label={t('Remove tax preset','حذف إعداد الضريبة')} variant="danger" onClick={()=>removeTax(preset.id)}/></article>)}</div>:null}
    </section>

    <section className="settings-section commercial-settings-section">
      <div className="commercial-section-heading"><div><h4>{t('Payment terms','شروط الدفع')}</h4><p>{t('Preset days automatically calculate invoice due dates. Customer-specific terms can override the company default.','تقوم الأيام المحفوظة بحساب تاريخ استحقاق الفاتورة تلقائيًا، ويمكن لشروط العميل أن تتجاوز الإعداد الافتراضي للشركة.')}</p></div><Button icon="plus" onClick={addTerm}>{t('Add Term','إضافة شرط')}</Button></div>
      <Field label={t('Default payment term','شرط الدفع الافتراضي')}><Select value={commercial.defaultPaymentTermPresetId} onChange={(e:any)=>updateCommercial({defaultPaymentTermPresetId:e.target.value})}><option value="">{t('Use free-text default / none','استخدم النص الافتراضي / بدون')}</option>{commercial.paymentTermPresets.map(preset=><option key={preset.id} value={preset.id}>{preset.label} · {preset.days} {t('days','يوم')}</option>)}</Select></Field>
      <div className="commercial-row-list compact">{commercial.paymentTermPresets.map(preset=><article className="commercial-row-card preset-row" key={preset.id}><div className="form-grid two"><Field label={t('Term label','اسم الشرط')}><Input value={preset.label} onChange={(e:any)=>updateTerm(preset.id,'label',e.target.value)}/></Field><Field label={t('Due in days','الاستحقاق بعد أيام')}><Input type="number" min="0" max="3650" step="1" value={String(preset.days)} onChange={(e:any)=>updateTerm(preset.id,'days',Math.min(3650,Math.max(0,Math.trunc(Number(e.target.value)||0))))}/></Field></div><IconButton icon="trash" label={t('Remove payment term','حذف شرط الدفع')} variant="danger" onClick={()=>removeTerm(preset.id)}/></article>)}</div>
    </section>

    <section className="settings-section commercial-settings-section">
      <div className="commercial-section-heading"><div><h4>{t('Pricing policy','سياسة التسعير')}</h4><p>{t('Internal pricing suggestions use saved item cost only. Suggested prices are never applied automatically.','اقتراحات التسعير داخلية وتعتمد فقط على تكلفة الصنف المحفوظة، ولا يتم تطبيق أي سعر تلقائيًا.')}</p></div></div>
      <div className="form-grid three commercial-pricing-grid"><Field label={t('Method','الطريقة')}><Select value={commercial.pricing.method} onChange={(e:any)=>updatePricing({method:e.target.value as PricingPolicy['method']})}><option value="markup">{t('Markup on cost','زيادة على التكلفة')}</option><option value="margin">{t('Target gross margin','هامش ربح إجمالي مستهدف')}</option></Select></Field><Field label={commercial.pricing.method==='margin'?t('Target margin %','الهامش المستهدف %'):t('Markup %','نسبة الزيادة %')}><Input inputMode="decimal" value={commercial.pricing.percent} onChange={(e:any)=>updatePricing({percent:e.target.value})}/></Field><Field label={t('Round price up to','تقريب السعر للأعلى إلى')}><Select value={commercial.pricing.rounding} onChange={(e:any)=>updatePricing({rounding:e.target.value})}><option value="0.01">0.01</option><option value="0.05">0.05</option><option value="0.10">0.10</option><option value="0.50">0.50</option><option value="1.00">1.00</option></Select></Field></div>
    </section>
  </div>;
}
