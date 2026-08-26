import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, SavedItem, TemplateId } from '../types.js';
import { calculateTotals, formatMoney, lineTotal } from '../lib/money.js';
import { customerSnapshotFrom } from '../lib/defaults.js';
import { emptyItem, refreshCompanySnapshot, validateDocument } from '../lib/documents.js';
import { getDocumentReadiness } from '../lib/readiness.js';
import { documentQualityIssues } from '../lib/document-quality.js';
import { documentItemFromSavedItem, historySuggestions, savedItemSearchText, sortSavedItems } from '../lib/saved-items.js';
import { ARABIC_FONT_OPTIONS, LATIN_FONT_OPTIONS } from '../lib/appearance.js';
import { isArabic, t, translateValidation } from '../lib/i18n.js';
import { blankCustomer, CustomerForm } from './CustomersPage.js';
import { SavedItemsModal } from './SavedItemsModal.js';
import { DocumentReviewModal, type ReviewMode } from './DocumentReviewModal.js';
import { TemplateRenderer } from '../templates/TemplateRenderer.js';
import { TemplateThumbnails } from '../templates/TemplateThumbnails.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Textarea, Toggle } from './UI.js';

const currencyPresets=['USD','EUR','SAR','TRY','AED','GBP'];
const unitPresets=['PCS','Carton','Box','Pallet','KG','Unit','Set'];
const incoterms=['EXW','FCA','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>void;
}
interface State {
  doc:LourexDocument; errors:Record<string,string>; saving:boolean; saveState:'saved'|'saving'|'unsaved'; customerQuery:string; customerOpen:boolean;
  addCustomer:Customer|null; addCustomerError:string; mobilePreview:boolean; confirmClose:boolean; expandedItems:Record<string,boolean>;
  savedItemsOpen:boolean; suggestingItemId:string; advancedOpen:boolean; reviewMode:ReviewMode|null; issuing:boolean; unlockConfirm:boolean;
}

function draftWithLatestCompany(doc:LourexDocument,company:CompanySettings):LourexDocument{
  if(doc.status!=='draft')return structuredClone(doc);
  const hadSignature=Boolean(doc.companySnapshot.signatureDataUrl);
  const hadStamp=Boolean(doc.companySnapshot.stampDataUrl);
  const refreshed=refreshCompanySnapshot(structuredClone(doc),company);
  return {...refreshed,appearance:{...refreshed.appearance,showSignature:!hadSignature&&Boolean(company.signatureDataUrl)?true:refreshed.appearance.showSignature,showStamp:!hadStamp&&Boolean(company.stampDataUrl)?true:refreshed.appearance.showStamp}};
}

export class EditorPage extends React.Component<Props,State>{
  private autosaveTimer:number|undefined;
  private validationAttempted=false;

  constructor(props:Props){
    super(props);
    const initial=draftWithLatestCompany(props.document,props.company);
    this.state={doc:initial,errors:{},saving:false,saveState:'saved',customerQuery:(isArabic()?initial.customerSnapshot?.companyNameAr:initial.customerSnapshot?.companyNameEn)||initial.customerSnapshot?.companyNameEn||initial.customerSnapshot?.companyNameAr||'',customerOpen:false,addCustomer:null,addCustomerError:'',mobilePreview:false,confirmClose:false,expandedItems:{},savedItemsOpen:false,suggestingItemId:'',advancedOpen:false,reviewMode:null,issuing:false,unlockConfirm:false};
  }

  componentDidUpdate(prevProps:Props):void{if(prevProps.company!==this.props.company&&this.state.doc.status==='draft')this.mutate(doc=>draftWithLatestCompany(doc,this.props.company));}
  componentWillUnmount():void{if(this.autosaveTimer)clearTimeout(this.autosaveTimer);}

  private scrollToFirstError=()=>window.setTimeout(()=>{
    const marker=document.querySelector('.editor-pane .field-error, .editor-pane .inline-error');
    const target=marker?.closest('.field,.item-card,.editor-section') as HTMLElement|null;
    target?.scrollIntoView({behavior:'smooth',block:'center'});
    const input=target?.querySelector('input,select,textarea,button') as HTMLElement|null;
    input?.focus({preventScroll:true});
  },40);

  private validateCurrent=():boolean=>{
    const errors=validateDocument(this.state.doc);
    this.validationAttempted=true;
    if(Object.keys(errors).length){this.setState({errors,saveState:'unsaved'},this.scrollToFirstError);return false;}
    if(Object.keys(this.state.errors).length)this.setState({errors:{}});
    return true;
  };

  private mutate=(fn:(d:LourexDocument)=>LourexDocument)=>{
    if(this.state.doc.status==='final')return;
    const doc={...fn(this.state.doc),updatedAt:new Date().toISOString()};
    const errors=this.validationAttempted?validateDocument(doc):this.state.errors;
    this.setState({doc,saveState:'unsaved',errors},()=>this.schedule());
  };

  private schedule=()=>{if(this.autosaveTimer)clearTimeout(this.autosaveTimer);this.autosaveTimer=window.setTimeout(()=>void this.save(true),500);};

  private save=async(auto=false)=>{
    if(this.state.doc.status==='final')return;
    if(this.state.saving){if(auto)this.schedule();return;}
    const snapshot=structuredClone(this.state.doc);
    if(!auto){
      const errors=validateDocument(snapshot);
      this.validationAttempted=true;
      if(Object.keys(errors).length){this.setState({errors,saveState:'unsaved'},this.scrollToFirstError);return;}
    }
    this.setState({saving:true,saveState:'saving',errors:auto?this.state.errors:{}});
    try{
      await this.props.onSave(snapshot,auto);
      const hasNewerChanges=this.state.doc.updatedAt!==snapshot.updatedAt;
      this.setState({saving:false,saveState:hasNewerChanges?'unsaved':'saved'},()=>{if(hasNewerChanges)this.schedule();});
    }catch(e){this.setState({saving:false,saveState:'unsaved',errors:{...this.state.errors,global:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')}});}
  };

  private saveAndClose=async()=>{
    if(this.autosaveTimer)clearTimeout(this.autosaveTimer);
    if(this.state.doc.status==='final'||this.state.saveState==='saved'){this.props.onClose();return;}
    if(this.state.saving){window.setTimeout(()=>void this.saveAndClose(),100);return;}
    const snapshot=structuredClone(this.state.doc);
    this.setState({saving:true,saveState:'saving'});
    try{await this.props.onSave(snapshot,true);this.props.onClose();}
    catch(e){this.setState({saving:false,saveState:'unsaved',errors:{...this.state.errors,global:e instanceof Error?e.message:t('Save failed.','فشل الحفظ.')}});}
  };

  private openReview=(mode:ReviewMode)=>{if(this.validateCurrent())this.setState({reviewMode:mode});};
  private issueAndContinue=async()=>{
    const mode=this.state.reviewMode;if(!mode)return;
    const alreadyFinal=this.state.doc.status==='final';
    const finalDoc=alreadyFinal?structuredClone(this.state.doc):{...structuredClone(this.state.doc),status:'final' as const,updatedAt:new Date().toISOString()};
    this.setState({issuing:true});
    try{
      if(!alreadyFinal){await this.props.onSave(finalDoc,false);this.setState({doc:finalDoc,saveState:'saved'});}
      if(mode!=='issue')this.props.onPrint(finalDoc,mode);
      this.setState({reviewMode:null,issuing:false,doc:finalDoc,saveState:'saved'});
    }catch(e){this.setState({issuing:false,errors:{...this.state.errors,global:e instanceof Error?e.message:t('Unable to issue document.','تعذر إصدار المستند.')}});}
  };
  private unlockFinal=()=>{
    const doc={...structuredClone(this.state.doc),status:'draft' as const,updatedAt:new Date().toISOString()};
    this.setState({doc,unlockConfirm:false,saveState:'unsaved'},()=>this.schedule());
  };
  private convert=()=>{if(this.validateCurrent())void this.props.onConvert(this.state.doc);};
  private field=(key:keyof LourexDocument,value:any)=>this.mutate(d=>({...d,[key]:value}));
  private term=(key:keyof LourexDocument['terms'],value:string)=>this.mutate(d=>({...d,terms:{...d.terms,[key]:value}}));
  private adj=(key:keyof LourexDocument['adjustments'],value:any)=>this.mutate(d=>({...d,adjustments:{...d.adjustments,[key]:value}}));
  private appearance=(key:keyof LourexDocument['appearance'],value:any)=>this.mutate(d=>({...d,appearance:{...d.appearance,[key]:value}}));
  private item=(id:string,key:keyof DocumentItem,value:string)=>this.mutate(d=>({...d,items:d.items.map(i=>i.id===id?{...i,[key]:value}:i)}));
  private selectCustomer=(c:Customer)=>{this.mutate(d=>({...d,customerSnapshot:customerSnapshotFrom(c)}));this.setState({customerQuery:(isArabic()?c.companyNameAr:c.companyNameEn)||c.companyNameEn||c.companyNameAr,customerOpen:false});};
  private changeCustomer=()=>this.setState({customerQuery:'',customerOpen:true});
  private toggleItemDetails=(id:string)=>this.setState(state=>({expandedItems:{...state.expandedItems,[id]:!state.expandedItems[id]}}));
  private duplicateItem=(item:DocumentItem)=>this.mutate(doc=>{const clone=structuredClone(item);clone.id=emptyItem().id;const at=doc.items.findIndex(x=>x.id===item.id);const items=[...doc.items];items.splice(at+1,0,clone);return {...doc,items};});
  private addCustomer=async()=>{const c=this.state.addCustomer;if(!c)return;if(!c.companyNameEn.trim()&&!c.companyNameAr.trim()){this.setState({addCustomerError:t('Company name is required.','اسم الشركة مطلوب.')});return;}try{await this.props.onSaveCustomer(c);this.selectCustomer(c);this.setState({addCustomer:null,addCustomerError:''});}catch(e){this.setState({addCustomerError:e instanceof Error?e.message:t('Unable to save customer.','تعذر حفظ العميل.')});}};
  private suggestionItems=(item:DocumentItem):SavedItem[]=>{
    const q=(item.descriptionEn.trim()||item.descriptionAr.trim()).toLowerCase();if(!q)return [];
    const merged=[...sortSavedItems(this.props.savedItems),...historySuggestions(this.props.documents)];const seen=new Set<string>();
    return merged.filter(candidate=>{const key=(candidate.descriptionEn.trim().toLowerCase()||candidate.descriptionAr.trim());if(!key||seen.has(key)||!savedItemSearchText(candidate).includes(q))return false;seen.add(key);return true;}).slice(0,6);
  };
  private applySuggestion=(targetId:string,saved:SavedItem)=>{
    const price=saved.lastCurrency&&saved.lastCurrency!==this.state.doc.currency?'':saved.lastUnitPrice;
    this.mutate(doc=>({...doc,items:doc.items.map(item=>item.id===targetId?{...item,descriptionEn:saved.descriptionEn,descriptionAr:saved.descriptionAr,hsCode:saved.hsCode,origin:saved.origin,packing:saved.packing,unit:saved.unit||item.unit,unitPrice:price}:item)}));
    this.setState({suggestingItemId:'',expandedItems:{...this.state.expandedItems,[targetId]:Boolean(saved.hsCode||saved.origin||saved.packing)}});
  };
  private addSavedItem=(saved:SavedItem)=>{const item=documentItemFromSavedItem(saved);if(saved.lastCurrency&&saved.lastCurrency!==this.state.doc.currency)item.unitPrice='';this.mutate(doc=>({...doc,items:[...doc.items,item]}));this.setState({savedItemsOpen:false,suggestingItemId:''});};
  private toggleFavoriteTemplate=(id:TemplateId)=>{const current=this.props.smartDefaults.favoriteTemplateIds;const favoriteTemplateIds=current.includes(id)?current.filter(item=>item!==id):[id,...current];void this.props.onSaveSmartDefaults({...this.props.smartDefaults,favoriteTemplateIds});};
  private setCurrentTemplateDefault=()=>{const templateId=this.state.doc.appearance.templateId;const smart=this.state.doc.kind==='proforma'?{...this.props.smartDefaults,quoteTemplateId:templateId}:{...this.props.smartDefaults,invoiceTemplateId:templateId};void this.props.onSaveSmartDefaults(smart);};

  render():any{
    const d=this.state.doc,errors=this.state.errors,totals=calculateTotals(d.items,d.adjustments),readiness=getDocumentReadiness(d),locked=d.status==='final';
    const error=(key:string)=>errors[key]?translateValidation(errors[key]):undefined;
    const validationKeys=Object.keys(errors).filter(key=>key!=='global');const validationCount=validationKeys.length;
    const sectionHasError=(...prefixes:string[])=>validationKeys.some(key=>prefixes.some(prefix=>key===prefix||key.startsWith(prefix)));
    const itemHasError=(index:number)=>validationKeys.some(key=>key.startsWith(`item-${index}-`));
    const customers=this.props.customers.filter(c=>!this.state.customerQuery||c.companyNameEn.toLowerCase().includes(this.state.customerQuery.toLowerCase())||c.companyNameAr.includes(this.state.customerQuery)).slice(0,8);
    const recentCustomers=[...this.props.customers].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,4);
    const groupLabel=(key:string)=>key==='document'?t('Document','المستند'):key==='customer'?t('Customer','العميل'):key==='items'?t('Items','الأصناف'):t('Pricing','التسعير');
    const selectedCustomerName=(isArabic()?d.customerSnapshot?.companyNameAr:d.customerSnapshot?.companyNameEn)||d.customerSnapshot?.companyNameEn||d.customerSnapshot?.companyNameAr||'';
    const defaultTemplateId=d.kind==='proforma'?this.props.smartDefaults.quoteTemplateId:this.props.smartDefaults.invoiceTemplateId;
    const selectedIsDefault=defaultTemplateId===d.appearance.templateId;
    const workflow=locked?'final':readiness.ready?'ready':'draft';
    const quality=documentQualityIssues(d);

    return <div className={`editor-screen workflow-${workflow} ${this.state.mobilePreview?'mobile-preview-open':''}`}>
      <header className="editor-topbar">
        <div className="editor-top-left"><IconButton icon="arrowLeft" label={t('Back','رجوع')} onClick={()=>void this.saveAndClose()}/><div><strong>{d.number}</strong><span>{d.kind==='proforma'?t('Proforma Invoice','عرض سعر'):t('Invoice','فاتورة')}</span></div><span className={`editor-workflow-badge status-${workflow}`}>{workflow==='final'?t('Final','نهائي'):workflow==='ready'?t('Ready','جاهز'):t('Draft','مسودة')}</span></div>
        <div className="editor-grand-total-chip"><span>{t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div>
        <div className={`save-indicator state-${locked?'saved':this.state.saveState}`}>{locked?t('Final document locked','المستند النهائي مقفل'):this.state.saveState==='saving'?t('Saving draft…','جارٍ حفظ المسودة…'):this.state.saveState==='saved'?t('Draft auto-saved','تم حفظ المسودة تلقائيًا'):t('Unsaved changes','تغييرات غير محفوظة')}</div>
        <div className="editor-actions">
          <Button icon="eye" className="mobile-preview-button" onClick={()=>this.setState({mobilePreview:true})}>{t('Preview','معاينة')}</Button>
          <Button icon="printer" variant="ghost" onClick={()=>this.openReview('print')}>{t('Print','طباعة')}</Button>
          <Button icon="download" onClick={()=>this.openReview('pdf')}>PDF</Button>
          <Button icon="share" onClick={()=>this.openReview('share')}>{t('Share','مشاركة')}</Button>
          {locked?<Button icon="edit" onClick={()=>this.setState({unlockConfirm:true})}>{t('Unlock for editing','فتح للتعديل')}</Button>:readiness.ready?<Button icon="check" variant="primary" onClick={()=>this.openReview('issue')}>{t('Issue','إصدار')}</Button>:<Button icon="save" variant="primary" className={`save-now-button ${validationCount?'has-validation-errors':''}`} disabled={this.state.saving} onClick={()=>void this.save(false)}>{t('Save now','حفظ الآن')}</Button>}
        </div>
      </header>

      <div className={`document-readiness ${readiness.ready?'is-ready':''} ${locked?'is-final':''}`} aria-label={t('Document readiness','جاهزية المستند')}>
        <div className="readiness-copy"><span className="readiness-kicker">{locked?t('Final document','مستند نهائي'):t('Document readiness','جاهزية المستند')}</span><div><strong>{locked?'✓':`${readiness.percent}%`}</strong><span>{locked?t('Locked against accidental changes','مقفل ضد التغييرات غير المقصودة'):readiness.ready?t('Ready to issue','جاهز للإصدار'):t(`${readiness.remaining} required details remaining`,`متبقي ${readiness.remaining} من البيانات المطلوبة`)}</span></div></div>
        {!locked?<><div className="readiness-track"><span style={{width:`${readiness.percent}%`}}/></div><div className="readiness-groups">{readiness.groups.map(group=><span key={group.key} className={group.complete?'complete':''}><Icon name={group.complete?'check':'more'} size={14}/>{groupLabel(group.key)}</span>)}</div></>:null}
      </div>

      {locked?<div className="final-lock-banner"><Icon name="lock" size={18}/><div><strong>{t('This document is Final','هذا المستند نهائي')}</strong><span>{t('Editing is disabled until you explicitly unlock it. PDF, print and share remain available.','التعديل متوقف حتى تقوم بفتحه صراحةً. PDF والطباعة والمشاركة ما زالت متاحة.')}</span></div><Button icon="edit" onClick={()=>this.setState({unlockConfirm:true})}>{t('Unlock for editing','فتح للتعديل')}</Button></div>:null}
      {errors.global?<div className="editor-global-error">{errors.global}</div>:null}
      {validationCount&&!locked?<div className="editor-validation-summary" role="alert"><span className="validation-dot"/><div><strong>{t('Complete the required information','أكمل البيانات الإلزامية')}</strong><span>{t('Required fields are highlighted below. Fix them, then save again.','تم تحديد الحقول المطلوبة بالأسفل. أكملها ثم اضغط حفظ مرة أخرى.')}</span></div><b>{validationCount}</b></div>:null}

      <div className="editor-layout"><aside className="editor-pane"><div className="editor-scroll"><fieldset className="editor-form-lock" disabled={locked}>
        <section className={`editor-section ${sectionHasError('number','issueDate','dueDate','currency')?'section-has-error':''}`}><div className="section-heading"><span>01</span><h2>{t('Document','المستند')}</h2></div><div className="form-grid two compact-grid"><Field label={t('Number','الرقم')} className="required-field" error={error('number')}><Input value={d.number} onChange={(e:any)=>this.field('number',e.target.value)}/></Field><Field label={t('Issue Date','تاريخ الإصدار')} className="required-field" error={error('issueDate')}><Input type="date" value={d.issueDate} onChange={(e:any)=>this.field('issueDate',e.target.value)}/></Field><Field label={d.kind==='proforma'?t('Valid Until','صالح حتى'):t('Due Date','تاريخ الاستحقاق')} className={d.kind==='proforma'?'required-field':''} error={error('dueDate')}><Input type="date" value={d.dueDate} onChange={(e:any)=>this.field('dueDate',e.target.value)}/></Field><Field label={t('Currency','العملة')} className="required-field" error={error('currency')}><Input list="currencies" value={d.currency} onChange={(e:any)=>this.field('currency',e.target.value.toUpperCase())}/><datalist id="currencies">{currencyPresets.map(x=><option key={x} value={x}/>)}</datalist></Field><Field label={t('Document Language','لغة المستند')}><Select value={d.language} onChange={(e:any)=>this.field('language',e.target.value)}><option value="en">English</option><option value="ar">العربية</option><option value="bilingual">{t('Arabic + English','العربية + الإنجليزية')}</option></Select></Field></div></section>

        <section className={`editor-section customer-section ${sectionHasError('customer')?'section-has-error':''}`}><div className="section-heading"><span>02</span><h2>{t('Customer','العميل')}</h2></div>{d.customerSnapshot?<div className="selected-customer premium-selected-customer"><span className="customer-avatar"><Icon name="users" size={19}/></span><div><strong>{selectedCustomerName}</strong><span>{[d.customerSnapshot.city,d.customerSnapshot.country].filter(Boolean).join(', ')}</span><small>{[d.customerSnapshot.phone,d.customerSnapshot.email].filter(Boolean).join(' · ')}</small></div><Button variant="ghost" onClick={this.changeCustomer}>{t('Change','تغيير')}</Button></div>:null}{!d.customerSnapshot||this.state.customerOpen?<div className="customer-select-wrap"><Field label={t('Saved Customer','عميل محفوظ')} className="required-field" error={error('customer')}><div className="search-select"><Icon name="search"/><Input value={this.state.customerQuery} placeholder={t('Search customer','ابحث عن عميل')} onFocus={()=>this.setState({customerOpen:true})} onChange={(e:any)=>this.setState({customerQuery:e.target.value,customerOpen:true})}/></div></Field>{this.state.customerOpen?<div className="customer-dropdown">{customers.map(c=><button key={c.id} onClick={()=>this.selectCustomer(c)}><strong>{(isArabic()?c.companyNameAr:c.companyNameEn)||c.companyNameEn||c.companyNameAr}</strong><span>{[c.city,c.country].filter(Boolean).join(', ')}</span></button>)}<button className="new-customer-option" onClick={()=>this.setState({addCustomer:blankCustomer(),customerOpen:false})}><Icon name="plus"/>{t('New Customer','عميل جديد')}</button></div>:null}</div>:null}{!d.customerSnapshot&&recentCustomers.length?<div className="recent-customer-row"><span>{t('Quick select','اختيار سريع')}</span><div>{recentCustomers.map(c=><button key={c.id} type="button" onClick={()=>this.selectCustomer(c)}>{(isArabic()?c.companyNameAr:c.companyNameEn)||c.companyNameEn||c.companyNameAr}</button>)}</div></div>:null}</section>

        <section className={`editor-section ${sectionHasError('items','item-')?'section-has-error':''}`}><div className="section-heading with-action"><div><span>03</span><h2>{t('Items','الأصناف')}</h2></div><div className="section-heading-actions"><Button icon="file" variant="ghost" onClick={()=>this.setState({savedItemsOpen:true})}>{t('Saved Items','الأصناف المحفوظة')}</Button><Button icon="plus" className="add-item-button" onClick={()=>this.mutate(doc=>({...doc,items:[...doc.items,emptyItem()]}))}>{t('Add Item','إضافة صنف')}</Button></div></div>{error('items')?<div className="inline-error section-inline-error">{error('items')}</div>:null}<div className="item-cards">{d.items.map((i,index)=>{const expanded=Boolean(this.state.expandedItems[i.id]);const zeroPrice=i.unitPrice.trim()!==''&&Number(i.unitPrice)===0;const suggestions=this.state.suggestingItemId===i.id?this.suggestionItems(i):[];return <article className={`item-card premium-item-card ${itemHasError(index)?'item-has-error':''}`} key={i.id}><header><div><strong>{t(`Item ${index+1}`,`الصنف ${index+1}`)}</strong><span className="item-line-total">{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</span></div><div className="item-card-actions"><Button icon="save" variant="ghost" className="save-item-library-button" onClick={()=>void this.props.onSaveDocumentItem(i,d.currency)}>{t('Save item','حفظ الصنف')}</Button><IconButton icon="copy" label={t('Duplicate item','نسخ الصنف')} onClick={()=>this.duplicateItem(i)}/><IconButton icon="trash" label={t('Delete','حذف')} disabled={d.items.length===1} onClick={()=>this.mutate(doc=>({...doc,items:doc.items.filter(x=>x.id!==i.id)}))}/></div></header><div className="form-grid two compact-grid item-core-grid">{d.language!=='ar'?<div className="span-2 item-description-autocomplete"><Field label={t('Description English','الوصف بالإنجليزية')} className="required-field" error={error(`item-${index}-description`)}><Textarea rows="2" value={i.descriptionEn} onFocus={()=>this.setState({suggestingItemId:i.id})} onChange={(e:any)=>{this.item(i.id,'descriptionEn',e.target.value);this.setState({suggestingItemId:i.id});}}/></Field>{suggestions.length?<div className="item-suggestion-box">{suggestions.map(s=><button type="button" key={s.id} onClick={()=>this.applySuggestion(i.id,s)}><span><strong>{s.descriptionEn||s.descriptionAr}</strong>{s.descriptionAr&&s.descriptionEn?<small dir="rtl">{s.descriptionAr}</small>:null}</span><em>{[s.unit,s.lastUnitPrice?`${s.lastUnitPrice} ${s.lastCurrency}`:''].filter(Boolean).join(' · ')}</em></button>)}</div>:null}</div>:null}{d.language!=='en'?<div className="span-2 item-description-autocomplete"><Field label={t('Description Arabic','الوصف بالعربية')} className="required-field" error={d.language==='ar'?error(`item-${index}-description`):error(`item-${index}-description-ar`)}><Textarea dir="rtl" rows="2" value={i.descriptionAr} onFocus={()=>this.setState({suggestingItemId:i.id})} onChange={(e:any)=>{this.item(i.id,'descriptionAr',e.target.value);this.setState({suggestingItemId:i.id});}}/></Field>{d.language==='ar'&&suggestions.length?<div className="item-suggestion-box rtl-suggestions">{suggestions.map(s=><button type="button" key={s.id} onClick={()=>this.applySuggestion(i.id,s)}><span><strong>{s.descriptionAr||s.descriptionEn}</strong>{s.descriptionEn&&s.descriptionAr?<small>{s.descriptionEn}</small>:null}</span><em>{[s.unit,s.lastUnitPrice?`${s.lastUnitPrice} ${s.lastCurrency}`:''].filter(Boolean).join(' · ')}</em></button>)}</div>:null}</div>:null}<div className="item-pricing-grid span-2"><Field label={t('Quantity','الكمية')} className="required-field" error={error(`item-${index}-quantity`)}><Input inputMode="decimal" enterKeyHint="next" value={i.quantity} onChange={(e:any)=>this.item(i.id,'quantity',e.target.value)}/></Field><Field label={t('Unit','الوحدة')} className="required-field" error={error(`item-${index}-unit`)}><Input list="units" enterKeyHint="next" value={i.unit} onChange={(e:any)=>this.item(i.id,'unit',e.target.value)}/><datalist id="units">{unitPresets.map(x=><option key={x} value={x}/>)}</datalist></Field><Field label={t(`Unit Price (${d.currency})`,`سعر الوحدة (${d.currency})`)} className="required-field" error={error(`item-${index}-price`)}><Input inputMode="decimal" enterKeyHint="done" value={i.unitPrice} onChange={(e:any)=>this.item(i.id,'unitPrice',e.target.value)}/></Field></div>{zeroPrice?<div className="zero-price-warning span-2"><span>!</span>{t('Price is zero — confirm this before issuing the document.','السعر صفر — تأكد منه قبل إصدار المستند.')}</div>:null}<div className="item-advanced-control span-2"><button type="button" onClick={()=>this.toggleItemDetails(i.id)}><Icon name={expanded?'chevronUp':'chevronDown'} size={16}/>{expanded?t('Hide trade details','إخفاء التفاصيل التجارية'):t('More trade details','تفاصيل تجارية إضافية')}</button></div>{expanded?<div className="item-advanced-fields span-2"><Field label="HS Code"><Input value={i.hsCode} onChange={(e:any)=>this.item(i.id,'hsCode',e.target.value)}/></Field><Field label={t('Origin','المنشأ')}><Input value={i.origin} onChange={(e:any)=>this.item(i.id,'origin',e.target.value)}/></Field><Field label={t('Packing','التعبئة')}><Input value={i.packing} onChange={(e:any)=>this.item(i.id,'packing',e.target.value)}/></Field></div>:null}</div><footer><span>{t('Line Total','إجمالي السطر')}</span><strong>{formatMoney(lineTotal(i.quantity,i.unitPrice),d.currency)}</strong></footer></article>;})}</div></section>

        <section className={`editor-section ${sectionHasError('discount','shipping','otherCharges','tax')?'section-has-error':''}`}><div className="section-heading"><span>04</span><h2>{t('Totals','الإجماليات')}</h2></div><div className="adjustments-list"><div className={`adjustment-row ${error('discount')?'has-validation-error':''}`}><Toggle checked={d.adjustments.discountEnabled} onChange={v=>this.adj('discountEnabled',v)} label={t('Discount','خصم')}/>{d.adjustments.discountEnabled?<Input value={d.adjustments.discountValue} onChange={(e:any)=>this.adj('discountValue',e.target.value)}/>:null}{error('discount')?<span className="field-error adjustment-error">{error('discount')}</span>:null}</div><div className={`adjustment-row ${error('shipping')?'has-validation-error':''}`}><Toggle checked={d.adjustments.shippingEnabled} onChange={v=>this.adj('shippingEnabled',v)} label={t('Shipping','شحن')}/>{d.adjustments.shippingEnabled?<Input value={d.adjustments.shipping} onChange={(e:any)=>this.adj('shipping',e.target.value)}/>:null}{error('shipping')?<span className="field-error adjustment-error">{error('shipping')}</span>:null}</div><div className={`adjustment-row ${error('otherCharges')?'has-validation-error':''}`}><Toggle checked={d.adjustments.otherChargesEnabled} onChange={v=>this.adj('otherChargesEnabled',v)} label={t('Other Charges','رسوم أخرى')}/>{d.adjustments.otherChargesEnabled?<Input value={d.adjustments.otherCharges} onChange={(e:any)=>this.adj('otherCharges',e.target.value)}/>:null}{error('otherCharges')?<span className="field-error adjustment-error">{error('otherCharges')}</span>:null}</div><div className={`adjustment-row ${error('tax')?'has-validation-error':''}`}><Toggle checked={d.adjustments.taxEnabled} onChange={v=>this.adj('taxEnabled',v)} label={t('Tax / VAT','الضريبة / القيمة المضافة')}/>{d.adjustments.taxEnabled?<Input value={d.adjustments.taxPercent} onChange={(e:any)=>this.adj('taxPercent',e.target.value)}/>:null}{error('tax')?<span className="field-error adjustment-error">{error('tax')}</span>:null}</div></div><div className="editor-totals"><div><span>{t('Subtotal','الإجمالي الفرعي')}</span><strong>{formatMoney(totals.subtotal,d.currency)}</strong></div><div className="grand"><span>{t('Grand Total','الإجمالي النهائي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div></div></section>

        <section className="editor-section"><div className="section-heading"><span>05</span><h2>{t('Commercial Terms','الشروط التجارية')}</h2></div><div className="form-grid two compact-grid"><Field label="Incoterm"><Input list="incoterms" value={d.terms.incoterm} onChange={(e:any)=>this.term('incoterm',e.target.value)}/><datalist id="incoterms">{incoterms.map(x=><option key={x} value={x}/>)}</datalist></Field><Field label={t('Payment Terms','شروط الدفع')}><Input value={d.terms.paymentTerms} onChange={(e:any)=>this.term('paymentTerms',e.target.value)}/></Field><Field label={t('Delivery Time','مدة التسليم')}><Input value={d.terms.deliveryTime} onChange={(e:any)=>this.term('deliveryTime',e.target.value)}/></Field><Field label={t('Final Destination','الوجهة النهائية')}><Input value={d.terms.finalDestination} onChange={(e:any)=>this.term('finalDestination',e.target.value)}/></Field></div>{this.state.advancedOpen?<div className="advanced-panel"><div className="form-grid two compact-grid"><Field label={t('Packing','التعبئة')}><Input value={d.terms.packing} onChange={(e:any)=>this.term('packing',e.target.value)}/></Field><Field label={t('Port of Loading','ميناء التحميل')}><Input value={d.terms.portOfLoading} onChange={(e:any)=>this.term('portOfLoading',e.target.value)}/></Field><Field label={t('Country of Origin','بلد المنشأ')}><Input value={d.terms.countryOfOrigin} onChange={(e:any)=>this.term('countryOfOrigin',e.target.value)}/></Field><Field label={t('Validity','الصلاحية')}><Input value={d.terms.validity} onChange={(e:any)=>this.term('validity',e.target.value)}/></Field><Field label={t('Remarks','ملاحظات تجارية')} className="span-2"><Textarea value={d.terms.remarks} onChange={(e:any)=>this.term('remarks',e.target.value)}/></Field><Field label={t('Notes','ملاحظات')} className="span-2"><Textarea value={d.notes} onChange={(e:any)=>this.field('notes',e.target.value)}/></Field></div></div>:null}<button type="button" className="advanced-master-toggle" onClick={()=>this.setState({advancedOpen:!this.state.advancedOpen})}><Icon name={this.state.advancedOpen?'chevronUp':'chevronDown'} size={16}/>{this.state.advancedOpen?t('Hide advanced options','إخفاء الخيارات المتقدمة'):t('Advanced options','خيارات متقدمة')}</button></section>

        <section className="editor-section"><div className="section-heading"><span>06</span><h2>{t('Design','التصميم')}</h2></div><TemplateThumbnails document={d} onSelect={(id:TemplateId)=>this.appearance('templateId',id)} favoriteIds={this.props.smartDefaults.favoriteTemplateIds} defaultId={defaultTemplateId} onToggleFavorite={this.toggleFavoriteTemplate}/><div className="template-preference-bar"><div><span className="template-star">★</span><span><strong>{t('Favorite templates appear first','القوالب المفضلة تظهر أولًا')}</strong><small>{t('Use the star on any template to keep your regular choices at the top.','استخدم النجمة على أي قالب لإبقاء خياراتك المعتادة في الأعلى.')}</small></span></div><Button icon={selectedIsDefault?'check':'save'} variant={selectedIsDefault?'secondary':'primary'} disabled={selectedIsDefault} onClick={()=>void this.setCurrentTemplateDefault()}>{selectedIsDefault?(d.kind==='proforma'?t('Default quote template','القالب الافتراضي لعرض السعر'):t('Default invoice template','القالب الافتراضي للفاتورة')):(d.kind==='proforma'?t('Set as quote default','تعيين كافتراضي لعرض السعر'):t('Set as invoice default','تعيين كافتراضي للفاتورة'))}</Button></div>{this.state.advancedOpen?<div className="advanced-panel design-advanced-panel"><div className="appearance-system-grid"><Field label={t('Color System','نظام الألوان')}><Select value={d.appearance.paletteMode??'auto'} onChange={(e:any)=>this.appearance('paletteMode',e.target.value)}><option value="auto">{t('Auto — matched to template','تلقائي — متناسق مع القالب')}</option><option value="custom">{t('Custom Accent','لون مخصص')}</option></Select></Field>{(d.appearance.paletteMode??'auto')==='custom'?<Field label={t('Accent','اللون المميز')}><Input type="color" value={d.appearance.accentColor||'#b58b4f'} onChange={(e:any)=>this.appearance('accentColor',e.target.value)}/></Field>:<div className="appearance-auto-note"><span><strong>{t('Auto','تلقائي')}</strong>{t('The template chooses its balanced accent and contrast automatically.','يختار القالب اللون والتباين المتوازن تلقائيًا.')}</span></div>}<Field label={t('English Font','الخط الإنجليزي')}><Select value={d.appearance.latinFont??'auto'} onChange={(e:any)=>this.appearance('latinFont',e.target.value)}>{LATIN_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></Field><Field label={t('Arabic Font','الخط العربي')}><Select value={d.appearance.arabicFont??'auto'} onChange={(e:any)=>this.appearance('arabicFont',e.target.value)}>{ARABIC_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></Field></div><div className="appearance-toggles"><Toggle checked={d.appearance.showBank} onChange={v=>this.appearance('showBank',v)} label={t('Bank Details','بيانات البنك')}/><Toggle checked={d.appearance.showSignature} onChange={v=>this.appearance('showSignature',v)} label={t('Signature','التوقيع')}/><Toggle checked={d.appearance.showStamp} onChange={v=>this.appearance('showStamp',v)} label={t('Stamp','الختم')}/></div><Button icon="refresh" onClick={()=>this.mutate(doc=>draftWithLatestCompany(doc,this.props.company))}>{t('Refresh Company Details','تحديث بيانات الشركة')}</Button></div>:null}{d.kind==='proforma'?<Button icon="invoice" variant="primary" className="convert-invoice-button" onClick={this.convert}>{t('Convert to Invoice','تحويل إلى فاتورة')}</Button>:null}</section>
      </fieldset></div></aside>

      <section className="preview-pane"><div className="preview-toolbar"><span>{t('Live A4 Preview','معاينة A4 مباشرة')}</span><span className={`preview-quality-pill ${quality.some(item=>item.level==='warning')?'has-warning':'clean'}`}>{quality.length?`${quality.length} ${t('quality notes','تنبيهات جودة')}`:t('Quality check passed','فحص الجودة ناجح')}</span></div><div className="preview-stage"><TemplateRenderer document={d} scale={0.82}/></div></section></div>

      <div className="mobile-editor-actionbar"><div className="mobile-total"><span>{t('Grand Total','الإجمالي')}</span><strong>{formatMoney(totals.grandTotal,d.currency)}</strong></div><div className="mobile-action-buttons">{locked?<Button icon="edit" variant="primary" onClick={()=>this.setState({unlockConfirm:true})}>{t('Unlock','فتح')}</Button>:<Button icon="save" variant="primary" disabled={this.state.saving} onClick={()=>void this.save(false)}>{t('Save','حفظ')}</Button>}<Button icon="eye" onClick={()=>this.setState({mobilePreview:true})}>{t('Preview','معاينة')}</Button><Button icon="download" onClick={()=>this.openReview('pdf')}>PDF</Button></div></div>
      <div className="mobile-preview-overlay"><header><strong>{t('Preview','معاينة')}</strong><div><Button icon="download" onClick={()=>this.openReview('pdf')}>PDF</Button><IconButton icon="x" label={t('Close','إغلاق')} onClick={()=>this.setState({mobilePreview:false})}/></div></header><div className="mobile-preview-stage"><TemplateRenderer document={d} scale={0.48}/></div></div>
      <ConfirmDialog open={this.state.confirmClose} title={t('Discard unsaved changes?','تجاهل التغييرات غير المحفوظة؟')} message={t('Your latest changes have not been saved.','لم يتم حفظ آخر تغييراتك.')} confirmLabel={t('Discard','تجاهل')} destructive onCancel={()=>this.setState({confirmClose:false})} onConfirm={()=>this.props.onClose()}/>
      <ConfirmDialog open={this.state.unlockConfirm} title={t('Unlock final document?','فتح المستند النهائي للتعديل؟')} message={t('The document will return to Draft so changes can be made. Its number will remain unchanged.','سيعود المستند إلى حالة مسودة حتى تتمكن من تعديله، وسيبقى رقمه كما هو.')} confirmLabel={t('Unlock for editing','فتح للتعديل')} destructive={false} onCancel={()=>this.setState({unlockConfirm:false})} onConfirm={this.unlockFinal}/>
      <Modal open={Boolean(this.state.addCustomer)} title={t('New Customer','عميل جديد')} size="lg" onClose={()=>this.setState({addCustomer:null,addCustomerError:''})} footer={<div className="modal-footer-actions"><Button onClick={()=>this.setState({addCustomer:null})}>{t('Cancel','إلغاء')}</Button><Button variant="primary" onClick={()=>void this.addCustomer()}>{t('Save & Select','حفظ واختيار')}</Button></div>}>{this.state.addCustomer?<CustomerForm customer={this.state.addCustomer} onChange={addCustomer=>this.setState({addCustomer})}/>:null}{this.state.addCustomerError?<div className="inline-error">{this.state.addCustomerError}</div>:null}</Modal>
      <SavedItemsModal open={this.state.savedItemsOpen} items={this.props.savedItems} currency={d.currency} onClose={()=>this.setState({savedItemsOpen:false})} onSelect={this.addSavedItem} onSave={this.props.onSaveSavedItem} onDelete={this.props.onDeleteSavedItem}/>
      <DocumentReviewModal document={d} mode={this.state.reviewMode} issues={quality} working={this.state.issuing} onClose={()=>this.setState({reviewMode:null})} onConfirm={()=>void this.issueAndContinue()}/>
    </div>;
  }
}
