import type { DocumentKind, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { Brand, Button, Icon } from './UI.js';

export type WorkspaceScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';

type CloudState='local'|'queued'|'syncing'|'synced'|'offline'|'error';
type SettingsScope='account'|'settings';
const SETTINGS_SCOPE_KEY='lourex-settings-scope';

interface Props {
  screen:WorkspaceScreen;
  logoDataUrl:string;
  language:UiLanguage;
  newMenu:boolean;
  cloudState:CloudState;
  cloudLabel:string;
  cloudMessage:string;
  onNavigate:(screen:Exclude<WorkspaceScreen,'editor'>)=>void;
  onToggleNew:()=>void;
  onNew:(kind:DocumentKind)=>void;
  onSettings:()=>void;
  onCloud:()=>void;
  children:any;
}

interface State { moreOpen:boolean; }

type NavTarget=Exclude<WorkspaceScreen,'editor'>;
type MoreTone='items'|'receivables'|'reports'|'operations';

export class AppShell extends React.Component<Props,State>{
  state:State={moreOpen:false};

  componentDidMount():void{document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleKeyDown);}

  componentDidUpdate(prev:Props):void{
    if(prev.screen!==this.props.screen&&this.state.moreOpen)this.setState({moreOpen:false});
  }

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.key!=='Escape'||!this.state.moreOpen)return;
    event.preventDefault();
    this.setState({moreOpen:false});
  };

  private closeCreateMenu=()=>{if(this.props.newMenu)this.props.onToggleNew();};
  private closeMore=()=>{if(this.state.moreOpen)this.setState({moreOpen:false});};

  private navigate=(screen:NavTarget)=>{
    this.closeCreateMenu();
    this.closeMore();
    this.props.onNavigate(screen);
  };

  private toggleCreate=()=>{
    this.closeMore();
    this.props.onToggleNew();
  };

  private toggleMore=()=>{
    this.closeCreateMenu();
    this.setState(state=>({moreOpen:!state.moreOpen}));
  };

  private requestSettingsScope=(scope:SettingsScope)=>{try{sessionStorage.setItem(SETTINGS_SCOPE_KEY,scope);}catch{}};

  private openSettings=()=>{
    this.closeCreateMenu();
    this.closeMore();
    this.requestSettingsScope('settings');
    this.props.onSettings();
  };

  private openAccount=()=>{
    this.closeCreateMenu();
    this.closeMore();
    this.requestSettingsScope('account');
    this.props.onSettings();
  };

  private createDocument=(kind:DocumentKind)=>{
    this.closeMore();
    this.props.onNew(kind);
  };

  private pageTitle=():string=>{
    switch(this.props.screen){
      case 'home':return t('Home','الرئيسية');
      case 'documents':return t('Documents','المستندات');
      case 'customers':return t('Customers','العملاء');
      case 'receivables':return t('Receivables','المستحقات');
      case 'reports':return t('Reports','التقارير');
      case 'items':return t('Items','الأصناف');
      case 'operations':return t('Business','الأعمال');
      case 'editor':return t('Document Editor','محرر المستند');
    }
  };

  private navButton=(screen:NavTarget,icon:'menu'|'file'|'users'|'items'|'invoice'|'backup',label:string,className='')=>
    <button type="button" className={`shell-nav-button ${className} ${this.props.screen===screen?'active':''}`} aria-current={this.props.screen===screen?'page':undefined} onClick={()=>this.navigate(screen)}><Icon name={icon}/><span>{label}</span></button>;

  private moreNavButton=(screen:NavTarget,icon:'file'|'items'|'invoice'|'backup',label:string,description:string,tone:MoreTone)=>
    <button type="button" className={`mobile-more-link tone-${tone} ${this.props.screen===screen?'active':''}`} aria-current={this.props.screen===screen?'page':undefined} onClick={()=>this.navigate(screen)}>
      <span className="mobile-more-link-icon"><Icon name={icon}/></span>
      <span className="mobile-more-link-copy"><strong>{label}</strong><small>{description}</small></span>
      <span className="mobile-more-chevron" aria-hidden="true"/>
    </button>;

  private createMenu=(id:string,className:string)=>this.props.newMenu?<div className={`new-menu shell-new-menu ${className}`} id={id} role="menu" aria-label={t('New Document','مستند جديد')}>
    <button type="button" role="menuitem" onClick={()=>this.createDocument('proforma')}><Icon name="proforma"/><span><strong>{t('Quotation','عرض سعر')}</strong><small>{t('Commercial quotation','عرض تجاري')}</small></span></button>
    <button type="button" role="menuitem" onClick={()=>this.createDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button>
  </div>:null;

  private saveLabel=():string=>{
    if(this.props.cloudState==='syncing')return t('Saving…','جارٍ الحفظ…');
    if(this.props.cloudState==='offline')return t('Offline','غير متصل');
    if(this.props.cloudState==='error')return t('Save pending','الحفظ معلّق');
    return t('Saved','محفوظ');
  };

  private syncStatus=(className:string)=>{
    const label=this.saveLabel();
    return <div className={`${className} state-${this.props.cloudState}`} role="status" aria-live="polite" title={label}><span className="shell-status-dot"/><span>{label}</span></div>;
  };

  private accountButton=(className:string,compact=false)=>
    <button type="button" className={className} aria-label={t('Account','الحساب')} title={t('Open account','فتح الحساب')} onClick={this.openAccount}><Icon name="users"/>{compact?<span>{t('Account','الحساب')}</span>:<span><small>{t('Account','الحساب')}</small><strong>{t('Company profile, logo and account access','ملف الشركة والشعار وبيانات الحساب')}</strong></span>}</button>;

  render():any{
    const editor=this.props.screen==='editor';
    return <div className={`workspace-shell ${editor?'is-editor':''}`}>
      {!editor?<aside className="workspace-sidebar" aria-label={t('Main navigation','التنقل الرئيسي')}>
        <button type="button" className="shell-brand-button" onClick={()=>this.navigate('home')}><Brand compact logoDataUrl={this.props.logoDataUrl} language={this.props.language}/></button>
        <div className="new-doc-menu shell-create-wrap">
          <Button icon="plus" variant="primary" className="shell-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="desktop-new-document-menu" onClick={this.toggleCreate}>{t('New Document','مستند جديد')}</Button>
          {this.createMenu('desktop-new-document-menu','desktop-shell-new-menu')}
        </div>
        <nav className="shell-navigation">
          <div className="shell-nav-primary">
            {this.navButton('home','menu',t('Home','الرئيسية'))}
            {this.navButton('documents','file',t('Documents','المستندات'))}
            {this.navButton('customers','users',t('Customers','العملاء'))}
            {this.navButton('items','items',t('Items','الأصناف'))}
          </div>
          <div className="shell-nav-group">
            <p>{t('Finance','المالية')}</p>
            {this.navButton('receivables','invoice',t('Receivables','المستحقات'),'nested')}
            {this.navButton('reports','file',t('Reports','التقارير'),'nested')}
          </div>
          <div className="shell-nav-group">
            <p>{t('Business','الأعمال')}</p>
            {this.navButton('operations','backup',t('Operations','العمليات'),'nested')}
          </div>
        </nav>
        <div className="shell-sidebar-footer">
          {this.syncStatus('shell-sync-row')}
          {this.accountButton('shell-account-row')}
          <button type="button" className="shell-settings-row" onClick={this.openSettings}><Icon name="settings"/><span>{t('Settings','الإعدادات')}</span></button>
        </div>
      </aside>:null}

      <header className="workspace-topbar">
        <div className="shell-mobile-brand">{!editor?<button type="button" aria-label={t('Home','الرئيسية')} onClick={()=>this.navigate('home')}><Brand compact logoDataUrl={this.props.logoDataUrl} language={this.props.language}/></button>:<span className="editor-context-mark"><Icon name="edit"/></span>}</div>
        <div className="shell-page-title"><small>{editor?t('Editing','تحرير'):t('LOUREX Invoice','LOUREX Invoice')}</small><strong>{this.pageTitle()}</strong></div>
        <div className="shell-topbar-actions">
          {this.syncStatus('shell-sync-status')}
          {this.accountButton('shell-account-button',true)}
        </div>
      </header>

      <div className="workspace-content">{this.props.children}</div>

      {!editor?<>
        {this.state.moreOpen?<><button type="button" className="mobile-more-backdrop" aria-label={t('Close menu','إغلاق القائمة')} onClick={this.closeMore}/><section className="mobile-more-sheet" id="mobile-more-sheet" role="dialog" aria-modal="true" aria-label={t('More','المزيد')} dir={this.props.language==='ar'?'rtl':'ltr'}>
          <div className="mobile-more-handle" aria-hidden="true"/>
          <div className="mobile-more-heading">
            <div className="mobile-more-heading-copy"><small>{t('Workspace menu','قائمة مساحة العمل')}</small><strong>{t('More','المزيد')}</strong><span>{t('Quick access to business tools and settings','وصول سريع إلى أدوات العمل والإعدادات')}</span></div>
            <button type="button" className="mobile-more-close" onClick={this.closeMore} aria-label={t('Close','إغلاق')}><Icon name="x"/></button>
          </div>
          <div className="mobile-more-status-row">{this.syncStatus('mobile-more-sync')}</div>
          <button type="button" className="mobile-more-account" onClick={this.openAccount}>
            <span className="mobile-more-account-icon"><Icon name="users"/></span>
            <span className="mobile-more-account-copy"><strong>{t('Account','الحساب')}</strong><small>{t('Company profile, logo, website and account access','ملف الشركة والشعار والموقع وبيانات الحساب')}</small></span>
            <span className="mobile-more-chevron" aria-hidden="true"/>
          </button>
          <div className="mobile-more-group group-workspace"><p><span>{t('Workspace','مساحة العمل')}</span></p>{this.moreNavButton('items','items',t('Items','الأصناف'),t('Products and services library','إدارة المنتجات والخدمات'),'items')}</div>
          <div className="mobile-more-group group-finance"><p><span>{t('Finance','المالية')}</span></p>{this.moreNavButton('receivables','invoice',t('Receivables','المستحقات'),t('Open balances and collections','الأرصدة المفتوحة والتحصيل'),'receivables')}{this.moreNavButton('reports','file',t('Reports','التقارير'),t('Sales and financial insights','تقارير المبيعات والمالية'),'reports')}</div>
          <div className="mobile-more-group group-business"><p><span>{t('Business','الأعمال')}</span></p>{this.moreNavButton('operations','backup',t('Operations','العمليات'),t('Purchases, expenses and activity','المشتريات والمصروفات والنشاط'),'operations')}</div>
          <div className="mobile-more-group group-system"><p><span>{t('General','عام')}</span></p><button type="button" className="mobile-more-settings" onClick={this.openSettings}><span className="mobile-more-settings-icon"><Icon name="settings"/></span><span className="mobile-more-settings-copy"><strong>{t('Settings','الإعدادات')}</strong><small>{t('Preferences, documents and security','التفضيلات والمستندات والأمان')}</small></span><span className="mobile-more-chevron" aria-hidden="true"/></button></div>
        </section></>:null}
        <nav className="mobile-bottom-nav" aria-label={t('Mobile navigation','تنقل الجوال')}>
          <button type="button" className={this.props.screen==='home'?'active':''} aria-current={this.props.screen==='home'?'page':undefined} onClick={()=>this.navigate('home')}><Icon name="menu"/><span>{t('Home','الرئيسية')}</span></button>
          <button type="button" className={this.props.screen==='documents'?'active':''} aria-current={this.props.screen==='documents'?'page':undefined} onClick={()=>this.navigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
          <div className="new-doc-menu mobile-create-wrap">
            <button type="button" className="mobile-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="mobile-new-document-menu" aria-label={t('New Document','مستند جديد')} onClick={this.toggleCreate}><Icon name="plus" size={24}/></button>
            {this.createMenu('mobile-new-document-menu','mobile-shell-new-menu')}
          </div>
          <button type="button" className={this.props.screen==='customers'?'active':''} aria-current={this.props.screen==='customers'?'page':undefined} onClick={()=>this.navigate('customers')}><Icon name="users"/><span>{t('Customers','العملاء')}</span></button>
          <button type="button" className={this.state.moreOpen?'active':''} aria-haspopup="dialog" aria-controls="mobile-more-sheet" aria-expanded={this.state.moreOpen} onClick={this.toggleMore}><Icon name="more"/><span>{t('More','المزيد')}</span></button>
        </nav>
      </>:null}
    </div>;
  }
}
