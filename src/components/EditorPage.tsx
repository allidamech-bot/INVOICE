import type { AppSettings, CompanySettings, Customer, DocumentEventRecord, DocumentItem, DocumentRevisionRecord, LourexDocument, PaymentRecord, SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';
import { InvoicePaymentsPanel } from './InvoicePaymentsPanel.js';
import { DocumentLifecyclePanel } from './DocumentLifecyclePanel.js';
import { ProfitabilityPanel } from './ProfitabilityPanel.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[]; documentEvents:DocumentEventRecord[]; documentRevisions:DocumentRevisionRecord[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onUseSavedItems:(items:SavedItem[])=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onSavePayment:(payment:PaymentRecord)=>Promise<void>; onDeletePayment:(payment:PaymentRecord)=>Promise<void>; onBeginRevision:(doc:LourexDocument)=>Promise<LourexDocument>; onDiscardRevision:(doc:LourexDocument)=>Promise<void>; onVoidDocument:(doc:LourexDocument,reason:string)=>Promise<void>; onCreateCreditNote:(doc:LourexDocument)=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>Promise<void>;
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
  persistenceError:string;
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
  private initialDraftPersisted=false;
  private quoteConversionRunning=false;
  private mounted=false;

  constructor(props:Props){
    super(props);
    this.state={sections:[],activeSectionId:'',persistenceError:''};
  }

  componentDidMount():void{
    this.mounted=true;
    this.ensureInitialDraftPersisted();
    this.resetScroll();
    this.scheduleSectionNavigationSetup();
  }

  componentDidUpdate(prevProps:Props):void{
    if(prevProps.document.id!==this.props.document.id){
      this.initialDraftPersisted=false;
      this.quoteConversionRunning=false;
      this.ensureInitialDraftPersisted();
      this.resetScroll();
      this.scheduleSectionNavigationSetup();
    }
  }

  componentWillUnmount():void{
    this.mounted=false;
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
    if(!other)return false;
    return item.id===other.id&&item.number===other.number&&item.label===other.label&&item.hasError===other.hasError;
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
    const first=sections[0];
    if(!first)return;
    const rootTop=this.navScrollRoot?.getBoundingClientRect().top??0;
    const anchor=rootTop+Math.min(150,Math.max(88,window.innerHeight*.18));
    let active:HTMLElement=first;
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
      // Validation state is reflected on section class names. Watching text and
      // child mutations made every controlled input update rescan the full form.
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

  // Internal cost metadata can be updated by the profitability panel while the
  // core editor still holds an older local draft. Merge the latest internal
  // fields into core saves so a later autosave can never erase cost data.
  private withLatestInternalCosts=(doc:LourexDocument):LourexDocument=>{
    const latest=this.props.document;
    if(latest.id!==doc.id)return doc;
    const latestCosts=new Map(latest.items.map(item=>[item.id,item.unitCost??'']));
    return {
      ...doc,
      items:doc.items.map(item=>({...item,unitCost:latestCosts.has(item.id)?(latestCosts.get(item.id)??''):(item.unitCost??'')})),
      internalCosts:{
        shippingCost:latest.internalCosts?.shippingCost??doc.internalCosts?.shippingCost??'0.00',
        otherCost:latest.internalCosts?.otherCost??doc.internalCosts?.otherCost??'0.00'
      }
    };
  };

  private saveWithProtectedRetry=async(doc:LourexDocument,auto?:boolean):Promise<void>=>{
    const deadline=Date.now()+12_000;
    for(;;){
      try{await this.props.onSave(this.withLatestInternalCosts(doc),auto);return;}
      catch(e){
        const message=e instanceof Error?e.message:String(e??'');
        const protectedOperation=/protected data operation/i.test(message)||message.includes('عملية محمية');
        if(!protectedOperation||Date.now()>=deadline)throw e;
        await new Promise<void>(resolve=>window.setTimeout(resolve,150));
      }
    }
  };

  private printWithPreparedMode=async(doc:LourexDocument,mode:'print'|'pdf'|'share'):Promise<void>=>{
    try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}
    await this.props.onPrint(doc,mode);
  };

  private convertFinalQuote=()=>{
    if(this.quoteConversionRunning)return;
    this.quoteConversionRunning=true;
    void Promise.resolve(this.props.onConvert(this.props.document)).finally(()=>{this.quoteConversionRunning=false;});
  };

  private ensureInitialDraftPersisted=()=>{
    const doc=this.props.document;
    if(doc.status==='final'||this.props.documents.some(item=>item.id===doc.id)){
      this.initialDraftPersisted=true;
      return;
    }
    if(this.initialDraftPersisted)return;
    this.initialDraftPersisted=true;
    void this.saveWithProtectedRetry(structuredClone(doc),true).then(()=>{
      if(this.mounted&&this.state.persistenceError)this.setState({persistenceError:''});
    }).catch(e=>{
      this.initialDraftPersisted=false;
      if(!this.mounted)return;
      this.setState({persistenceError:e instanceof Error?e.message:t('Unable to save the new draft locally.','تعذر حفظ المسودة الجديدة محليًا.')});
    });
  };

  render():any{
    const props=this.props;
    const finalQuote=props.document.kind==='proforma'&&props.document.status==='final'&&props.document.lifecycleStatus!=='voided';
    const linkedInvoice=finalQuote?props.documents.find(item=>item.kind==='invoice'&&item.role==='standard'&&item.convertedFromId===props.document.id&&item.lifecycleStatus!=='voided'):undefined;
    const canConvertFinalQuote=finalQuote&&!linkedInvoice;
    const sections=this.state.sections;
    const navSlot=typeof document==='undefined'?null:document.querySelector('[data-editor-nav-slot]');
    const sectionNavigator=sections.length?<nav className={`editor-section-navigator ${finalQuote?'has-final-quote-action':''}`} aria-label={t('Document editing steps','مراحل تحرير المستند')}>
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
    </nav>:null;
    return <>
      {this.state.persistenceError?<div className="editor-global-error" role="alert">{this.state.persistenceError}</div>:null}
      <EditorPageCore key={props.document.id} {...props} onSave={this.saveWithProtectedRetry} onPrint={this.printWithPreparedMode}/>
      <DocumentLifecyclePanel document={props.document} documents={props.documents} payments={props.payments} events={props.documentEvents} revisions={props.documentRevisions} onDiscardRevision={props.onDiscardRevision} onVoid={props.onVoidDocument} onCreateCreditNote={props.onCreateCreditNote}/>
      <InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>
      <ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>
      {sectionNavigator&&navSlot?ReactDOM.createPortal(sectionNavigator,navSlot):null}
      {finalQuote?(linkedInvoice?<div className="final-quote-convert-bar is-converted" role="status">
        <div><Icon name="check" size={18}/><span><strong>{t('Invoice already created from this quote.','تم إنشاء فاتورة من عرض السعر هذا بالفعل.')}</strong><small>{t(`Linked invoice: ${linkedInvoice.number}. Cancel that invoice before creating a replacement from this quote.`,`الفاتورة المرتبطة: ${linkedInvoice.number}. ألغِ تلك الفاتورة قبل إنشاء بديل من عرض السعر هذا.`)}</small></span></div>
      </div>:canConvertFinalQuote?<div className="final-quote-convert-bar" role="region" aria-label={t('Final quote actions','إجراءات عرض السعر النهائي')}>
        <div><Icon name="invoice" size={18}/><span><strong>{t('Deal confirmed? Create the invoice.','تم تأكيد الصفقة؟ أنشئ الفاتورة.')}</strong><small>{t('The quote stays Final and unchanged. A new invoice is created with its own number.','يبقى عرض السعر نهائيًا دون تغيير، ويتم إنشاء فاتورة جديدة برقم مستقل.')}</small></span></div>
        <Button icon="invoice" variant="primary" onClick={this.convertFinalQuote}>{t('Create Invoice from Quote','إنشاء فاتورة من عرض السعر')}</Button>
      </div>:null):null}
    </>;
  }
}
