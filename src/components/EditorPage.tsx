import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onUseSavedItems:(items:SavedItem[])=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>void;
}

interface EditorSectionNavItem {
  id:string;
  number:string;
  label:string;
  hasError:boolean;
}

interface State {
  sections:EditorSectionNavItem[];
  activeSectionId:string;
}

// Keep the editor's internal draft state scoped to one document identity.
// A new invoice created from a proforma must mount a fresh editor instead of
// retaining the source document's local state.
export class EditorPage extends React.Component<Props,State>{
  private resetFrame:number|undefined;
  private resetTimer:number|undefined;
  private navFrame:number|undefined;
  private navSetupTimer:number|undefined;
  private navMutationObserver:MutationObserver|undefined;
  private navScrollRoot:HTMLElement|null=null;

  constructor(props:Props){
    super(props);
    this.state={sections:[],activeSectionId:''};
  }

  componentDidMount():void{
    this.resetScroll();
    this.scheduleSectionNavigationSetup();
  }

  componentDidUpdate(prevProps:Props):void{
    if(prevProps.document.id!==this.props.document.id){
      this.resetScroll();
      this.scheduleSectionNavigationSetup();
    }
  }

  componentWillUnmount():void{
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
    if(this.navFrame!==undefined)window.cancelAnimationFrame(this.navFrame);
    if(this.navSetupTimer!==undefined)window.clearTimeout(this.navSetupTimer);
    this.teardownSectionNavigation();
  }

  private resetScroll=()=>{
    const reset=()=>{
      window.scrollTo(0,0);
      document.documentElement.scrollTop=0;
      document.body.scrollTop=0;
      document.querySelectorAll<HTMLElement>('.editor-main,.editor-screen,.editor-layout,.editor-pane,.editor-scroll,.app-main,.workspace').forEach(node=>{node.scrollTop=0;node.scrollLeft=0;});
    };
    reset();
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
    this.resetFrame=window.requestAnimationFrame(reset);
    this.resetTimer=window.setTimeout(reset,80);
  };

  private getEditorSections=():HTMLElement[]=>Array.from(document.querySelectorAll<HTMLElement>('.editor-pane .editor-form-lock > .editor-section'));

  private sectionId=(index:number)=>{
    const documentId=this.props.document.id.replace(/[^a-zA-Z0-9_-]/g,'-');
    return `editor-step-${documentId}-${index+1}`;
  };

  private readSectionMeta=():EditorSectionNavItem[]=>this.getEditorSections().map((node,index)=>{
    const id=this.sectionId(index);
    const number=node.querySelector('.section-heading span')?.textContent?.trim()||String(index+1).padStart(2,'0');
    const label=node.querySelector('.section-heading h2')?.textContent?.trim()||t(`Section ${index+1}`,`القسم ${index+1}`);
    node.id=id;
    node.dataset.editorStep=number;
    return {
      id,
      number,
      label,
      hasError:node.classList.contains('section-has-error')||Boolean(node.querySelector('.field-error,.inline-error'))
    };
  });

  private sameSectionMeta=(a:EditorSectionNavItem[],b:EditorSectionNavItem[])=>a.length===b.length&&a.every((item,index)=>{
    const other=b[index];
    return Boolean(other)&&item.id===other.id&&item.number===other.number&&item.label===other.label&&item.hasError===other.hasError;
  });

  private syncSectionMeta=()=>{
    const sections=this.readSectionMeta();
    if(this.sameSectionMeta(this.state.sections,sections))return;
    const activeStillExists=sections.some(section=>section.id===this.state.activeSectionId);
    this.setState({sections,activeSectionId:activeStillExists?this.state.activeSectionId:(sections[0]?.id||'')});
  };

  private resolveScrollRoot=():HTMLElement|null=>{
    const root=document.querySelector<HTMLElement>('.editor-pane .editor-scroll');
    if(!root)return null;
    const overflowY=window.getComputedStyle(root).overflowY;
    return /(auto|scroll)/.test(overflowY)&&root.scrollHeight>root.clientHeight+2?root:null;
  };

  private syncActiveSection=()=>{
    const sections=this.getEditorSections();
    if(!sections.length)return;
    const rootTop=this.navScrollRoot?.getBoundingClientRect().top??0;
    const anchor=rootTop+Math.min(150,Math.max(88,window.innerHeight*.18));
    let active=sections[0];
    for(const section of sections){
      if(section.getBoundingClientRect().top<=anchor)active=section;
      else break;
    }
    if(active.id&&active.id!==this.state.activeSectionId)this.setState({activeSectionId:active.id});
  };

  private handleSectionScroll=()=>{
    if(this.navFrame!==undefined)return;
    this.navFrame=window.requestAnimationFrame(()=>{
      this.navFrame=undefined;
      this.syncActiveSection();
    });
  };

  private teardownSectionNavigation=()=>{
    this.navMutationObserver?.disconnect();
    this.navMutationObserver=undefined;
    if(this.navScrollRoot)this.navScrollRoot.removeEventListener('scroll',this.handleSectionScroll);
    else window.removeEventListener('scroll',this.handleSectionScroll);
    window.removeEventListener('resize',this.handleSectionScroll);
    this.navScrollRoot=null;
  };

  private setupSectionNavigation=()=>{
    this.teardownSectionNavigation();
    this.syncSectionMeta();
    this.navScrollRoot=this.resolveScrollRoot();
    if(this.navScrollRoot)this.navScrollRoot.addEventListener('scroll',this.handleSectionScroll,{passive:true});
    else window.addEventListener('scroll',this.handleSectionScroll,{passive:true});
    window.addEventListener('resize',this.handleSectionScroll,{passive:true});
    const form=document.querySelector('.editor-pane .editor-form-lock');
    if(form){
      this.navMutationObserver=new MutationObserver(()=>this.syncSectionMeta());
      this.navMutationObserver.observe(form,{attributes:true,subtree:true,attributeFilter:['class']});
    }
    this.syncActiveSection();
  };

  private scheduleSectionNavigationSetup=()=>{
    if(this.navSetupTimer!==undefined)window.clearTimeout(this.navSetupTimer);
    this.navSetupTimer=window.setTimeout(()=>{
      this.navSetupTimer=undefined;
      this.setupSectionNavigation();
    },0);
  };

  private scrollToSection=(id:string)=>{
    const section=document.getElementById(id);
    if(!section)return;
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    section.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
    this.setState({activeSectionId:id});
    window.setTimeout(()=>this.syncActiveSection(),reduceMotion?0:360);
  };

  private saveWithProtectedRetry=async(doc:LourexDocument,auto?:boolean):Promise<void>=>{
    const deadline=Date.now()+12_000;
    for(;;){
      try{await this.props.onSave(doc,auto);return;}
      catch(e){
        const message=e instanceof Error?e.message:String(e??'');
        const protectedOperation=/protected data operation/i.test(message)||message.includes('عملية محمية');
        if(!protectedOperation||Date.now()>=deadline)throw e;
        await new Promise<void>(resolve=>window.setTimeout(resolve,150));
      }
    }
  };

  render():any{
    const props=this.props;
    const canConvertFinalQuote=props.document.kind==='proforma'&&props.document.status==='final';
    const sections=this.state.sections;
    return <>
      <EditorPageCore key={props.document.id} {...props} onSave={this.saveWithProtectedRetry}/>
      {sections.length?<nav className={`editor-section-navigator ${canConvertFinalQuote?'has-final-quote-action':''}`} aria-label={t('Invoice editing steps','مراحل تحرير الفاتورة')}>
        {sections.map(section=>{
          const active=section.id===this.state.activeSectionId;
          const attention=section.hasError?t(' — needs attention',' — يحتاج مراجعة'):'';
          return <button type="button" key={section.id} className={`editor-section-nav-button ${active?'active':''} ${section.hasError?'has-error':''}`} aria-current={active?'step':undefined} aria-label={`${section.number} ${section.label}${attention}`} onClick={()=>this.scrollToSection(section.id)}>
            <span className="editor-nav-number">{section.number}</span>
            <span className="editor-nav-label">{section.label}</span>
            {section.hasError?<span className="editor-nav-error-dot" aria-hidden="true">!</span>:null}
          </button>;
        })}
        <span className="editor-nav-live-status" aria-live="polite">{sections.find(section=>section.id===this.state.activeSectionId)?.label||''}</span>
      </nav>:null}
      {canConvertFinalQuote?<div className="final-quote-convert-bar" role="region" aria-label={t('Final quote actions','إجراءات عرض السعر النهائي')}>
        <div><Icon name="invoice" size={18}/><span><strong>{t('Deal confirmed? Create the invoice.','تم تأكيد الصفقة؟ أنشئ الفاتورة.')}</strong><small>{t('The quote stays Final and unchanged. A new invoice is created with its own number.','يبقى عرض السعر نهائيًا دون تغيير، ويتم إنشاء فاتورة جديدة برقم مستقل.')}</small></span></div>
        <Button icon="invoice" variant="primary" onClick={()=>void props.onConvert(props.document)}>{t('Create Invoice from Quote','إنشاء فاتورة من عرض السعر')}</Button>
      </div>:null}
    </>;
  }
}
