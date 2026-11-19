import type { CompanySettings } from '../types.js';
import { isSaudiVatNumber } from '../lib/fiscal-issuer.js';
import { t } from '../lib/i18n.js';
import {fiscalQaClientEnabled} from '../lib/fiscal-qa-client.js';
import {FiscalQaWorkspacePanel} from './FiscalQaWorkspacePanel.js';

type FiscalCompanyFields = Pick<CompanySettings,'country'|'nameAr'|'vatNumber'|'commercialRegistration'|'addressAr'|'city'>;
const clean=(value:unknown)=>typeof value==='string'?value.trim():'';

/** Presence checks only; a free-text country or VAT number never determines legal applicability. */
export function fiscalProfileFieldChecks(company:FiscalCompanyFields){
  return [
    {key:'country',label:t('Country','الدولة'),present:Boolean(clean(company.country))},
    {key:'legalName',label:t('Arabic company name','اسم المنشأة بالعربية'),present:Boolean(clean(company.nameAr))},
    {key:'vat',label:t('Saudi VAT number format','صيغة الرقم الضريبي السعودي'),present:isSaudiVatNumber(clean(company.vatNumber))},
    {key:'registration',label:t('Commercial registration','السجل التجاري'),present:Boolean(clean(company.commercialRegistration))},
    {key:'address',label:t('Arabic address and city','العنوان العربي والمدينة'),present:Boolean(clean(company.addressAr)&&clean(company.city))}
  ];
}

/** Read-only readiness panel until authenticated fiscal services are available. */
export function FiscalComplianceSettings({company,workspaceId}:{company:FiscalCompanyFields;workspaceId?:string}):any{
  const country=clean(company.country).toLowerCase();
  const showSaudiChecks=['sa','sau','saudi arabia','kingdom of saudi arabia','السعودية','المملكة العربية السعودية'].includes(country)||isSaudiVatNumber(clean(company.vatNumber));
  return <section className="settings-section commercial-settings-section" aria-label={t('Tax compliance','الامتثال الضريبي')}>
    <div className="commercial-section-heading"><div><h4>{t('Tax compliance','الامتثال الضريبي')}</h4><p>{t('Government e-invoicing is separate from commercial tax presets.','الفوترة الإلكترونية الحكومية مستقلة عن إعدادات الضريبة التجارية.')}</p></div></div>
    <article className="commercial-row-card">
      <header><strong>{t('Saudi e-invoicing · ZATCA','الفوترة الإلكترونية السعودية · ZATCA')}</strong></header>
      <p><strong>{t('Not available yet','غير متاح للتفعيل حاليًا')}</strong></p>
      <p className="commercial-empty-note">{t('Commercial documents remain available. Saudi applicability and activation require separate verification; no government submissions are enabled in this build.','تبقى المستندات التجارية متاحة. يتطلب تحديد الخضوع للنظام السعودي وتفعيله تحققًا مستقلًا؛ لا يتيح هذا الإصدار الإرسال إلى الهيئة.')}</p>
      {showSaudiChecks?<div><strong>{t('Company profile completeness','اكتمال بيانات ملف المنشأة')}</strong><ul>{fiscalProfileFieldChecks(company).map(item=><li key={item.key}>{item.label}: <strong>{item.present?t('Entered / format valid','موجود / الصيغة صحيحة'):t('Needs review','يحتاج مراجعة')}</strong></li>)}</ul><p className="commercial-empty-note">{t('These are local field checks only, not registration, eligibility or certificate verification. Edit the original identity fields in Account → Company profile.','هذه مراجعة محلية للحقول فقط، وليست تحققًا من التسجيل أو الأهلية أو الشهادة. عدّل البيانات الأصلية من الحساب ← ملف الشركة.')}</p></div>:null}
    </article>
    {showSaudiChecks&&workspaceId&&fiscalQaClientEnabled()?<FiscalQaWorkspacePanel key={workspaceId} workspaceId={workspaceId}/>:null}
  </section>;
}
