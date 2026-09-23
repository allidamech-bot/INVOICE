import type { DocumentKind, LourexDocument, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { signOutCloudUser } from '../cloud/firebase.js';
import { clearSession } from '../storage/session.js';
import { Brand, Button, Icon } from './UI.js';
import { AiCopilot } from './AiCopilot.js';
import { ThemeControl } from './ThemeControl.js';

// Keep the existing internal screen ids as compatibility aliases while the
// product architecture is consolidated in later batches. The user-facing
// navigation already reflects the final ownership model.
export type WorkspaceScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';

type CloudState='local'|'queued'|'syncing'|'synced'|'offline'|'error'|'conflict';
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

interface State { moreOpen:boolean; signingOut:boolean; }

type NavTarget=Exclude<WorkspaceScreen,'editor'>;
type MoreTone='items'|'receivables'|'reports'|'operations';

export class AppShell extends React.Component<Props,State>{
  state:State={moreOpen:false,signingOut:false};

  componentDidMount():void{document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleKeyDown);}

  componentDidUpdate(prevProps:Props,prevState:State):void{
    if(prevProps.screen!==this.props.screen&&this.state.moreOpen){this.setState({moreOpen:false});return;}
    if(!prevState.moreOpen&&this.state.moreOpen)window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('#mobile-more-sheet .mobile-more-close')?.focus({preventScroll:true}));
    if(prevState.moreOpen&&!this.state.moreOpen&&prevProps.screen===this.props.screen)window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('button[aria-controls="mobile-more-sheet"]')?.focus({preventScroll:true}));
  }

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(!this.state.moreOpen)return;
    if(event.key==='Escape'){event.preventDefault();this.setState({moreOpen:false});return;}
    if(event.key!=='Tab')return;
    const sheet=document.getElementById('mobile-more-sheet');if(!sheet)return;
    const focusable=Array.from(sheet.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(node=>node.offsetParent!==null);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0]!,last=focusable[focusable.length-1]!;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
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

  private hasSignedInAccount=():boolean=>{
    try{
      const firebaseApi=(window as any).firebase;
      return Boolean(firebaseApi&&firebaseApi.auth&&firebaseApi.auth().currentUser);
    }catch{return false;}
  };

  private signOutFromMore=async()=>{
    if(this.state.signingOut)return;
    document.documentElement.dataset.lourexSigningOut='true';
    this.setState({signingOut:true});
    try{
      await signOutCloudUser();
      await clearSession();
      window.location.replace(window.location.href);
    }catch{
      delete document.documentElement.dataset.lourexSigningOut;
      this.setState({signingOut:false});
    }
  };

  private activeEditorDocument=():LourexDocument|null=>{
    if(this.props.screen!=='editor')return null;
    const root:any=this.props.children;
    const children=Array.isArray(root?.props?.children)?root.props.children:[root?.props?.children];
    for(const child of children)if(child?.props?.document)return child.props.document as LourexDocument;
    return null;
  };

  private pageTitle=():string=>{
    switch(this.props.screen){
      case 'home':return t('Home','الرئيسية');
      case 'documents':return t('Documents','المستندات');
      case 'customers':return t('Customers','العملاء');
      case 'receivables':return t('Finance','المالية');
      case 'reports':return t('Reports','التقارير');
      case 'items':return t('Products & Inventory','المنتجات والمخزون');
      case 'operations':return t('Purchasing','المشتريات');
      case 'editor':return t('Document Editor','محرر المستند');
    }
  };

  private navButton=(screen:NavTarget,icon:'home'|'file'|'users'|'items'|'invoice'|'backup'|'chart',label:string,className='')=>
    <button type="button" className={`shell-nav-button ${className} ${this.props.screen===screen?'active':''}`} aria-current={this.props.screen===screen?'page':undefined} onClick={()=>this.navigate(screen)}><Icon name={icon}/><span>{label}</span></button>;

  private moreNavButton=(screen:NavTarget,icon:'file'|'items'|'invoice'|'backup',label:string,description:string,tone:MoreTone)=>
    <button type="button" className={`mobile-more-link tone-${tone} ${this.props.screen===screen?'active':''}`} aria-current={this.props.screen===screen?'page':undefined} onClick={()=>this.navigate(screen)}>
      <span className="mobile-more-link-icon"><Icon name={icon}/></span>
      <span className="mobile-more-link-copy"><strong>{label}</strong><small>{description}</small></span>
      <span className="mobile-more-chevron" aria-hidden="true"/>
    </button>;

  private createMenu=(id:string,className:string)=>this.props.newMenu?<div className={`new-menu shell-new-menu ${className}`} id={id} role="menu" aria-label={t('New Document','مستند جديد')}>
    <button type="button" role="menuitem" data-kind="proforma" onClick={()=>this.createDocument('proforma')}><Icon name="proforma"/><span><strong>{t('Quotation','عرض سعر')}</strong><small>{t('Commercial quotation','عرض تجاري')}</small></span></button>
    <button type="button" role="menuitem" data-kind="invoice" onClick={()=>this.createDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button>
    <button type="button" role="menuitem" data-kind="purchase-order" onClick={()=>this.createDocument('purchase-order')}><Icon name="file"/><span><strong>{t('Purchase Order','طلب شراء')}</strong><small>{t('Supplier order and delivery terms','طلب للمورد وشروط التسليم')}</small></span></button>
    <button type="button" role="menuitem" data-kind="draft" onClick={()=>this.createDocument('draft')}><Icon name="edit"/><span><strong>{t('Draft','مسودة')}</strong><small>{t('Letterhead, notices and free-form company documents','خطابات ومذكرات ومستندات شركة حرة')}</small></span></button>
  </div>:null;

  private saveLabel=():string=>this.props.cloudLabel;

  private syncStatus=(className:string)=>{
    const label=this.saveLabel();
    const detail=this.props.cloudMessage;
    return <div className={`${className} state-${this.props.cloudState}`} role="status" aria-live="polite" aria-label={detail?`${label}. ${detail}`:label} title={detail||label}><span className="shell-status-dot"/><span>{label}</span></div>;
  };

  private conflictBanner=()=>this.props.cloudState==='conflict'?<section className="cloud-conflict-banner" role="alert">
    <span className="cloud-conflict-icon"><Icon name="backup"/></span>
    <div><strong>{t('Cloud sync needs your choice','المزامنة السحابية تحتاج اختيارك')}</strong><span>{this.props.cloudMessage||t('This device and the cloud both changed. Neither copy was overwritten.','تم تعديل نسخة هذا الجهاز ونسخة السحابة. لم يتم استبدال أي منهما.')}</span></div>
    <Button variant="primary" onClick={this.props.onCloud}>{this.props.screen==='editor'?t('Review options','عرض الخيارات'):t('Resolve safely','حل التعارض بأمان')}</Button>
  </section>:null;

  private accountButton=(className:string,compact=false)=>
    <button type="button" className={className} aria-label={t('Account','الحساب')} title={t('Open account','فتح الحساب')} onClick={this.openAccount}><Icon name="users"/>{compact?<span>{t('Account','الحساب')}</span>:<span><small>{t('Account','الحساب')}</small><strong>{t('Company identity and account access','هوية الشركة وبيانات الحساب')}</strong></span>}</button>;

  render():any{
    const editor=this.props.screen==='editor';
    const signedIn=this.hasSignedInAccount();
    return <div className={`workspace-shell fintech-shell-v280 screen-${this.props.screen} ${editor?'is-editor':''}`}>
      {!editor?<aside className="workspace-sidebar" aria-label={t('Main navigation','التنقل الرئيسي')}>
        <button type="button" className="shell-brand-button" onClick={()=>this.navigate('home')}><Brand compact logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/><span className="shell-brand-product"><strong>INVOICE</strong><small>{t('Business workspace','مساحة الأعمال')}</small></span></button>
        <div className="new-doc-menu shell-create-wrap">
          <Button icon="plus" variant="primary" className="shell-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="desktop-new-document-menu" onClick={this.toggleCreate}>{t('New Document','مستند جديد')}</Button>
          {this.createMenu('desktop-new-document-menu','desktop-shell-new-menu')}
        </div>
        <nav className="shell-navigation">
          <div className="shell-nav-group shell-nav-primary"><p>{t('Workspace','مساحة العمل')}</p>
            {this.navButton('home','home',t('Home','الرئيسية'))}
            {this.navButton('documents','file',t('Documents','المستندات'))}
            {this.navButton('customers','users',t('Customers','العملاء'))}
          </div>
          <div className="shell-nav-group"><p>{t('Operations','العمليات')}</p>
            {this.navButton('items','items',t('Products & Inventory','المنتجات والمخزون'))}
            {this.navButton('operations','backup',t('Purchasing','المشتريات'))}
          </div>
          <div className="shell-nav-group"><p>{t('Insights','التحليل')}</p>
            {this.navButton('receivables','invoice',t('Finance','المالية'))}
            {this.navButton('reports','chart',t('Reports','التقارير'))}
          </div>
        </nav>
        <div className="shell-sidebar-footer">
          {this.syncStatus('shell-sync-row')}
          <ThemeControl compact language={this.props.language} className="shell-theme-control"/>
          {this.accountButton('shell-account-row')}
          <button type="button" className="shell-settings-row" onClick={this.openSettings}><Icon name="settings"/><span>{t('Settings','الإعدادات')}</span></button>
        </div>
      </aside>:null}

      <header className="workspace-topbar">
        <div className="shell-mobile-brand">{!editor?<button type="button" aria-label={t('Home','الرئيسية')} onClick={()=>this.navigate('home')}><Brand compact logoDataUrl="./brand/lourex-logo.svg" language={this.props.language}/></button>:<span className="editor-context-mark"><Icon name="edit"/></span>}</div>
        <div className="shell-page-title"><small>{editor?t('Editing','تحرير'):t('LOUREX Invoice','LOUREX Invoice')}</small><strong>{this.pageTitle()}</strong></div>
        <div className="shell-topbar-actions">
          <button type="button" className="shell-global-search-button" aria-label={t('Search LOUREX','بحث LOUREX')} title={t('Global search · Ctrl/⌘ K','البحث الشامل · Ctrl/⌘ K')} onClick={()=>window.dispatchEvent(new Event('lourex-global-search-open'))}><Icon name="search"/><span>{t('Search','بحث')}</span><kbd>⌘K</kbd></button>
          <ThemeControl compact language={this.props.language} className="shell-topbar-theme"/>
          {this.syncStatus('shell-sync-status')}
          {this.accountButton('shell-account-button',true)}
        </div>
      </header>

      <div className="workspace-content">{this.conflictBanner()}{this.props.children}</div>

      {!editor?<>
        {this.state.moreOpen?<><button type="button" className="mobile-more-backdrop" aria-label={t('Close menu','إغلاق القائمة')} onClick={this.closeMore}/><section className="mobile-more-sheet" id="mobile-more-sheet" role="dialog" aria-modal="true" aria-label={t('More','المزيد')} dir={this.props.language==='ar'?'rtl':'ltr'}>
          <div className="mobile-more-handle" aria-hidden="true"/>
          <div className="mobile-more-heading">
            <div className="mobile-more-heading-copy"><small>{t('Workspace menu','قائمة مساحة العمل')}</small><strong>{t('More','المزيد')}</strong><span>{t('Your business, finance, reports and settings','أعمالك والمالية والتقارير والإعدادات')}</span></div>
            <button type="button" className="mobile-more-close" onClick={this.closeMore} aria-label={t('Close','إغلاق')}><Icon name="x"/></button>
          </div>
          <div className="mobile-more-utility-row">
            <ThemeControl language={this.props.language} className="mobile-more-theme-control"/>
            {signedIn?<button type="button" className="mobile-more-signout settings-signout-button" disabled={this.state.signingOut} onClick={()=>void this.signOutFromMore()}><Icon name="lock"/><strong>{this.state.signingOut?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</strong></button>:null}
          </div>
          <div className="mobile-more-status-row">{this.syncStatus('mobile-more-sync')}</div>
          <button type="button" className="mobile-more-account" onClick={this.openAccount}>
            <span className="mobile-more-account-icon"><Icon name="users"/></span>
            <span className="mobile-more-account-copy"><strong>{t('Account','الحساب')}</strong><small>{t('Company identity, logo, legal profile and account access','هوية الشركة والشعار والبيانات القانونية وبيانات الحساب')}</small></span>
            <span className="mobile-more-chevron" aria-hidden="true"/>
          </button>
          <div className="mobile-more-group group-workspace"><p><span>{t('Business','الأعمال')}</span></p>{this.moreNavButton('items','items',t('Products & Inventory','المنتجات والمخزون'),t('Products, stock and inventory movement','المنتجات والمخزون وحركة الأصناف'),'items')}{this.moreNavButton('operations','backup',t('Purchasing','المشتريات'),t('Suppliers and purchase workflow','الموردون ودورة المشتريات'),'operations')}</div>
          <div className="mobile-more-group group-finance"><p><span>{t('Finance & analysis','المالية والتحليل')}</span></p>{this.moreNavButton('receivables','invoice',t('Finance','المالية'),t('Receivables, collections and expenses','المستحقات والتحصيل والمصروفات'),'receivables')}{this.moreNavButton('reports','file',t('Reports','التقارير'),t('Business and financial analysis','تحليل الأعمال والنتائج المالية'),'reports')}</div>
          <div className="mobile-more-group group-system"><p><span>{t('System','النظام')}</span></p><button type="button" className="mobile-more-settings" onClick={this.openSettings}><span className="mobile-more-settings-icon"><Icon name="settings"/></span><span className="mobile-more-settings-copy"><strong>{t('Settings','الإعدادات')}</strong><small>{t('Workspace, documents, commercial and security','مساحة العمل والمستندات والتجاري والأمان')}</small></span><span className="mobile-more-chevron" aria-hidden="true"/></button></div>
        </section></>:null}
        <nav className="mobile-bottom-nav" aria-label={t('Mobile navigation','تنقل الجوال')}>
          <button type="button" className={this.props.screen==='home'?'active':''} aria-current={this.props.screen==='home'?'page':undefined} onClick={()=>this.navigate('home')}><Icon name="home"/><span>{t('Home','الرئيسية')}</span></button>
          <button type="button" className={this.props.screen==='documents'?'active':''} aria-current={this.props.screen==='documents'?'page':undefined} onClick={()=>this.navigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
          <div className="new-doc-menu mobile-create-wrap">
            <button type="button" className="mobile-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="mobile-new-document-menu" aria-label={t('New Document','مستند جديد')} onClick={this.toggleCreate}><Icon name="plus" size={24}/></button>
            {this.createMenu('mobile-new-document-menu','mobile-shell-new-menu')}
          </div>
          <button type="button" className={this.props.screen==='customers'?'active':''} aria-current={this.props.screen==='customers'?'page':undefined} onClick={()=>this.navigate('customers')}><Icon name="users"/><span>{t('Customers','العملاء')}</span></button>
          <button type="button" className={this.state.moreOpen?'active':''} aria-haspopup="dialog" aria-controls="mobile-more-sheet" aria-expanded={this.state.moreOpen} onClick={this.toggleMore}><Icon name="more"/><span>{t('More','المزيد')}</span></button>
        </nav>
      </>:null}
      <AiCopilot screen={this.props.screen} language={this.props.language} activeDocument={this.activeEditorDocument()} onNavigate={screen=>this.navigate(screen)}/>
    </div>;
  }
}
