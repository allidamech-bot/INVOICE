import type { DocumentEventRecord } from '../types.js';
import { auditAction, auditActionLabel, auditEntityLabel, auditEntityLabelText, auditEntityType, auditEventsGlobal, type AuditEntityType } from '../lib/audit-trail.js';
import { displayDate } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';
import { Button, Modal, Select } from './UI.js';

interface Props {open:boolean;events:DocumentEventRecord[];onClose:()=>void;}

type Filter='all'|AuditEntityType;

export function ActivityLogModal({open,events,onClose}:Props):any{
  const [filter,setFilter]=React.useState<Filter>('all');
  React.useEffect(()=>{if(!open)setFilter('all');},[open]);
  const arabic=isArabic(),rows=auditEventsGlobal(events,250).filter(event=>filter==='all'||auditEntityType(event)===filter);
  return <Modal open={open} title={t('Activity Log','سجل النشاط')} size="lg" onClose={onClose} footer={<div className="modal-footer-actions"><Button onClick={onClose}>{t('Close','إغلاق')}</Button></div>}>
    <div className="lx-activity-log">
      <div className="lx-activity-log-head"><div><strong>{t('Audited workspace changes','تغييرات مساحة العمل المدققة')}</strong><span>{t('Immutable activity evidence stored inside the encrypted LOUREX vault.','أدلة نشاط غير قابلة للتعديل محفوظة داخل خزنة LOUREX المشفرة.')}</span></div><label><span>{t('Filter','تصفية')}</span><Select value={filter} onChange={(event:any)=>setFilter(event.target.value)}><option value="all">{t('All activity','كل النشاط')}</option><option value="customer">{t('Customers','العملاء')}</option><option value="supplier">{t('Suppliers','الموردون')}</option><option value="product">{t('Products','الأصناف')}</option><option value="purchase">{t('Purchases','المشتريات')}</option><option value="document">{t('Documents','المستندات')}</option></Select></label></div>
      {rows.length?<div className="lx-activity-log-list">{rows.map(event=>{const type=auditEntityType(event);return <article key={event.id}><span className="lx-audit-dot" aria-hidden="true"/><div><strong>{auditActionLabel(auditAction(event),arabic)} · {auditEntityLabelText(type,arabic)}</strong><small>{displayDate(event.at.slice(0,10),getUiLanguage())}{auditEntityLabel(event)?` · ${auditEntityLabel(event)}`:''}</small>{event.note?<p>{event.note}</p>:null}</div></article>;})}</div>:<p className="lx-audit-empty">{t('No audited activity matches this filter yet.','لا يوجد نشاط مدقق يطابق هذه التصفية حتى الآن.')}</p>}
    </div>
  </Modal>;
}
