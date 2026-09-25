import type { DocumentKind, LourexDocument, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { signOutCloudUser } from '../cloud/firebase.js';
import { clearSession } from '../storage/session.js';
import { Brand, Button, Icon } from './UI.js';
import { AiCopilot } from './AiCopilot.js';
import { ThemeControl } from './ThemeControl.js';

export type WorkspaceScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';

type CloudState='local'|'queued'|'syncing'|'synced'|'offline'|'error'|'conflict';
type SettingsScope='account'|'settings';
type NavTarget=Exclude<WorkspaceScreen,'editor'>;
type NavIcon='home'|'file'|'users'|'items'|'invoice'|'backup'|'chart';

const SETTINGS_SCOPE_KEY='lourex-settings-scope';

interface Props {
  screen:WorkspaceScreen;
  logoDataUrl:string;
  language:UiLanguage;
  newMenu:boolean;
  cloudState:CloudState;
  cloudLabel:string;
  cloudMessage:string;
  onNavigate:(screen:NavTarget)=>void;
  onToggleNew:()=>void;
  onNew:(kind:DocumentKind)=>void;
  onCreditNote:()=>void;
  onStatementAccount:()=>void;
  onSettings:()=>void;
  onCloud:()=>void;
  children:any;
}

interface State {
  moreOpen:boolean;
  signingOut:boolean;
}

/**
 * TailAdmin-style application shell. Presentation structure only: navigation,
 * Firebase sign-out, encrypted session handling, cloud conflict handling and all
 * LOUREX business callbacks remain owned by their existing boundaries.
 */
export class AppShell extends React.Component<Props,State>{
  state:State={moreOpen:false,signingOut:false};

  componentDidMount():void{
    document.addEventListener('keydown',this.handleKeyDown);
    this.syncOverlayState();
  }

  componentWillUnmount():void{
    document.removeEventListener('keydown',this.handleKeyDown);
    this.applyOverlayLock(false);
  }

  componentDidUpdate(prevProps:Props,prevState:State):void{
    if(prevProps.screen!==this.props.screen){
      if(this.state.moreOpen)this.setState({moreOpen:false});
      if(this.props.newMenu)this.props.onToggleNew();
      this.resetWorkspaceScroll();
    }

    this.syncOverlayState();

    if(!prevState.moreOpen&&this.state.moreOpen){
      window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('#ta-mobile-more .ta-sheet-close')?.focus({preventScroll:true}));
    }
    if(prevState.moreOpen&&!this.state.moreOpen&&prevProps.screen===this.props.screen){
      window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('button[aria-controls="ta-mobile-more"]')?.focus({preventScroll:true}));
    }
    if(!prevProps.newMenu&&this.props.newMenu){
      window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`#${this.activeCreateMenuId()} button[role="menuitem"]`)?.focus({preventScroll:true}));
    }
    if(prevProps.newMenu&&!this.props.newMenu&&prevProps.screen===this.props.screen){
      window.requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`button[aria-controls="${this.activeCreateMenuId()}"]`)?.focus({preventScroll:true}));
    }
  }

  private isMobileShell=():boolean=>typeof window!=='undefined'&&window.matchMedia('(max-width: 900px)').matches;
  private activeCreateMenuId=():string=>this.isMobileShell()?'ta-mobile-create-menu':'ta-desktop-create-menu';

  private resetWorkspaceScroll=()=>{
    const reset=()=>{
      const main=document.querySelector<HTMLElement>('.ta-main');
      if(main){main.scrollTop=0;main.scrollLeft=0;}
      window.scrollTo(0,0);
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
    };
    reset();
    window.requestAnimationFrame(reset);
  };

  private applyOverlayLock=(locked:boolean)=>{
    const root=document.documentElement;
    const body=document.body;
    if(locked){
      root.dataset.lourexShellOverlay='true';
      body.dataset.lourexShellOverlay='true';
      return;
    }
    delete root.dataset.lourexShellOverlay;
    delete body.dataset.lourexShellOverlay;
  };

  private syncOverlayState=()=>{
    const editor=this.props.screen==='editor';
    this.applyOverlayLock(!editor&&(this.state.moreOpen||this.props.newMenu));
  };

  private focusableIn=(root:HTMLElement):HTMLElement[]=>Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(node=>node.offsetParent!==null);

  private trapOverlayFocus=(event:KeyboardEvent,root:HTMLElement)=>{
    const focusable=this.focusableIn(root);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0]!,last=focusable[focusable.length-1]!;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  };

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'){
      if(this.state.moreOpen){event.preventDefault();this.setState({moreOpen:false});return;}
      if(this.props.newMenu){event.preventDefault();this.closeCreateMenu();}
      return;
    }
    if(event.key!=='Tab')return;

    if(this.state.moreOpen){
      const sheet=document.getElementById('ta-mobile-more');
      if(sheet)this.trapOverlayFocus(event,sheet);
      return;
    }

    if(this.props.newMenu&&this.isMobileShell()){
      const menu=document.getElementById('ta-mobile-create-menu');
      if(menu)this.trapOverlayFocus(event,menu);
    }
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

  private requestSettingsScope=(scope:SettingsScope)=>{
    try{sessionStorage.setItem(SETTINGS_SCOPE_KEY,scope);}catch{}
  };

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
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onNew(kind));
  };

  private openCreditNote=()=>{
    this.closeMore();
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onCreditNote());
  };

  private openStatementAccount=()=>{
    this.closeMore();
    this.closeCreateMenu();
    window.requestAnimationFrame(()=>this.props.onStatementAccount());
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
      case 'home':return t('Dashboard','لوحة التحكم');
      case 'documents':return t('Documents','المستندات');
      case 'customers':return t('Customers','العملاء');
      case 'receivables':return t('Finance','المالية');
      case 'reports':return t('Reports','التقارير');
      case 'items':return t('Products & Inventory','المنتجات والمخزون');
      case 'operations':return t('Purchasing','المشتريات');
      case 'editor':return t('Document Studio','استوديو المستند');
    }
  };

  private navItem=(screen:NavTarget,icon:NavIcon,label:string)=>
    <button
      type="button"
      className={`ta-nav-item ${this.props.screen===screen?'is-active':''}`}
      aria-current={this.props.screen===screen?'page':undefined}
      onClick={()=>this.navigate(screen)}
    >
      <span className="ta-nav-icon"><Icon name={icon}/></span>
      <span className="ta-nav-label">{label}</span>
    </button>;

  private mobileSheetItem=(screen:NavTarget,icon:NavIcon,label:string,description:string)=>
    <button
      type="button"
      className={`ta-sheet-link ${this.props.screen===screen?'is-active':''}`}
      aria-current={this.props.screen===screen?'page':undefined}
      onClick={()=>this.navigate(screen)}
    >
      <span className="ta-sheet-link-icon"><Icon name={icon}/></span>
      <span className="ta-sheet-link-copy"><strong>{label}</strong><small>{description}</small></span>
      <span className="ta-sheet-chevron" aria-hidden="true">›</span>
    </button>;

  private createMenu=(id:string,className:string)=>this.props.newMenu?<div className={`ta-create-menu ${className}`} id={id} role="menu" aria-label={t('New Document','مستند جديد')}>
    <div className="ta-create-menu-heading"><small>{t('Create','إنشاء')}</small><strong>{t('New document','مستند جديد')}</strong></div>
    <div className="ta-create-menu-grid">
      <button type="button" role="menuitem" onClick={()=>this.createDocument('draft')}><Icon name="edit"/><span><strong>{t('Draft','مسودة')}</strong><small>{t('Free-form company document','مستند شركة حر')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('rfq')}><Icon name="file"/><span><strong>{t('RFQ','طلب عرض سعر')}</strong><small>{t('Request supplier prices','طلب أسعار المورد')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('proforma')}><Icon name="proforma"/><span><strong>{t('Quotation','عرض سعر')}</strong><small>{t('Commercial customer offer','عرض تجاري للعميل')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('proforma-invoice')}><Icon name="invoice"/><span><strong>{t('Proforma Invoice','فاتورة مبدئية')}</strong><small>{t('Pre-shipment invoice','فاتورة قبل الشحن')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('purchase-order')}><Icon name="file"/><span><strong>{t('Purchase Order','طلب شراء')}</strong><small>{t('Supplier order','طلب للمورد')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('invoice')}><Icon name="invoice"/><span><strong>{t('Commercial Invoice','فاتورة تجارية')}</strong><small>{t('Final sales invoice','فاتورة البيع النهائية')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('delivery-note')}><Icon name="file"/><span><strong>{t('Delivery Note','سند تسليم')}</strong><small>{t('Confirm delivered goods','إثبات تسليم البضاعة')}</small></span></button>
      <button type="button" role="menuitem" onClick={()=>this.createDocument('payment-receipt')}><Icon name="invoice"/><span><strong>{t('Payment Receipt','إيصال دفع')}</strong><small>{t('Acknowledge a payment','إثبات استلام دفعة')}</small></span></button>
      <button type="button" role="menuitem" onClick={this.openCreditNote}><Icon name="invoice"/><span><strong>{t('Credit Note','إشعار دائن')}</strong><small>{t('Reference an issued invoice','يرتبط بفاتورة صادرة')}</small></span></button>
      <button type="button" role="menuitem" onClick={this.openStatementAccount}><Icon name="file"/><span><strong>{t('Statement of Account','كشف حساب')}</strong><small>{t('Customer account statement','كشف حساب العميل')}</small></span></button>
    </div>
  </div>:null;

  private syncStatus=(className:string)=>{
    const label=this.props.cloudLabel;
    const detail=this.props.cloudMessage;
    return <div className={`${className} state-${this.props.cloudState}`} role="status" aria-live="polite" aria-label={detail?`${label}. ${detail}`:label} title={detail||label}>
      <span className="ta-status-dot"/>
      <span>{label}</span>
    </div>;
  };

  private conflictBanner=()=>this.props.cloudState==='conflict'?<section className="ta-conflict-banner" role="alert">
    <span className="ta-conflict-icon"><Icon name="backup"/></span>
    <div className="ta-conflict-copy"><strong>{t('Cloud sync needs your choice','المزامنة السحابية تحتاج اختيارك')}</strong><span>{this.props.cloudMessage||t('This device and the cloud both changed. Neither copy was overwritten.','تم تعديل نسخة هذا الجهاز ونسخة السحابة. لم يتم استبدال أي منهما.')}</span></div>
    <Button variant="primary" onClick={this.props.onCloud}>{this.props.screen==='editor'?t('Review options','عرض الخيارات'):t('Resolve safely','حل التعارض بأمان')}</Button>
  </section>:null;

  render():any{
    const editor=this.props.screen==='editor';
    const signedIn=this.hasSignedInAccount();
    const logo='./brand/lourex-logo.svg';
    const mobile=this.isMobileShell();

    return <div className={`workspace-shell fintech-shell-v280 ta-shell screen-${this.props.screen} ${editor?'is-editor':''}`}>
      {!editor?<aside className="workspace-sidebar ta-sidebar" aria-label={t('Main navigation','التنقل الرئيسي')}>
        <div className="ta-sidebar-brand-row">
          <button type="button" className="ta-brand-button" onClick={()=>this.navigate('home')} aria-label={t('Dashboard','لوحة التحكم')}>
            <Brand compact logoDataUrl={logo} language={this.props.language}/>
            <span className="ta-brand-copy"><strong>LOUREX</strong><small>INVOICE</small></span>
          </button>
        </div>

        <div className="ta-sidebar-create">
          <Button icon="plus" variant="primary" className="ta-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="ta-desktop-create-menu" onClick={this.toggleCreate}>{t('New Document','مستند جديد')}</Button>
          {!mobile?this.createMenu('ta-desktop-create-menu','ta-create-menu-desktop'):null}
        </div>

        <nav className="ta-sidebar-nav">
          <section className="ta-nav-section"><p>{t('Workspace','مساحة العمل')}</p>
            {this.navItem('home','home',t('Dashboard','لوحة التحكم'))}
            {this.navItem('documents','file',t('Documents','المستندات'))}
            {this.navItem('customers','users',t('Customers','العملاء'))}
          </section>
          <section className="ta-nav-section"><p>{t('Business','الأعمال')}</p>
            {this.navItem('items','items',t('Products & Inventory','المنتجات والمخزون'))}
            {this.navItem('operations','backup',t('Purchasing','المشتريات'))}
          </section>
          <section className="ta-nav-section"><p>{t('Finance','المالية')}</p>
            {this.navItem('receivables','invoice',t('Finance','المالية'))}
            {this.navItem('reports','chart',t('Reports','التقارير'))}
          </section>
        </nav>

        <div className="ta-sidebar-footer">
          {this.syncStatus('ta-sidebar-sync')}
          <button type="button" className="ta-sidebar-utility" onClick={this.openSettings}><span className="ta-nav-icon"><Icon name="settings"/></span><span>{t('Settings','الإعدادات')}</span></button>
          <button type="button" className="ta-sidebar-account" onClick={this.openAccount}>
            <span className="ta-account-avatar"><Icon name="users"/></span>
            <span className="ta-account-copy"><strong>{t('Account','الحساب')}</strong><small>{t('Company profile','ملف الشركة')}</small></span>
            <span className="ta-sidebar-account-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      </aside>:null}

      <header className="workspace-topbar ta-topbar">
        <div className="ta-topbar-leading">
          <div className="ta-mobile-brand">
            {!editor?<button type="button" onClick={()=>this.navigate('home')} aria-label={t('Dashboard','لوحة التحكم')}><Brand compact logoDataUrl={logo} language={this.props.language}/></button>:<span className="ta-editor-mark"><Icon name="edit"/></span>}
          </div>
          <div className="ta-page-title"><small>{editor?t('Editing','تحرير'):t('Workspace','مساحة العمل')}</small><strong>{this.pageTitle()}</strong></div>
        </div>

        <div className="ta-topbar-actions">
          {!editor?<button type="button" className="ta-search-trigger" aria-label={t('Search LOUREX','بحث LOUREX')} title={t('Global search · Ctrl/⌘ K','البحث الشامل · Ctrl/⌘ K')} onClick={()=>window.dispatchEvent(new Event('lourex-global-search-open'))}><Icon name="search"/><span>{t('Search anything','ابحث في كل شيء')}</span><kbd>⌘K</kbd></button>:null}
          <ThemeControl compact language={this.props.language} className="ta-theme-control"/>
          {this.syncStatus('ta-topbar-sync')}
          {!editor?<button type="button" className="ta-topbar-account" aria-label={t('Account','الحساب')} onClick={this.openAccount}><span className="ta-account-avatar"><Icon name="users"/></span><span>{t('Account','الحساب')}</span></button>:null}
        </div>
      </header>

      <main className="workspace-content ta-main">{this.conflictBanner()}{this.props.children}</main>

      {!editor?<>
        {this.props.newMenu?<button type="button" className="ta-overlay-backdrop ta-create-backdrop" aria-label={t('Close new document menu','إغلاق قائمة المستند الجديد')} onClick={this.closeCreateMenu}/>:null}
        {this.props.newMenu&&mobile?this.createMenu('ta-mobile-create-menu','ta-create-menu-mobile'):null}

        {this.state.moreOpen?<>
          <button type="button" className="ta-overlay-backdrop ta-sheet-backdrop" aria-label={t('Close menu','إغلاق القائمة')} onClick={this.closeMore}/>
          <section className="ta-mobile-sheet" id="ta-mobile-more" role="dialog" aria-modal="true" aria-label={t('More','المزيد')} dir={this.props.language==='ar'?'rtl':'ltr'}>
            <div className="ta-sheet-handle" aria-hidden="true"/>
            <div className="ta-sheet-header">
              <div><small>{t('Workspace','مساحة العمل')}</small><strong>{t('More','المزيد')}</strong><span>{t('Business, finance and settings','الأعمال والمالية والإعدادات')}</span></div>
              <button type="button" className="ta-sheet-close" onClick={this.closeMore} aria-label={t('Close','إغلاق')}><Icon name="x"/></button>
            </div>
            <div className="ta-sheet-utilities">
              <ThemeControl language={this.props.language} className="ta-sheet-theme"/>
              {signedIn?<button type="button" className="ta-sheet-signout" disabled={this.state.signingOut} onClick={()=>void this.signOutFromMore()}><Icon name="lock"/><span>{this.state.signingOut?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</span></button>:null}
            </div>
            {this.syncStatus('ta-sheet-sync')}
            <button type="button" className="ta-sheet-account" onClick={this.openAccount}><span className="ta-sheet-link-icon"><Icon name="users"/></span><span className="ta-sheet-link-copy"><strong>{t('Account','الحساب')}</strong><small>{t('Company identity and account access','هوية الشركة وبيانات الحساب')}</small></span><span className="ta-sheet-chevron" aria-hidden="true">›</span></button>
            <section className="ta-sheet-group"><p>{t('Business','الأعمال')}</p>{this.mobileSheetItem('items','items',t('Products & Inventory','المنتجات والمخزون'),t('Products, stock and movement','المنتجات والمخزون والحركة'))}{this.mobileSheetItem('operations','backup',t('Purchasing','المشتريات'),t('Suppliers and purchase workflow','الموردون ودورة المشتريات'))}</section>
            <section className="ta-sheet-group"><p>{t('Finance & analysis','المالية والتحليل')}</p>{this.mobileSheetItem('receivables','invoice',t('Finance','المالية'),t('Receivables, collections and expenses','المستحقات والتحصيل والمصروفات'))}{this.mobileSheetItem('reports','chart',t('Reports','التقارير'),t('Business and financial analysis','تحليل الأعمال والنتائج المالية'))}</section>
            <section className="ta-sheet-group"><p>{t('System','النظام')}</p><button type="button" className="ta-sheet-link" onClick={this.openSettings}><span className="ta-sheet-link-icon"><Icon name="settings"/></span><span className="ta-sheet-link-copy"><strong>{t('Settings','الإعدادات')}</strong><small>{t('Workspace, documents and security','مساحة العمل والمستندات والأمان')}</small></span><span className="ta-sheet-chevron" aria-hidden="true">›</span></button></section>
          </section>
        </>:null}

        <nav className="ta-mobile-nav" aria-label={t('Mobile navigation','تنقل الجوال')}>
          <button type="button" className={this.props.screen==='home'?'is-active':''} aria-current={this.props.screen==='home'?'page':undefined} onClick={()=>this.navigate('home')}><Icon name="home"/><span>{t('Home','الرئيسية')}</span></button>
          <button type="button" className={this.props.screen==='documents'?'is-active':''} aria-current={this.props.screen==='documents'?'page':undefined} onClick={()=>this.navigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
          <div className="ta-mobile-create-wrap">
            <button type="button" className="ta-mobile-create" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="ta-mobile-create-menu" aria-label={t('New Document','مستند جديد')} onClick={this.toggleCreate}><Icon name="plus" size={24}/></button>
          </div>
          <button type="button" className={this.props.screen==='customers'?'is-active':''} aria-current={this.props.screen==='customers'?'page':undefined} onClick={()=>this.navigate('customers')}><Icon name="users"/><span>{t('Customers','العملاء')}</span></button>
          <button type="button" className={this.state.moreOpen?'is-active':''} aria-haspopup="dialog" aria-controls="ta-mobile-more" aria-expanded={this.state.moreOpen} onClick={this.toggleMore}><Icon name="more"/><span>{t('More','المزيد')}</span></button>
        </nav>
      </>:null}

      <AiCopilot screen={this.props.screen} language={this.props.language} activeDocument={this.activeEditorDocument()} onNavigate={screen=>this.navigate(screen)}/>
    </div>;
  }
}
