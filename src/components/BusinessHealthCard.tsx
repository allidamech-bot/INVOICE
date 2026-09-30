import type { BusinessHealthIssue, BusinessHealthSnapshot, BusinessHealthTarget } from '../lib/business-health.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { Icon } from './UI.js';

interface Props{
  snapshot:BusinessHealthSnapshot;
  onTarget:(target:BusinessHealthTarget)=>void;
}

function issueIcon(issue:BusinessHealthIssue):string{
  if(issue.area==='customers')return'users';
  if(issue.area==='products'||issue.area==='suppliers'||issue.area==='purchasing')return'items';
  return'edit';
}

function issueLabel(issue:BusinessHealthIssue):string{return getUiLanguage()==='ar'?issue.labelAr:issue.labelEn;}
function issueDetail(issue:BusinessHealthIssue):string{return getUiLanguage()==='ar'?issue.detailAr:issue.detailEn;}

export function BusinessHealthCard({snapshot,onTarget}:Props):any{
  const ready=snapshot.status==='ready';
  const visible=snapshot.issues.slice(0,5);
  return <section className="ta-dashboard-card ta-attention-card ta-business-health-card" aria-label={t('Business Health','جاهزية الأعمال')}>
    <header className="ta-card-header">
      <div>
        <small>{t('Business Health','جاهزية الأعمال')}</small>
        <h2>{ready?t('Data and setup look ready','البيانات والإعدادات تبدو جاهزة'):t('Review data and setup quality','راجع جودة البيانات والإعدادات')}</h2>
        <span>{ready?t('No deterministic data-quality exceptions were found.','لم يتم العثور على استثناءات حتمية في جودة البيانات.'):t(`${snapshot.issueCount} records or setup points need review`,`${snapshot.issueCount} سجلات أو نقاط إعداد تحتاج مراجعة`)}</span>
      </div>
    </header>
    {ready?<div className="ta-clear-state"><span>✓</span><strong>{t('Business data is ready','بيانات الأعمال جاهزة')}</strong><small>{t('LOUREX will keep checking deterministic completeness without changing records automatically.','سيستمر LOUREX بفحص الاكتمال بشكل حتمي دون تعديل السجلات تلقائيًا.')}</small></div>:<>
      <div className="ta-attention-list">
        {visible.map(row=><button type="button" key={row.id} className={row.severity==='warning'?'is-danger':''} onClick={()=>onTarget(row.target)} title={issueDetail(row)}>
          <span><Icon name={issueIcon(row) as any}/><b>{issueLabel(row)}</b></span><strong>{row.count}</strong>
        </button>)}
      </div>
      {snapshot.issues.length>visible.length?<p className="field-hint">{t(`${snapshot.issues.length-visible.length} more quality checks need review in their original workspaces.`,`${snapshot.issues.length-visible.length} فحوص جودة إضافية تحتاج مراجعة في أقسامها الأصلية.`)}</p>:null}
    </>}
  </section>;
}
