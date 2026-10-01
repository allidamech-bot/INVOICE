import type { DocumentEventRecord } from '../types.js';
import type { AuditEntityType } from '../lib/audit-trail.js';
import { auditAction, auditActionLabel, auditEntityLabel, auditEntityLabelText, auditEventsFor } from '../lib/audit-trail.js';
import { displayDate } from '../lib/id.js';
import { getUiLanguage, isArabic, t } from '../lib/i18n.js';

interface Props {events:DocumentEventRecord[];entityType:AuditEntityType;entityId:string;title?:string;limit?:number;compact?:boolean;}

export function AuditTimeline({events,entityType,entityId,title,limit=20,compact=false}:Props):any{
  const rows=auditEventsFor(events,entityType,entityId,limit),arabic=isArabic();
  return <section className={`lx-audit-timeline${compact?' is-compact':''}`} aria-label={title||t('Audit trail','سجل التدقيق')}>
    <header><div><small>{auditEntityLabelText(entityType,arabic)}</small><h3>{title||t('Audit trail','سجل التدقيق')}</h3></div><span>{rows.length}</span></header>
    {rows.length?<div className="lx-audit-list">{rows.map(event=><article key={event.id} className="lx-audit-row"><span className="lx-audit-dot" aria-hidden="true"/><div><strong>{auditActionLabel(auditAction(event),arabic)}</strong><small>{displayDate(event.at.slice(0,10),getUiLanguage())}{auditEntityLabel(event)?` · ${auditEntityLabel(event)}`:''}</small>{event.note?<p>{event.note}</p>:null}</div></article>)}</div>:<p className="lx-audit-empty">{t('No audited changes have been recorded for this record yet.','لم يتم تسجيل تغييرات مدققة لهذا السجل حتى الآن.')}</p>}
  </section>;
}
