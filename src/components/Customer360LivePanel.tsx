import type { Customer } from '../types.js';
import type { Customer360Snapshot } from '../lib/relationship-360.js';
import { buildCustomer360 } from '../lib/relationship-360.js';
import { ensureRelationship360Styles } from '../lib/relationship-360-style.js';
import { registerAssistantEntity } from '../lib/ai-assistant-foundation.js';
import { resumeVaultSession } from '../storage/vault.js';
import { t } from '../lib/i18n.js';
import { Customer360Panel } from './Relationship360Panels.js';
import { CustomerSharesPanel } from './CustomerSharesPanel.js';
import { EntityAuditLivePanel } from './EntityAuditLivePanel.js';

export function Customer360LivePanel({customer}:{customer:Customer}):any{
  const [snapshot,setSnapshot]=React.useState<Customer360Snapshot|null>(null);
  const [error,setError]=React.useState('');
  React.useEffect(()=>{
    ensureRelationship360Styles();
    registerAssistantEntity('customers',{type:'customer',id:customer.id,label:(customer.companyNameEn||customer.companyNameAr||customer.contactPerson||'Customer').trim()});
    let active=true;
    setSnapshot(null);setError('');
    void resumeVaultSession().then(session=>{
      if(!active)return;
      if(!session){setError(t('Customer 360 is unavailable while the encrypted vault is locked.','ملف العميل 360 غير متاح أثناء قفل الخزنة المشفرة.'));return;}
      setSnapshot(buildCustomer360(customer,session.vault.documents,session.vault.payments,session.vault.documentEvents));
    }).catch(()=>{if(active)setError(t('Unable to load Customer 360 safely.','تعذر تحميل ملف العميل 360 بأمان.'));});
    return()=>{active=false;registerAssistantEntity('customers',null);};
  },[customer.id,customer.updatedAt]);
  if(error)return <section className="lx-360-load-state is-error" role="status">{error}</section>;
  if(!snapshot)return <section className="lx-360-load-state" role="status">{t('Preparing Customer 360…','جارٍ تجهيز ملف العميل 360…')}</section>;
  return <><Customer360Panel snapshot={snapshot}/><details className="lx-360-card lx-360-disclosure"><summary>{t('Shared documents & audit history','المستندات المشتركة وسجل التدقيق')}</summary><CustomerSharesPanel customer={customer}/><EntityAuditLivePanel entityType="customer" entityId={customer.id} title={t('Customer activity','نشاط العميل')}/></details></>;
}
