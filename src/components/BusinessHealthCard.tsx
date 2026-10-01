import type { BusinessHealthIssue, BusinessHealthSnapshot, BusinessHealthTarget } from '../lib/business-health.js';
import { buildBusinessHealth } from '../lib/business-health.js';
import type { SetupReadinessCheck } from '../lib/setup-readiness.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { resumeVaultSession } from '../storage/vault.js';
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
function readinessIcon(row:SetupReadinessCheck):string{return row.target==='items'?'items':row.target==='data'?'backup':'edit';}
function issueLabel(issue:BusinessHealthIssue):string{return getUiLanguage()==='ar'?issue.labelAr:issue.labelEn;}
function issueDetail(issue:BusinessHealthIssue):string{return getUiLanguage()==='ar'?issue.detailAr:issue.detailEn;}
function readinessLabel(row:SetupReadinessCheck):string{return getUiLanguage()==='ar'?row.labelAr:row.labelEn;}
function readinessDetail(row:SetupReadinessCheck):string{return getUiLanguage()==='ar'?row.detailAr:row.detailEn;}

function openCanonicalSettings():void{
  try{sessionStorage.setItem('lourex-settings-scope','settings');}catch{}
  const settingsButton=document.querySelector<HTMLButtonElement>('.ta-sidebar-footer .ta-sidebar-utility');
  settingsButton?.click();
}

function routeToCanonicalTarget(target:BusinessHealthTarget):void{
  if(target==='settings'){openCanonicalSettings();return;}
  window.dispatchEvent(new CustomEvent('lourex-global-action',{detail:{action:'navigate',target}}));
}

export function BusinessHealthCard({snapshot,onTarget}:Props):any{
  const visible=snapshot.issues.slice(0,5);
  const readinessReview=snapshot.readiness.checks.filter(row=>row.status!=='complete').slice(0,3);
  const arabic=getUiLanguage()==='ar';
  const coreReady=snapshot.status==='ready'&&snapshot.readiness.attention===0;
  const settingsTarget=(target:SetupReadinessCheck['target']):BusinessHealthTarget=>target==='items'?'items':'settings';
  return <section className="ta-dashboard-card ta-attention-card ta-business-health-card" dir={arabic?'rtl':'ltr'} style={{textAlign:arabic?'right':'left'}} aria-label={t('Business Health','جاهزية الأعمال')}>
    <header className="ta-card-header">
      <div>
        <small>{t('Business Health','جاهزية الأعمال')}</small>
        <h2>{coreReady?t('Core data and setup are ready','البيانات والإعدادات الأساسية جاهزة'):t('Review data and setup quality','راجع جودة البيانات والإعدادات')}</h2>
        <span>{snapshot.issueCount?t(`${snapshot.issueCount} data exceptions · ${snapshot.readiness.attention} setup items need attention`,`${snapshot.issueCount} استثناءات بيانات · ${snapshot.readiness.attention} عناصر إعداد تحتاج انتباه`):snapshot.readiness.attention?t(`${snapshot.readiness.attention} setup items need attention`,`${snapshot.readiness.attention} عناصر إعداد تحتاج انتباه`):t('No deterministic data exceptions. Review-only setup checks stay visible below.','لا توجد استثناءات بيانات حتمية. تبقى فحوص الإعداد التي تحتاج مراجعة ظاهرة أدناه.')}</span>
      </div>
    </header>

    {snapshot.issueCount?<>
      <div className="ta-attention-list" aria-label={t('Data quality issues','مشاكل جودة البيانات')}>
        {visible.map(row=><button type="button" key={row.id} className={row.severity==='warning'?'is-danger':''} onClick={()=>onTarget(row.target)} title={issueDetail(row)} style={{textAlign:arabic?'right':'left'}}>
          <span><Icon name={issueIcon(row) as any}/><b>{issueLabel(row)}</b></span><strong>{row.count}</strong>
        </button>)}
      </div>
      {snapshot.issues.length>visible.length?<p className="field-hint">{t(`${snapshot.issues.length-visible.length} more quality checks need review in their original workspaces.`,`${snapshot.issues.length-visible.length} فحوص جودة إضافية تحتاج مراجعة في أقسامها الأصلية.`)}</p>:null}
    </>:<div className="ta-clear-state"><span>✓</span><strong>{t('No deterministic data-quality exceptions','لا توجد استثناءات حتمية في جودة البيانات')}</strong><small>{t('LOUREX does not change or merge records automatically.','لا يغير LOUREX السجلات أو يدمجها تلقائيًا.')}</small></div>}

    <div className="ta-business-readiness" aria-label={t('Setup readiness','جاهزية الإعداد')}>
      <div className="ta-business-readiness-summary">
        <strong>{t('Setup readiness','جاهزية الإعداد')}</strong>
        <span className="ta-readiness-count is-complete">{t(`${snapshot.readiness.complete} complete`,`${snapshot.readiness.complete} مكتمل`)}</span>
        <span className={`ta-readiness-count ${snapshot.readiness.attention?'is-attention':''}`}>{t(`${snapshot.readiness.attention} needs attention`,`${snapshot.readiness.attention} يحتاج انتباه`)}</span>
        <span className="ta-readiness-count is-review">{t(`${snapshot.readiness.review} review`,`${snapshot.readiness.review} للمراجعة`)}</span>
      </div>
      {readinessReview.length?<div className="ta-attention-list ta-readiness-list">
        {readinessReview.map(row=><button type="button" key={row.id} className={row.status==='attention'?'is-danger':''} onClick={()=>onTarget(settingsTarget(row.target))} title={readinessDetail(row)} style={{textAlign:arabic?'right':'left'}}>
          <span><Icon name={readinessIcon(row) as any}/><b>{readinessLabel(row)}</b></span><strong>{row.status==='attention'?t('Fix','إصلاح'):t('Review','مراجعة')}</strong>
        </button>)}
      </div>:<div className="ta-clear-state ta-readiness-clear"><span>✓</span><strong>{t('Core setup is complete','الإعداد الأساسي مكتمل')}</strong></div>}
      {snapshot.readiness.checks.filter(row=>row.status!=='complete').length>readinessReview.length?<p className="field-hint">{t('Additional review-only checks remain available through their canonical settings and data controls.','توجد فحوص مراجعة إضافية ويمكن الوصول إليها من الإعدادات وعناصر البيانات الأصلية.')}</p>:null}
    </div>
  </section>;
}

export function BusinessHealthLiveCard():any{
  const [snapshot,setSnapshot]=React.useState<BusinessHealthSnapshot|null>(null);
  React.useEffect(()=>{
    let active=true;
    void resumeVaultSession().then(resumed=>{
      if(active&&resumed)setSnapshot(buildBusinessHealth(resumed.vault));
    }).catch(()=>{});
    return()=>{active=false;};
  },[]);
  if(!snapshot)return null;
  return <BusinessHealthCard snapshot={snapshot} onTarget={routeToCanonicalTarget}/>;
}
