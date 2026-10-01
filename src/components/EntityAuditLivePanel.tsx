import type { AuditEntityType } from '../lib/audit-trail.js';
import type { DocumentEventRecord } from '../types.js';
import { resumeVaultSession } from '../storage/vault.js';
import { AuditTimeline } from './AuditTimeline.js';

export function EntityAuditLivePanel({entityType,entityId,title}:{entityType:AuditEntityType;entityId:string;title?:string}):any{
  const [events,setEvents]=React.useState<DocumentEventRecord[]>([]);
  React.useEffect(()=>{let active=true;if(!entityId){setEvents([]);return()=>{active=false;};}void resumeVaultSession().then(session=>{if(active)setEvents(session?.vault.documentEvents??[]);}).catch(()=>{if(active)setEvents([]);});return()=>{active=false;};},[entityType,entityId]);
  return <AuditTimeline events={events} entityType={entityType} entityId={entityId} title={title} compact/>;
}
