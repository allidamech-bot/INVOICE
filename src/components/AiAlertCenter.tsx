import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { todayIso } from '../lib/id.js';
import { financialReportByCurrency } from '../lib/reports.js';
import { receivablesByCurrency } from '../lib/receivables.js';
import { formatMoney } from '../lib/money.js';
import { resumeVaultSession } from '../storage/vault.js';
import { Icon } from './UI.js';

export type AiAlertTarget='documents'|'customers'|'receivables'|'reports'|'items'|'operations';
type AlertTone='info'|'good'|'warn'|'danger';
interface AlertItem{id:string;tone:AlertTone;title:string;detail:string;metric:string;target:AiAlertTarget;}
interface Props{language:UiLanguage;onNavigate:(screen:AiAlertTarget)=>void;}
interface State{open:boolean;busy:boolean;error:string;items:AlertItem[];updatedAt:number;}

function monthStart(today:string):string{return `${today.slice(0,7)}-01`;}
function relativeUpdated(at:number,language:UiLanguage):string{
  if(!at)return'';
  const minutes=Math.max(0,Math.round((Date.now()-at)/60000));
  if(minutes<1)return language==='ar'?'الآن':'Now';
  if(minutes<60)return language==='ar'?`منذ ${minutes} د`:`${minutes}m ago`;
  const hours=Math.round(minutes/60);
  return language==='ar'?`منذ ${hours} س`:`${hours}h ago`;
}

export class AiAlertCenter extends React.Component<Props,State>{
  state:State={open:false,busy:false,error:'',items:[],updatedAt:0};
  private mounted=false;
  private visibilityHandler=()=>{if(document.visibilityState==='visible'&&Date.now()-this.state.updatedAt>5*60_000)void this.refresh(false);};

  componentDidMount():void{
    this.mounted=true;
    document.addEventListener('visibilitychange',this.visibilityHandler);
    window.setTimeout(()=>void this.refresh(false),650);
  }
  componentWillUnmount():void{
    this.mounted=false;
    document.removeEventListener('visibilitychange',this.visibilityHandler);
  }

  private refresh=async(showBusy=true)=>{
    if(this.state.busy)return;
    if(showBusy)this.setState({busy:true,error:''});
    try{
      const resumed=await resumeVaultSession();
      if(!resumed)throw new Error(t('Unlock LOUREX to load smart alerts.','افتح قفل LOUREX لتحميل التنبيهات الذكية.'));
      const vault=resumed.vault;
      const today=todayIso();
      const items:AlertItem[]=[];
      const receivables=receivablesByCurrency(vault.documents,vault.payments,today);
      const overdueRows=receivables.filter(row=>Number(row.overdue)>0).sort((a,b)=>Number(b.overdue)-Number(a.overdue));
      const overdueInvoices=receivables.reduce((sum,row)=>sum+row.overdueInvoices,0);
      if(overdueInvoices){
        const metric=overdueRows.slice(0,2).map(row=>formatMoney(row.overdue,row.currency)).join(' · ');
        items.push({id:'overdue',tone:'danger',title:t('Collection needs attention','التحصيل يحتاج انتباهك'),detail:t(`${overdueInvoices} overdue invoices should be reviewed.`,`${overdueInvoices} فواتير متأخرة تحتاج مراجعة.`),metric,target:'receivables'});
      }

      const draftDocs=vault.documents.filter(doc=>doc.status==='draft').length;
      if(draftDocs)items.push({id:'drafts',tone:'warn',title:t('Documents still in progress','مستندات ما زالت قيد العمل'),detail:t('Finish or review open drafts before they are forgotten.','أكمل أو راجع المسودات المفتوحة قبل أن تُنسى.'),metric:String(draftDocs),target:'documents'});

      const draftPurchases=vault.purchases.filter(purchase=>purchase.status==='draft').length;
      if(draftPurchases)items.push({id:'purchases',tone:'warn',title:t('Purchase drafts waiting','مسودات مشتريات بانتظارك'),detail:t('Supplier purchases have not been posted yet.','هناك مشتريات موردين لم يتم ترحيلها بعد.'),metric:String(draftPurchases),target:'operations'});

      const missingCost=vault.savedItems.filter(item=>!String(item.lastUnitCost||'').trim()).length;
      if(missingCost)items.push({id:'costs',tone:'info',title:t('Profit data can be improved','يمكن تحسين بيانات الربح'),detail:t('Some products are missing a recorded unit cost.','بعض المنتجات لا تحتوي على تكلفة وحدة مسجلة.'),metric:String(missingCost),target:'items'});

      const monthly=financialReportByCurrency(vault.documents,vault.payments,monthStart(today),today).filter(row=>Number(row.netSales)!==0||Number(row.collected)!==0);
      if(monthly.length){
        const lead=[...monthly].sort((a,b)=>Math.abs(Number(b.netSales))-Math.abs(Number(a.netSales)))[0]!;
        items.push({id:'sales',tone:'good',title:t('Month-to-date activity','نشاط الشهر حتى الآن'),detail:t('Net issued sales are being tracked automatically.','تتم متابعة صافي المبيعات الصادرة تلقائيًا.'),metric:formatMoney(lead.netSales,lead.currency),target:'reports'});
      }

      const latest=[...vault.documents].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
      if(latest)items.push({id:'latest',tone:'info',title:t('Latest document activity','آخر نشاط على المستندات'),detail:`${latest.number} · ${latest.status==='final'?t('Issued','صادر'):t('Draft','مسودة')}`,metric:'',target:'documents'});

      if(!items.length)items.push({id:'clear',tone:'good',title:t('No urgent exceptions','لا توجد استثناءات عاجلة'),detail:t('LOUREX did not find anything that needs immediate attention.','لم يجد LOUREX شيئًا يحتاج تدخلاً فوريًا.'),metric:'✓',target:'reports'});
      if(this.mounted)this.setState({items:items.slice(0,6),busy:false,error:'',updatedAt:Date.now()});
    }catch(error){
      if(this.mounted)this.setState({busy:false,error:error instanceof Error?error.message:t('Unable to load smart alerts.','تعذر تحميل التنبيهات الذكية.')});
    }
  };

  private toggle=()=>{
    this.setState(state=>({open:!state.open}),()=>{
      if(this.state.open&&(!this.state.updatedAt||Date.now()-this.state.updatedAt>60_000))void this.refresh(true);
    });
  };

  private openItem=(item:AlertItem)=>{
    this.setState({open:false});
    this.props.onNavigate(item.target);
  };

  render():any{
    const actionable=this.state.items.filter(item=>item.id!=='clear').length;
    return <div className={`ai-alert-center ${this.state.open?'open':''}`} dir={this.props.language==='ar'?'rtl':'ltr'}>
      <button type="button" className="ai-alert-trigger" aria-haspopup="dialog" aria-expanded={this.state.open} aria-label={t('LOUREX smart alerts','تنبيهات LOUREX الذكية')} onClick={this.toggle}>
        <span className="ai-alert-trigger-core"><Icon name="spark"/></span>
        {actionable?<b className="ai-alert-badge">{Math.min(9,actionable)}</b>:null}
      </button>
      {this.state.open?<section className="ai-alert-popover" role="dialog" aria-label={t('LOUREX activity & alerts','نشاط وتنبيهات LOUREX')}>
        <header className="ai-alert-head">
          <div><small>{t('LOUREX Intelligence','ذكاء LOUREX')}</small><strong>{t('Activity & smart alerts','النشاط والتنبيهات الذكية')}</strong><span>{t('What changed and what deserves your attention.','ما الذي تغيّر وما الذي يستحق انتباهك.')}</span></div>
          <button type="button" className="ai-alert-refresh" disabled={this.state.busy} onClick={()=>void this.refresh(true)}><Icon name="refresh"/></button>
        </header>
        {this.state.error?<div className="ai-alert-error" role="alert">{this.state.error}</div>:null}
        <div className="ai-alert-list">
          {this.state.busy&&!this.state.items.length?<div className="ai-alert-loading"><span/><span/><span/></div>:this.state.items.map(item=><button type="button" key={item.id} className={`ai-alert-item tone-${item.tone}`} onClick={()=>this.openItem(item)}>
            <span className="ai-alert-item-dot"/>
            <span className="ai-alert-item-copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
            {item.metric?<b className="ai-alert-item-metric">{item.metric}</b>:<span className="ai-alert-item-arrow">→</span>}
          </button>)}
        </div>
        <footer className="ai-alert-foot"><span className="ai-alert-live-dot"/><span>{t('Updated','آخر تحديث')} {relativeUpdated(this.state.updatedAt,this.props.language)}</span></footer>
      </section>:null}
    </div>;
  }
}
