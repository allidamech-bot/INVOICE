import type { CompanySettings } from '../types.js';
import { isSaudiVatNumber } from '../lib/fiscal-issuer.js';
import { t } from '../lib/i18n.js';
import {fiscalQaClientEnabled} from '../lib/fiscal-qa-client.js';
import {FiscalQaWorkspacePanel} from './FiscalQaWorkspacePanel.js';
import {FiscalProductionProfilePanel} from './FiscalProductionProfilePanel.js';

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
      <p><strong>{t('Company-specific registration','تسجيل مستقل لكل منشأة')}</strong></p><p>{workspaceId?t('Activation and readiness are checked for each company below.','يُتحقق من التفعيل والجاهزية لكل منشأة أدناه.'):t('Official issuance is not available yet','الإصدار الرسمي غير متاح للتفعيل حاليًا')}</p>
      <p className="commercial-empty-note">{t('Commercial documents remain available where legally permitted. Official registration requires separate verification, a secure invoicing unit and certificates. The server confirms issuance readiness for each company.','تبقى المستندات التجارية متاحة حيث يسمح النظام بذلك. يتطلب التسجيل الرسمي تحققًا مستقلًا ووحدة فوترة آمنة وشهادات. يؤكد الخادم جاهزية الإصدار لكل منشأة.')}</p>
      {showSaudiChecks?<div><strong>{t('Company profile completeness','اكتمال بيانات ملف المنشأة')}</strong><ul>{fiscalProfileFieldChecks(company).map(item=><li key={item.key}>{item.label}: <strong>{item.present?t('Entered / format valid','موجود / الصيغة صحيحة'):t('Needs review','يحتاج مراجعة')}</strong></li>)}</ul><p className="commercial-empty-note">{t('These are local field checks only, not registration, eligibility or certificate verification. Edit the original identity fields in Account → Company profile.','هذه مراجعة محلية للحقول فقط، وليست تحققًا من التسجيل أو الأهلية أو الشهادة. عدّل البيانات الأصلية من الحساب ← ملف الشركة.')}</p></div>:null}
      {showSaudiChecks&&workspaceId?<FiscalProductionProfilePanel key={workspaceId} workspaceId={workspaceId} commercialRegistration={company.commercialRegistration}/>:null}
    </article>
    {showSaudiChecks&&workspaceId&&fiscalQaClientEnabled()?<FiscalQaWorkspacePanel key={workspaceId} workspaceId={workspaceId}/>:null}
  </section>;
}
