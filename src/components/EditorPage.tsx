import { DraftDocumentEditor } from './DraftDocumentEditor.js';
import { isLetterDocument } from '../lib/document-extras.js';
import { documentCanConvertToInvoice } from '../lib/document-kinds.js';
import type { AppSettings, CompanySettings, Customer, DocumentEventRecord, DocumentItem, DocumentRevisionRecord, LourexDocument, PaymentRecord, SavedItem, Supplier } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';
import { InvoicePaymentsPanel } from './InvoicePaymentsPanel.js';
import { DocumentLifecyclePanel } from './DocumentLifecyclePanel.js';
import { ProfitabilityPanel } from './ProfitabilityPanel.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; suppliers:Supplier[]; company:CompanySettings; savedItems:SavedItem[]; payments:PaymentRecord[]; documentEvents:DocumentEventRecord[]; documentRevisions:DocumentRevisionRecord[]; smartDefaults:AppSettings['smartDefaults'];
  onEditActivity?:()=>void; onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onUseSavedItems:(items:SavedItem[])=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onSavePayment:(payment:PaymentRecord)=>Promise<void>; onDeletePayment:(payment:PaymentRecord)=>Promise<void>; onBeginRevision:(doc:LourexDocument)=>Promise<LourexDocument>; onDiscardRevision:(doc:LourexDocument)=>Promise<void>; onVoidDocument:(doc:LourexDocument,reason:string)=>Promise<void>; onCreateCreditNote:(doc:LourexDocument)=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>Promise<void>;
}

interface EditorSectionNavItem {id:string;number:string;label:string;hasError:boolean;}
interface State {sections:EditorSectionNavItem[];activeSectionId:string;persistenceError:string;}

/**
 * v320 Document Studio orchestration shell.
 *
 * Reliability-critical editing behavior remains delegated to the established
 * EditorPageCore. This wrapper owns the new TailAdmin workspace frame, editor
 * step navigation, final-quote conversion affordance and single-flight guards.
 */
export class EditorPage extends React.Component<Props,State>{
  private static readonly activeEditorAttribute='data-lourex-document-editor';
  private resetFrame:number|undefined;
  private resetTimer:number|undefined;
  private navFrame:number|undefined;
  private navSetupTimer:number|undefined;
  private navMutationObserver:MutationObserver|undefined;
  private navScrollRoot:HTMLElement|null=null;
  private initialDraftPersisted=false;
  private quoteConversionRunning=false;
  private outputPromise:Promise<void>|null=null;
  private customerSavePromise:Promise<void>|null=null;
  private documentItemSavePromises=new Map<string,Promise<void>>();
  private revisionPromise:Promise<LourexDocument>|null=null;
  private lifecyclePromises=new Map<string,Promise<void>>();
  private mounted=false;

  constructor(props:Props){super(props);this.state={sections:[],activeSectionId:'',persistenceError:''};}

  componentDidMount():void{
    this.mounted=true;
    document.documentElement.setAttribute(EditorPage.activeEditorAttribute,this.props.document.id);
    this.ensureInitialDraftPersisted();
    this.resetScroll();
    this.scheduleSectionNavigationSetup();
  }

  componentDidUpdate(prevProps:Props):void{
    if(prevProps.document.id!==this.props.document.id){
      document.documentElement.setAttribute(EditorPage.activeEditorAttribute,this.props.document.id);
      this.initialDraftPersisted=false;
      this.quoteConversionRunning=false;
      this.ensureInitialDraftPersisted();
      this.resetScroll();
      this.scheduleSectionNavigationSetup();
    }
  }

  componentWillUnmount():void{
    this.mounted=false;
    if(document.documentElement.getAttribute(EditorPage.activeEditorAttribute)===this.props.document.id)document.documentElement.removeAttribute(EditorPage.activeEditorAttribute);
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
    if(this.navFrame!==undefined)window.cancelAnimationFrame(this.navFrame);
    if(this.navSetupTimer!==undefined)window.clearTimeout(this.navSetupTimer);
    this.teardownSectionNavigation();
  }

  private resetScroll=()=>{
    const reset=()=>{
      window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;
      document.querySelectorAll<HTMLElement>('.editor-main,.editor-screen,.editor-layout,.editor-pane,.editor-scroll,.app-main,.workspace,.ta-editor-workspace').forEach(node=>{node.scrollTop=0;node.scrollLeft=0;});
    };
    reset();
    if(this.resetFrame!==undefined)window.cancelAnimationFrame(this.resetFrame);
    if(this.resetTimer!==undefined)window.clearTimeout(this.resetTimer);
    this.resetFrame=window.requestAnimationFrame(reset);
    this.resetTimer=window.setTimeout(reset,80);
  };

  private getEditorSections=():HTMLElement[]=>Array.from(document.querySelectorAll<HTMLElement>('.editor-pane .editor-form-lock > .editor-section'));
  private sectionId=(index:number)=>`editor-step-${this.props.document.id.replace(/[^a-zA-Z0-9_-]/g,'-')}-${index+1}`;

  private readSectionMeta=():EditorSectionNavItem[]=>this.getEditorSections().map((node,index)=>{
    const id=this.sectionId(index);
    const number=node.querySelector('.section-heading span')?.textContent?.trim()||String(index+1).padStart(2,'0');
    const label=node.querySelector('.section-heading h2')?.textContent?.trim()||t(`Section ${index+1}`,`القسم ${index+1}`);
    node.id=id;node.dataset.editorStep=number;
    return{id,number,label,hasError:node.classList.contains('section-has-error')||Boolean(node.querySelector('.field-error,.inline-error'))};
  });

  private sameSectionMeta=(a:EditorSectionNavItem[],b:EditorSectionNavItem[])=>a.length===b.length&&a.every((item,index)=>{
    const other=b[index];return Boolean(other&&item.id===other.id&&item.number===other.number&&item.label===other.label&&item.hasError===other.hasError);
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
    const sections=this.getEditorSections();const first=sections[0];if(!first)return;
    const rootTop=this.navScrollRoot?.getBoundingClientRect().top??0;
    const anchor=rootTop+Math.min(150,Math.max(88,window.innerHeight*.18));
    let active:HTMLElement=first;
    for(const section of sections){if(section.getBoundingClientRect().top<=anchor)active=section;else break;}
    if(active.id&&active.id!==this.state.activeSectionId)this.setState({activeSectionId:active.id});
  };

  private handleSectionScroll=()=>{
    if(this.navFrame!==undefined)return;
    this.navFrame=window.requestAnimationFrame(()=>{this.navFrame=undefined;this.syncActiveSection();});
  };

  private teardownSectionNavigation=()=>{
    this.navMutationObserver?.disconnect();this.navMutationObserver=undefined;
    if(this.navScrollRoot)this.navScrollRoot.removeEventListener('scroll',this.handleSectionScroll);else window.removeEventListener('scroll',this.handleSectionScroll);
    window.removeEventListener('resize',this.handleSectionScroll);this.navScrollRoot=null;
  };

  private setupSectionNavigation=()=>{
    this.teardownSectionNavigation();this.syncSectionMeta();this.navScrollRoot=this.resolveScrollRoot();
    if(this.navScrollRoot)this.navScrollRoot.addEventListener('scroll',this.handleSectionScroll,{passive:true});else window.addEventListener('scroll',this.handleSectionScroll,{passive:true});
    window.addEventListener('resize',this.handleSectionScroll,{passive:true});
    const form=document.querySelector('.editor-pane .editor-form-lock');
    if(form){this.navMutationObserver=new MutationObserver(()=>this.syncSectionMeta());this.navMutationObserver.observe(form,{attributes:true,subtree:true,attributeFilter:['class']});}
    this.syncActiveSection();
  };

  private scheduleSectionNavigationSetup=()=>{
    if(this.navSetupTimer!==undefined)window.clearTimeout(this.navSetupTimer);
    this.navSetupTimer=window.setTimeout(()=>{this.navSetupTimer=undefined;this.setupSectionNavigation();},0);
  };

  private scrollToSection=(id:string)=>{
    const section=document.getElementById(id);if(!section)return;
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
    section.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
    this.setState({activeSectionId:id});
    window.setTimeout(()=>this.syncActiveSection(),reduceMotion?0:360);
  };

  private withLatestInternalCosts=(doc:LourexDocument):LourexDocument=>{
    const latest=this.props.document;if(latest.id!==doc.id)return doc;
    const latestCosts=new Map(latest.items.map(item=>[item.id,item.unitCost??'']));
    return{...doc,items:doc.items.map(item=>({...item,unitCost:latestCosts.has(item.id)?(latestCosts.get(item.id)??''):(item.unitCost??'')})),internalCosts:{shippingCost:latest.internalCosts?.shippingCost??doc.internalCosts?.shippingCost??'0.00',otherCost:latest.internalCosts?.otherCost??doc.internalCosts?.otherCost??'0.00'}};
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

  private printWithPreparedMode=(doc:LourexDocument,mode:'print'|'pdf'|'share'):Promise<void>=>{
    if(this.outputPromise)return this.outputPromise;
    const operation=(async()=>{
      try{(window as any).__LOUREX_PREPARE_PDF__?.(mode);}catch{}
      const outputDocument=doc.attachments?.length?{...doc,attachments:[]}:doc;
      await this.props.onPrint(outputDocument,mode);
    })().finally(()=>{if(this.outputPromise===operation)this.outputPromise=null;});
    this.outputPromise=operation;return operation;
  };

  private saveCustomerSingleFlight=(customer:Customer):Promise<void>=>{
    if(this.customerSavePromise)return this.customerSavePromise;
    const operation=Promise.resolve(this.props.onSaveCustomer(customer)).finally(()=>{if(this.customerSavePromise===operation)this.customerSavePromise=null;});
    this.customerSavePromise=operation;return operation;
  };

  private saveDocumentItemSingleFlight=(item:DocumentItem,currency:string):Promise<void>=>{
    const existing=this.documentItemSavePromises.get(item.id);if(existing)return existing;
    const operation=Promise.resolve(this.props.onSaveDocumentItem(item,currency)).finally(()=>{if(this.documentItemSavePromises.get(item.id)===operation)this.documentItemSavePromises.delete(item.id);});
    this.documentItemSavePromises.set(item.id,operation);return operation;
  };

  private beginRevisionSingleFlight=(doc:LourexDocument):Promise<LourexDocument>=>{
    if(this.revisionPromise)return this.revisionPromise;
    const operation=Promise.resolve(this.props.onBeginRevision(doc)).finally(()=>{if(this.revisionPromise===operation)this.revisionPromise=null;});
    this.revisionPromise=operation;return operation;
  };

  private lifecycleSingleFlight=(key:'discard'|'void'|'credit',action:()=>Promise<void>):Promise<void>=>{
    const existing=this.lifecyclePromises.get(key);if(existing)return existing;
    const operation=Promise.resolve().then(action).finally(()=>{if(this.lifecyclePromises.get(key)===operation)this.lifecyclePromises.delete(key);});
    this.lifecyclePromises.set(key,operation);return operation;
  };
  private discardRevisionSingleFlight=(doc:LourexDocument)=>this.lifecycleSingleFlight('discard',()=>this.props.onDiscardRevision(doc));
  private voidDocumentSingleFlight=(doc:LourexDocument,reason:string)=>this.lifecycleSingleFlight('void',()=>this.props.onVoidDocument(doc,reason));
  private createCreditNoteSingleFlight=(doc:LourexDocument)=>this.lifecycleSingleFlight('credit',()=>this.props.onCreateCreditNote(doc));

  private convertFinalQuote=()=>{
    if(this.quoteConversionRunning)return;
    this.quoteConversionRunning=true;
    void Promise.resolve(this.props.onConvert(this.props.document)).finally(()=>{this.quoteConversionRunning=false;});
  };

  private ensureInitialDraftPersisted=()=>{
    const doc=this.props.document;
    if(doc.status==='final'||this.props.documents.some(item=>item.id===doc.id)){this.initialDraftPersisted=true;return;}
    if(this.initialDraftPersisted)return;
    this.initialDraftPersisted=true;
    void this.saveWithProtectedRetry(doc,true).then(()=>{if(this.mounted&&this.state.persistenceError)this.setState({persistenceError:''});}).catch(e=>{
      this.initialDraftPersisted=false;
      if(!this.mounted)return;
      this.setState({persistenceError:e instanceof Error?e.message:t('Unable to save the new draft locally.','تعذر حفظ المسودة الجديدة محليًا.')});
    });
  };

  private renderSectionNavigator=():any=>{
    const sections=this.state.sections;
    if(!sections.length)return null;
    return <nav className="ta-editor-step-nav" aria-label={t('Document editing steps','مراحل تحرير المستند')}>
      <div className="ta-editor-step-nav-heading"><small>{t('Document Studio','استوديو المستند')}</small><strong>{t('Editing steps','مراحل التحرير')}</strong></div>
      <div className="ta-editor-step-list">{sections.map(section=>{
        const active=section.id===this.state.activeSectionId;
        const attention=section.hasError?t(' — needs attention',' — يحتاج مراجعة'):'';
        return <button type="button" key={section.id} className={`${active?'is-active':''} ${section.hasError?'has-error':''}`} aria-current={active?'step':undefined} aria-label={`${section.number} ${section.label}${attention}`} onClick={()=>this.scrollToSection(section.id)}>
          <span className="ta-editor-step-number">{section.number}</span><span className="ta-editor-step-label">{section.label}</span>{section.hasError?<span className="ta-editor-step-error" aria-hidden="true">!</span>:null}
        </button>;
      })}</div>
      <span className="ta-editor-step-live" aria-live="polite">{sections.find(section=>section.id===this.state.activeSectionId)?.label||''}</span>
    </nav>;
  };

  private renderQuoteAction=(linkedInvoice:LourexDocument|undefined,sourceIsProformaInvoice:boolean):any=>{
    if(linkedInvoice)return <div className="ta-editor-convert-card is-complete" role="status"><span className="ta-editor-convert-icon"><Icon name="check" size={18}/></span><div><strong>{sourceIsProformaInvoice?t('Commercial Invoice already created','تم إنشاء الفاتورة التجارية'):t('Invoice already created','تم إنشاء الفاتورة')}</strong><small>{t(`Linked invoice: ${linkedInvoice.number}. Cancel that invoice before creating a replacement.`,`الفاتورة المرتبطة: ${linkedInvoice.number}. ألغِ تلك الفاتورة قبل إنشاء بديل.`)}</small></div></div>;
    return <div className="ta-editor-convert-card" role="region" aria-label={t('Final document conversion','تحويل المستند النهائي')}><span className="ta-editor-convert-icon"><Icon name="invoice" size={18}/></span><div><strong>{sourceIsProformaInvoice?t('Ready for the Commercial Invoice?','جاهز لإنشاء الفاتورة التجارية؟'):t('Deal confirmed? Create the invoice.','تم تأكيد الصفقة؟ أنشئ الفاتورة.')}</strong><small>{sourceIsProformaInvoice?t('The Proforma Invoice stays Final and unchanged. A new Commercial Invoice gets its own number.','تبقى الفاتورة المبدئية نهائية دون تغيير، ويتم إنشاء فاتورة تجارية جديدة برقم مستقل.'):t('The quote stays Final and unchanged. A new invoice is created with its own number.','يبقى عرض السعر نهائيًا دون تغيير، ويتم إنشاء فاتورة جديدة برقم مستقل.')}</small></div><Button icon="invoice" variant="primary" onClick={this.convertFinalQuote}>{sourceIsProformaInvoice?t('Create Commercial Invoice','إنشاء فاتورة تجارية'):t('Create Invoice','إنشاء فاتورة')}</Button></div>;
  };

  render():any{
    const props=this.props;
    if(isLetterDocument(props.document))return <div className="ta-editor-workspace ta-draft-studio-workspace"><DraftDocumentEditor key={props.document.id} document={props.document} company={props.company} onClose={props.onClose} onSave={this.saveWithProtectedRetry} onPrint={this.printWithPreparedMode} onEditActivity={props.onEditActivity}/></div>;

    const finalQuote=documentCanConvertToInvoice(props.document.kind)&&props.document.status==='final'&&props.document.lifecycleStatus!=='voided';
    const sourceIsProformaInvoice=props.document.kind==='proforma-invoice';
    const linkedInvoice=finalQuote?props.documents.find(item=>item.kind==='invoice'&&item.role==='standard'&&item.convertedFromId===props.document.id&&item.lifecycleStatus!=='voided'):undefined;
    const navSlot=typeof document==='undefined'?null:document.querySelector('[data-editor-nav-slot]');
    const editorScreen=typeof document==='undefined'?null:document.querySelector('.editor-screen');
    const sectionNavigator=this.renderSectionNavigator();
    const finalQuoteAction=finalQuote?this.renderQuoteAction(linkedInvoice,sourceIsProformaInvoice):null;

    return <div className="ta-editor-workspace" data-v320-editor="true">
      {this.state.persistenceError?<div className="ta-editor-persistence-error" role="alert"><span className="ta-editor-error-icon">!</span><div><strong>{t('Local save needs attention','الحفظ المحلي يحتاج انتباهك')}</strong><span>{this.state.persistenceError}</span></div></div>:null}
      <div className="ta-editor-core-slot"><EditorPageCore key={props.document.id} {...props} onSave={this.saveWithProtectedRetry} onSaveCustomer={this.saveCustomerSingleFlight} onSaveDocumentItem={this.saveDocumentItemSingleFlight} onBeginRevision={this.beginRevisionSingleFlight} onPrint={this.printWithPreparedMode}/></div>
      <div className="ta-editor-support-panels"><DocumentLifecyclePanel document={props.document} documents={props.documents} payments={props.payments} events={props.documentEvents} revisions={props.documentRevisions} onDiscardRevision={this.discardRevisionSingleFlight} onVoid={this.voidDocumentSingleFlight} onCreateCreditNote={this.createCreditNoteSingleFlight}/>{props.document.kind==='invoice'?<InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments} onSave={props.onSavePayment} onDelete={props.onDeletePayment}/>:null}{(props.document.kind==='proforma'||props.document.kind==='proforma-invoice'||props.document.kind==='invoice')?<ProfitabilityPanel document={props.document} savedItems={props.savedItems} onSave={props.onSave} onSaveSavedItem={props.onSaveSavedItem}/>:null}</div>
      {sectionNavigator&&navSlot?ReactDOM.createPortal(sectionNavigator,navSlot):null}
      {finalQuoteAction&&editorScreen?ReactDOM.createPortal(finalQuoteAction,editorScreen):null}
    </div>;
  }
}
