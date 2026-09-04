import type { DocumentKind, UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { Brand, Button, Icon } from './UI.js';

export type WorkspaceScreen='home'|'documents'|'customers'|'receivables'|'reports'|'items'|'operations'|'editor';

type CloudState='local'|'queued'|'syncing'|'synced'|'offline'|'error';

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

export class AppShell extends React.Component<Props,State>{
  state:State={moreOpen:false};

  componentDidUpdate(prev:Props):void{
    if(prev.screen!==this.props.screen&&this.state.moreOpen)this.setState({moreOpen:false});
  }

  private navigate=(screen:NavTarget)=>{this.setState({moreOpen:false});this.props.onNavigate(screen);};

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

  private createMenu=(id:string,className:string)=>this.props.newMenu?<div className={`new-menu shell-new-menu ${className}`} id={id} role="menu" aria-label={t('New Document','مستند جديد')}>
    <button type="button" role="menuitem" onClick={()=>this.props.onNew('proforma')}><Icon name="proforma"/><span><strong>{t('Quotation','عرض سعر')}</strong><small>{t('Commercial quotation','عرض تجاري')}</small></span></button>
    <button type="button" role="menuitem" onClick={()=>this.props.onNew('invoice')}><Icon name="invoice"/><span><strong>{t('Invoice','فاتورة')}</strong><small>{t('Final invoice','فاتورة نهائية')}</small></span></button>
  </div>:null;

  render():any{
    const editor=this.props.screen==='editor';
    return <div className={`workspace-shell ${editor?'is-editor':''}`}>
      {!editor?<aside className="workspace-sidebar" aria-label={t('Main navigation','التنقل الرئيسي')}>
        <button type="button" className="shell-brand-button" onClick={()=>this.navigate('home')}><Brand compact logoDataUrl={this.props.logoDataUrl} language={this.props.language}/></button>
        <div className="new-doc-menu shell-create-wrap">
          <Button icon="plus" variant="primary" className="shell-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="desktop-new-document-menu" onClick={this.props.onToggleNew}>{t('New Document','مستند جديد')}</Button>
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
          <button type="button" className={`shell-account-row state-${this.props.cloudState}`} title={this.props.cloudMessage||this.props.cloudLabel} onClick={this.props.onCloud}><span className="shell-status-dot"/><span><small>{t('Account & cloud','الحساب والسحابة')}</small><strong>{this.props.cloudLabel}</strong></span></button>
          <button type="button" className="shell-settings-row" onClick={this.props.onSettings}><Icon name="settings"/><span>{t('Settings','الإعدادات')}</span></button>
        </div>
      </aside>:null}

      <header className="workspace-topbar">
        <div className="shell-mobile-brand">{!editor?<button type="button" onClick={()=>this.navigate('home')}><Brand compact logoDataUrl={this.props.logoDataUrl} language={this.props.language}/></button>:<span className="editor-context-mark"><Icon name="edit"/></span>}</div>
        <div className="shell-page-title"><small>{editor?t('Editing','تحرير'):t('LOUREX Invoice','LOUREX Invoice')}</small><strong>{this.pageTitle()}</strong></div>
        <button type="button" className={`shell-sync-status state-${this.props.cloudState}`} title={this.props.cloudMessage||this.props.cloudLabel} onClick={this.props.onCloud}><span className="shell-status-dot"/><span>{this.props.cloudLabel}</span></button>
      </header>

      <div className="workspace-content">{this.props.children}</div>

      {!editor?<>
        {this.state.moreOpen?<><button type="button" className="mobile-more-backdrop" aria-label={t('Close menu','إغلاق القائمة')} onClick={()=>this.setState({moreOpen:false})}/><section className="mobile-more-sheet" aria-label={t('More','المزيد')}>
          <div className="mobile-more-handle"/>
          <div className="mobile-more-heading"><div><small>{t('Workspace','مساحة العمل')}</small><strong>{t('More','المزيد')}</strong></div><button type="button" onClick={()=>this.setState({moreOpen:false})} aria-label={t('Close','إغلاق')}><Icon name="x"/></button></div>
          <button type="button" className={`mobile-more-account state-${this.props.cloudState}`} onClick={this.props.onCloud}><span className="shell-status-dot"/><span><small>{t('Account & cloud','الحساب والسحابة')}</small><strong>{this.props.cloudLabel}</strong></span></button>
          <div className="mobile-more-group"><p>{t('Workspace','مساحة العمل')}</p>{this.navButton('items','items',t('Items','الأصناف'))}</div>
          <div className="mobile-more-group"><p>{t('Finance','المالية')}</p>{this.navButton('receivables','invoice',t('Receivables','المستحقات'))}{this.navButton('reports','file',t('Reports','التقارير'))}</div>
          <div className="mobile-more-group"><p>{t('Business','الأعمال')}</p>{this.navButton('operations','backup',t('Operations','العمليات'))}</div>
          <button type="button" className="mobile-more-settings" onClick={()=>{this.setState({moreOpen:false});this.props.onSettings();}}><Icon name="settings"/><span>{t('Settings','الإعدادات')}</span></button>
        </section></>:null}
        <nav className="mobile-bottom-nav" aria-label={t('Mobile navigation','تنقل الجوال')}>
          <button type="button" className={this.props.screen==='home'?'active':''} aria-current={this.props.screen==='home'?'page':undefined} onClick={()=>this.navigate('home')}><Icon name="menu"/><span>{t('Home','الرئيسية')}</span></button>
          <button type="button" className={this.props.screen==='documents'?'active':''} aria-current={this.props.screen==='documents'?'page':undefined} onClick={()=>this.navigate('documents')}><Icon name="file"/><span>{t('Documents','المستندات')}</span></button>
          <div className="new-doc-menu mobile-create-wrap">
            <button type="button" className="mobile-create-button" aria-haspopup="menu" aria-expanded={this.props.newMenu} aria-controls="mobile-new-document-menu" aria-label={t('New Document','مستند جديد')} onClick={this.props.onToggleNew}><Icon name="plus" size={24}/></button>
            {this.createMenu('mobile-new-document-menu','mobile-shell-new-menu')}
          </div>
          <button type="button" className={this.props.screen==='customers'?'active':''} aria-current={this.props.screen==='customers'?'page':undefined} onClick={()=>this.navigate('customers')}><Icon name="users"/><span>{t('Customers','العملاء')}</span></button>
          <button type="button" className={this.state.moreOpen?'active':''} aria-expanded={this.state.moreOpen} onClick={()=>this.setState(state=>({moreOpen:!state.moreOpen}))}><Icon name="more"/><span>{t('More','المزيد')}</span></button>
        </nav>
      </>:null}
    </div>;
  }
}
