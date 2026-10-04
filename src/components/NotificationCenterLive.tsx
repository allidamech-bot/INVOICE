import type { UiLanguage } from '../types.js';
import { getUiLanguage, t } from '../lib/i18n.js';
import { todayIso } from '../lib/id.js';
import { buildNotificationCenter, validatedNotificationStateEvent, type NotificationCenterSnapshot, type NotificationItem, type NotificationTarget } from '../lib/notification-center.js';
import { scopeVault } from '../lib/workspaces.js';
import { ensureNotificationCenterStyles } from '../lib/notification-center-style.js';
import { resumeVaultSession } from '../storage/vault.js';
import { mutateVaultSafely } from '../storage/vault-mutation-bridge.js';
import { Button, Icon, Modal } from './UI.js';

export type NotificationCenterTab='active'|'snoozed'|'done';
export type NotificationCenterScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';

interface Props{
  language:UiLanguage;
  screen:NotificationCenterScreen;
  renderHomeSummary?:boolean;
  onNavigate:(target:NotificationTarget)=>void;
  onCount:(count:number,high:number)=>void;
}
interface State{
  open:boolean;
  loading:boolean;
  busyKey:string;
  snoozeKey:string;
  tab:NotificationCenterTab;
  error:string;
  snapshot:NotificationCenterSnapshot|null;
}

const OPEN_EVENT='lourex-notification-center-open';

function shiftDate(iso:string,days:number):string{
  const [year,month,day]=iso.split('-').map(Number);
  const date=new Date(Date.UTC(year!,month!-1,day!+days));
  return date.toISOString().slice(0,10);
}
function label(item:NotificationItem,language:UiLanguage):{title:string;detail:string}{return language==='ar'?{title:item.titleAr,detail:item.detailAr}:{title:item.titleEn,detail:item.detailEn};}
function targetLabel(target:NotificationTarget):string{
  if(target==='receivables')return t('Open Finance','فتح المالية');
  if(target==='documents')return t('Open Documents','فتح المستندات');
  if(target==='operations')return t('Open Purchasing','فتح المشتريات');
  return t('Open Products','فتح المنتجات');
}
function optimisticSnapshot(previous:NotificationCenterSnapshot,item:NotificationItem,action:'done'|'snooze'):NotificationCenterSnapshot{
  const active=previous.active.filter(row=>row.key!==item.key);
  const snoozed=previous.snoozed.filter(row=>row.key!==item.key);
  const done=previous.done.filter(row=>row.key!==item.key);
  if(action==='snooze')snoozed.push(item);else done.push(item);
  return{
    ...previous,
    generatedAt:new Date().toISOString(),
    active,
    snoozed,
    done,
    activeHigh:active.filter(row=>row.priority==='high').length,
    activeMedium:active.filter(row=>row.priority==='medium').length,
    activeLow:active.filter(row=>row.priority==='low').length
  };
}

export class NotificationCenterLive extends React.Component<Props,State>{
  state:State={open:false,loading:false,busyKey:'',snoozeKey:'',tab:'active',error:'',snapshot:null};
  private mutationGeneration=0;

  componentDidMount():void{
    ensureNotificationCenterStyles();
    window.addEventListener(OPEN_EVENT,this.openFromEvent);
    void this.refresh(false);
  }
  componentWillUnmount():void{window.removeEventListener(OPEN_EVENT,this.openFromEvent);}
  componentDidUpdate(prev:Props):void{
    if(prev.screen!==this.props.screen||prev.language!==this.props.language)void this.refresh(false);
  }

  private openFromEvent=()=>{this.setState({open:true,tab:'active',snoozeKey:'',error:''},()=>void this.refresh(true));};
  private publish=(snapshot:NotificationCenterSnapshot|null)=>this.props.onCount(snapshot?.active.length??0,snapshot?.activeHigh??0);
  private refresh=async(showLoading:boolean)=>{
    const startedAtMutationGeneration=this.mutationGeneration;
    if(showLoading)this.setState({loading:true,error:''});
    try{
      const session=await resumeVaultSession();
      if(startedAtMutationGeneration!==this.mutationGeneration){this.setState({loading:false});return;}
      if(!session){this.setState({snapshot:null,loading:false,error:t('Unlock the encrypted vault to review notifications. Close this window and unlock your session, then try again.','افتح الخزنة المشفرة لمراجعة التنبيهات. أغلق هذه النافذة وافتح جلستك ثم أعد المحاولة.')});this.publish(null);return;}
      const snapshot=buildNotificationCenter(scopeVault(session.vault),todayIso());
      if(startedAtMutationGeneration!==this.mutationGeneration){this.setState({loading:false});return;}
      this.setState({snapshot,loading:false,error:''});this.publish(snapshot);
    }catch(error){
      if(startedAtMutationGeneration!==this.mutationGeneration){this.setState({loading:false});return;}
      this.setState({loading:false,error:error instanceof Error?error.message:t('Unable to load notifications.','تعذر تحميل التنبيهات.')});
    }
  };
  private mutate=async(item:NotificationItem,action:'done'|'snooze',until='')=>{
    if(this.state.busyKey)return;
    this.mutationGeneration+=1;
    const previous=this.state.snapshot;
    const optimistic=previous?optimisticSnapshot(previous,item,action):null;
    this.setState({busyKey:item.key,snoozeKey:'',error:'',snapshot:optimistic??previous});
    if(optimistic)this.publish(optimistic);
    try{
      const next=await mutateVaultSafely(vault=>{
        const event=validatedNotificationStateEvent(vault,item.key,action,until,todayIso());
        return{...vault,documentEvents:[...vault.documentEvents,event]};
      });
      const snapshot=buildNotificationCenter(scopeVault(next),todayIso());
      this.setState({snapshot,busyKey:'',snoozeKey:'',loading:false,error:''});this.publish(snapshot);
    }catch(error){
      this.setState({snapshot:previous,busyKey:'',snoozeKey:'',loading:false,error:error instanceof Error?error.message:t('Unable to update notification.','تعذر تحديث التنبيه.')});
      this.publish(previous);
    }
  };
  private openTarget=(item:NotificationItem)=>{
    this.setState({open:false,snoozeKey:'',error:''});
    this.props.onNavigate(item.target);
  };
  private close=()=>this.setState({open:false,snoozeKey:'',error:''});

  private items=():NotificationItem[]=>{
    const snapshot=this.state.snapshot;if(!snapshot)return[];
    return this.state.tab==='active'?snapshot.active:this.state.tab==='snoozed'?snapshot.snoozed:snapshot.done;
  };
  private row=(item:NotificationItem)=>{
    const copy=label(item,this.props.language);
    const busy=this.state.busyKey===item.key;
    const showSnooze=this.state.snoozeKey===item.key;
    const today=todayIso();
    return <article className={`lx-notification-item is-${item.priority}`} key={item.key}>
      <span className="lx-notification-priority" aria-hidden="true"/>
      <div className="lx-notification-copy">
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
        <div className="lx-notification-meta">
          {item.dueDate?<span>{t('Due','التاريخ')}: {item.dueDate}</span>:null}
          {item.count>1?<span>{item.count}</span>:null}
          {item.amount&&item.currency?<span>{item.amount} {item.currency}</span>:null}
        </div>
      </div>
      <div className="lx-notification-actions">
        <button type="button" className="is-primary" disabled={busy} onClick={()=>this.openTarget(item)}>{targetLabel(item.target)}</button>
        {this.state.tab!=='done'?<>
          <button type="button" disabled={busy} onClick={()=>this.setState({snoozeKey:showSnooze?'':item.key})}>{t('Snooze','تأجيل')}</button>
          <button type="button" disabled={busy} onClick={()=>void this.mutate(item,'done')}>{busy?t('Saving…','جارٍ الحفظ…'):t('Done','تم')}</button>
        </>:null}
        {showSnooze&&this.state.tab!=='done'?<div className="lx-notification-snooze" role="group" aria-label={t('Snooze until','تأجيل حتى')}>
          <button type="button" disabled={busy} onClick={()=>void this.mutate(item,'snooze',shiftDate(today,1))}>{t('Tomorrow','غدًا')}</button>
          <button type="button" disabled={busy} onClick={()=>void this.mutate(item,'snooze',shiftDate(today,3))}>{t('3 days','3 أيام')}</button>
          <button type="button" disabled={busy} onClick={()=>void this.mutate(item,'snooze',shiftDate(today,7))}>{t('7 days','7 أيام')}</button>
        </div>:null}
      </div>
    </article>;
  };

  private summary=()=>{
    if(!this.props.renderHomeSummary)return null;
    const snapshot=this.state.snapshot;const count=snapshot?.active.length??0;const high=snapshot?.activeHigh??0;
    return <section className="ta-dashboard-card lx-notification-summary" aria-label={t('Notifications and follow-up','التنبيهات والمتابعة')}>
      <div className="lx-notification-summary-copy">
        <small>{t('Follow-up Center','مركز المتابعة')}</small>
        <strong>{!snapshot?this.state.loading?t('Loading notifications…','جارٍ تحميل التنبيهات…'):t('Notifications unavailable','التنبيهات غير متاحة'):count?t(`${count} items need review`,`${count} عناصر تحتاج مراجعة`):t('No active follow-ups','لا توجد متابعات نشطة')}</strong>
        <span>{!snapshot?this.state.error||t('Open Review to load notifications from the encrypted vault.','افتح المراجعة لتحميل التنبيهات من الخزنة المشفرة.'):high?t(`${high} high-priority items`,`${high} عناصر عالية الأولوية`):t('Overdue invoices, quote dates and recorded follow-ups appear here.','تظهر هنا الفواتير المتأخرة ومواعيد العروض والمتابعات المسجلة.')}</span>
      </div>
      <div className="lx-notification-summary-actions">
        {count?<span className={`lx-notification-count ${high?'is-danger':''}`}>{count}</span>:null}
        <Button icon="alert" onClick={this.openFromEvent}>{t('Review','مراجعة')}</Button>
      </div>
    </section>;
  };

  render():any{
    const items=this.items();const snapshot=this.state.snapshot;
    return <>
      {this.summary()}
      <Modal open={this.state.open} title={t('Notifications & Follow-up','التنبيهات والمتابعة')} onClose={this.close} size="lg">
        <div className="lx-notification-center" dir={this.props.language==='ar'?'rtl':'ltr'}>
          <div className="lx-notification-tabs" role="tablist" aria-label={t('Notification status','حالة التنبيه')}>
            {(['active','snoozed','done'] as NotificationCenterTab[]).map(tab=>{
              const count=tab==='active'?snapshot?.active.length??0:tab==='snoozed'?snapshot?.snoozed.length??0:snapshot?.done.length??0;
              const text=tab==='active'?t('Active','نشط'):tab==='snoozed'?t('Snoozed','مؤجل'):t('Done','تم');
              return <button type="button" role="tab" key={tab} aria-selected={this.state.tab===tab} className={this.state.tab===tab?'is-active':''} onClick={()=>this.setState({tab,snoozeKey:'',error:this.state.snapshot?'':this.state.error})}>{text} · {count}</button>;
            })}
          </div>
          {this.state.error?<div className="lx-notification-error" role="alert"><span>{this.state.error}</span><Button disabled={this.state.loading||Boolean(this.state.busyKey)} onClick={()=>void this.refresh(true)}>{t('Try again','إعادة المحاولة')}</Button></div>:null}
          {this.state.loading?<div className="lx-notification-empty" role="status"><Icon name="refresh"/><strong>{t('Loading notifications…','جارٍ تحميل التنبيهات…')}</strong></div>:this.state.error&&!this.state.snapshot?null:items.length?<div className="lx-notification-list">{items.map(this.row)}</div>:<div className="lx-notification-empty"><Icon name="check"/><strong>{this.state.tab==='active'?t('Nothing needs attention','لا يوجد ما يحتاج انتباه'):this.state.tab==='snoozed'?t('Nothing is snoozed','لا توجد عناصر مؤجلة'):t('No completed items in the current conditions','لا توجد عناصر مكتملة ضمن الحالات الحالية')}</strong><span>{t('The Center is derived from recorded LOUREX data and never invents missing business facts.','المركز مشتق من بيانات LOUREX المسجلة ولا يخترع معلومات أعمال مفقودة.')}</span><Button onClick={this.close}>{t('Return to workspace','العودة إلى مساحة العمل')}</Button></div>}
        </div>
      </Modal>
    </>;
  }
}

export function openNotificationCenter():void{window.dispatchEvent(new Event(OPEN_EVENT));}
