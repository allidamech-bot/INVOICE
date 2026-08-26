import type { SavedItem } from '../types.js';
import { uid } from '../lib/id.js';
import { savedItemSearchText, sortSavedItems } from '../lib/saved-items.js';
import { t } from '../lib/i18n.js';
import { Button, Field, Icon, IconButton, Input, Modal } from './UI.js';

interface Props {
  open:boolean;
  items:SavedItem[];
  currency:string;
  onClose:()=>void;
  onSelect:(item:SavedItem)=>void;
  onSave:(item:SavedItem)=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}
interface State { query:string; editing:SavedItem|null; busy:boolean; error:string; }

function blank(currency:string):SavedItem{
  const now=new Date().toISOString();
  return {id:uid('product'),createdAt:now,updatedAt:now,descriptionEn:'',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:currency||'USD',usageCount:0,lastUsedAt:now};
}

export class SavedItemsModal extends React.Component<Props,State>{
  state:State={query:'',editing:null,busy:false,error:''};
  componentDidUpdate(prev:Props):void{if(this.props.open&&!prev.open)this.setState({query:'',editing:null,busy:false,error:''});}
  private set=(key:keyof SavedItem,value:any)=>this.setState(state=>({editing:state.editing?{...state.editing,[key]:value}:null,error:''}));
  private save=async()=>{
    const item=this.state.editing;if(!item)return;
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim()){this.setState({error:t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.')});return;}
    this.setState({busy:true,error:''});
    try{await this.props.onSave({...item,updatedAt:new Date().toISOString(),lastCurrency:(item.lastCurrency||this.props.currency||'USD').toUpperCase()});this.setState({busy:false,editing:null});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to save item.','تعذر حفظ الصنف.')});}
  };
  private remove=async(item:SavedItem)=>{this.setState({busy:true,error:''});try{await this.props.onDelete(item);this.setState({busy:false,editing:null});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to delete item.','تعذر حذف الصنف.')});}};
  render():any{
    const q=this.state.query.trim().toLowerCase();
    const filtered=sortSavedItems(this.props.items).filter(item=>!q||savedItemSearchText(item).includes(q));
    const edit=this.state.editing;
    return <Modal open={this.props.open} title={t('Saved Items','الأصناف المحفوظة')} size="xl" onClose={this.props.onClose}>
      <div className="saved-items-shell">
        <aside className="saved-items-list-pane">
          <div className="saved-items-toolbar"><div className="search-box"><Icon name="search"/><Input value={this.state.query} placeholder={t('Search products','ابحث في الأصناف')} onChange={(e:any)=>this.setState({query:e.target.value})}/></div><Button icon="plus" variant="primary" onClick={()=>this.setState({editing:blank(this.props.currency)})}>{t('New item','صنف جديد')}</Button></div>
          <div className="saved-items-list">{filtered.map(item=><article key={item.id} className="saved-item-row"><button className="saved-item-main" onClick={()=>this.props.onSelect(item)}><strong>{item.descriptionEn||item.descriptionAr}</strong>{item.descriptionEn&&item.descriptionAr?<span dir="rtl">{item.descriptionAr}</span>:null}<small>{[item.unit,item.lastUnitPrice?`${item.lastUnitPrice} ${item.lastCurrency}`:'',item.origin].filter(Boolean).join(' · ')}</small></button><IconButton icon="edit" label={t('Edit','تعديل')} onClick={()=>this.setState({editing:structuredClone(item),error:''})}/></article>)}</div>
          {!filtered.length?<div className="saved-items-empty"><Icon name="file"/><strong>{t('No saved items yet','لا توجد أصناف محفوظة بعد')}</strong><span>{t('Save products you quote often and add them to a document in one tap.','احفظ الأصناف التي تستخدمها كثيرًا وأضفها للمستند بنقرة واحدة.')}</span></div>:null}
        </aside>
        <section className={`saved-item-editor ${edit?'is-open':''}`}>{edit?<><div className="saved-item-editor-head"><div><p className="eyebrow">{t('Product library','مكتبة الأصناف')}</p><h3>{edit.descriptionEn||edit.descriptionAr||t('New saved item','صنف محفوظ جديد')}</h3></div><IconButton icon="x" label={t('Close editor','إغلاق التحرير')} onClick={()=>this.setState({editing:null,error:''})}/></div><div className="form-grid two"><Field label={t('Description English','الوصف بالإنجليزية')}><Input value={edit.descriptionEn} onChange={(e:any)=>this.set('descriptionEn',e.target.value)}/></Field><Field label={t('Description Arabic','الوصف بالعربية')}><Input dir="rtl" value={edit.descriptionAr} onChange={(e:any)=>this.set('descriptionAr',e.target.value)}/></Field><Field label="HS Code"><Input value={edit.hsCode} onChange={(e:any)=>this.set('hsCode',e.target.value)}/></Field><Field label={t('Origin','المنشأ')}><Input value={edit.origin} onChange={(e:any)=>this.set('origin',e.target.value)}/></Field><Field label={t('Packing','التعبئة')}><Input value={edit.packing} onChange={(e:any)=>this.set('packing',e.target.value)}/></Field><Field label={t('Unit','الوحدة')}><Input value={edit.unit} onChange={(e:any)=>this.set('unit',e.target.value)}/></Field><Field label={t('Last price','آخر سعر')}><Input inputMode="decimal" value={edit.lastUnitPrice} onChange={(e:any)=>this.set('lastUnitPrice',e.target.value)}/></Field><Field label={t('Currency','العملة')}><Input value={edit.lastCurrency} onChange={(e:any)=>this.set('lastCurrency',e.target.value.toUpperCase())}/></Field></div>{this.state.error?<div className="inline-error">{this.state.error}</div>:null}<div className="saved-item-editor-actions">{this.props.items.some(item=>item.id===edit.id)?<Button variant="danger" icon="trash" disabled={this.state.busy} onClick={()=>void this.remove(edit)}>{t('Delete','حذف')}</Button>:<span/>}<Button variant="primary" icon="save" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save item','حفظ الصنف')}</Button></div></>:<div className="saved-item-editor-placeholder"><Icon name="edit" size={28}/><strong>{t('Select an item to edit','اختر صنفًا لتعديله')}</strong><span>{t('Or create a reusable product profile for faster quotes and invoices.','أو أنشئ ملف صنف قابل لإعادة الاستخدام لتسريع عروض الأسعار والفواتير.')}</span></div>}</section>
      </div>
    </Modal>;
  }
}
