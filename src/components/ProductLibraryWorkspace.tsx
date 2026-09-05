import type { SavedItem } from '../types.js';
import { makeId } from '../lib/id.js';
import { decimalToScaled, isDecimalInput, normalizeDecimalInput } from '../lib/money.js';
import { categoryChoices } from '../lib/product-presets.js';
import { findSavedItemDuplicate, normalizeSavedItemSku, parseSavedItemTags, savedItemSearchText, sortSavedItems } from '../lib/saved-items.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Select, Toggle } from './UI.js';
import { ProductImportModal } from './ProductImportModal.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onSaveMany:(items:SavedItem[])=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}

type SortMode='smart'|'name'|'recent'|'sku';
type DiscardAction=''|'close'|'new'|'select'|'import';
interface State {
  query:string;
  category:string;
  sortMode:SortMode;
  editing:SavedItem|null;
  editingInitial:string;
  deleting:SavedItem|null;
  busy:boolean;
  error:string;
  importOpen:boolean;
  discardAction:DiscardAction;
  pendingEdit:SavedItem|null;
}

function titleOf(item:SavedItem):string{
  return (isArabic()?item.descriptionAr:item.descriptionEn)||item.descriptionEn||item.descriptionAr||t('Untitled item','صنف بلا اسم');
}

function categoryOf(item:SavedItem):string{return (item.category??'').trim();}
function recentStamp(item:SavedItem):string{return item.lastUsedAt||item.updatedAt||item.createdAt||'';}

function blank(currency:string):SavedItem{
  const now=new Date().toISOString();
  return {id:makeId('product'),createdAt:now,updatedAt:now,sku:'',descriptionEn:'',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:currency||'USD',usageCount:0,lastUsedAt:now,category:'',tags:[],favorite:false};
}

function ranked(items:SavedItem[],values:(item:SavedItem)=>string[],limit:number):string[]{
  const map=new Map<string,{value:string;score:number;recent:string}>();
  items.forEach(item=>values(item).map(value=>value.trim()).filter(Boolean).forEach(value=>{
    const key=value.toLocaleLowerCase();
    const current=map.get(key)??{value,score:0,recent:''};
    current.score+=1+Math.max(0,item.usageCount||0);
    if(recentStamp(item)>current.recent)current.recent=recentStamp(item);
    map.set(key,current);
  }));
  return Array.from(map.values()).sort((a,b)=>b.score-a.score||b.recent.localeCompare(a.recent)).slice(0,limit).map(entry=>entry.value);
}

export class ProductLibraryWorkspace extends React.Component<Props,State>{
  state:State={query:'',category:'',sortMode:'smart',editing:null,editingInitial:'',deleting:null,busy:false,error:'',importOpen:false,discardAction:'',pendingEdit:null};

  private set=(key:keyof SavedItem,value:any)=>this.setState(state=>({editing:state.editing?{...state.editing,[key]:value}:null,error:''}));

  private loadEdit=(item:SavedItem)=>{
    const editing=structuredClone({...item,sku:item.sku??'',category:item.category??'',tags:[...(item.tags??[])],favorite:Boolean(item.favorite)});
    this.setState({editing,editingInitial:JSON.stringify(editing),error:'',discardAction:'',pendingEdit:null});
  };

  private editingDirty=():boolean=>Boolean(this.state.editing&&(!this.state.editingInitial||JSON.stringify(this.state.editing)!==this.state.editingInitial));

  private beginEdit=(item:SavedItem)=>{
    if(this.state.busy||this.state.editing?.id===item.id)return;
    if(this.editingDirty()){this.setState({discardAction:'select',pendingEdit:item});return;}
    this.loadEdit(item);
  };

  private newItem=()=>{
    if(this.state.busy)return;
    if(this.editingDirty()){this.setState({discardAction:'new',pendingEdit:null});return;}
    this.loadEdit(blank(this.props.currency));
  };

  private requestClose=()=>{
    if(this.state.busy)return;
    if(this.editingDirty()){this.setState({discardAction:'close',pendingEdit:null});return;}
    this.setState({editing:null,editingInitial:'',error:''});
  };

  private requestImport=()=>{
    if(this.state.busy)return;
    if(this.editingDirty()){this.setState({discardAction:'import',pendingEdit:null});return;}
    this.setState({importOpen:true});
  };

  private confirmDiscard=()=>{
    const action=this.state.discardAction;
    const pending=this.state.pendingEdit;
    if(action==='select'&&pending){this.loadEdit(pending);return;}
    if(action==='new'){this.loadEdit(blank(this.props.currency));return;}
    if(action==='import'){
      this.setState({editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null,importOpen:true});
      return;
    }
    this.setState({editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});
  };

  private duplicate=(source:SavedItem)=>{
    if(this.editingDirty()){
      this.setState({error:t('Save or discard the current changes before duplicating this product.','احفظ التعديلات الحالية أو تجاهلها قبل نسخ هذا الصنف.')});
      return;
    }
    const now=new Date().toISOString();
    const copy:SavedItem={
      ...structuredClone(source),id:makeId('product'),createdAt:now,updatedAt:now,lastUsedAt:now,usageCount:0,sku:'',favorite:false,
      descriptionEn:source.descriptionEn?`${source.descriptionEn} Copy`:'',
      descriptionAr:source.descriptionAr?`${source.descriptionAr} - نسخة`:''
    };
    this.setState({editing:copy,editingInitial:'',error:'',discardAction:'',pendingEdit:null});
  };

  private toggleTag=(tag:string)=>{
    const item=this.state.editing;if(!item)return;
    const current=item.tags??[];const key=tag.toLocaleLowerCase();
    this.set('tags',current.some(value=>value.toLocaleLowerCase()===key)?current.filter(value=>value.toLocaleLowerCase()!==key):[...current,tag]);
  };

  private save=async()=>{
    const item=this.state.editing;if(!item||this.state.busy)return;
    const sku=(item.sku??'').trim().toUpperCase();
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim()){this.setState({error:t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.')});return;}
    if(!item.unit.trim()){this.setState({error:t('Unit is required.','الوحدة مطلوبة.')});return;}
    if(item.lastUnitPrice.trim()&&(!isDecimalInput(item.lastUnitPrice)||decimalToScaled(item.lastUnitPrice)<0n)){this.setState({error:t('Enter a valid non-negative price.','أدخل سعرًا صالحًا يساوي صفرًا أو أكثر.')});return;}
    const candidate:SavedItem={...item,sku,lastCurrency:(item.lastCurrency||this.props.currency||'USD').trim().toUpperCase(),category:categoryOf(item),tags:Array.from(new Set((item.tags??[]).map(tag=>tag.trim()).filter(Boolean))),lastUnitPrice:item.lastUnitPrice.trim()?normalizeDecimalInput(item.lastUnitPrice):'',favorite:Boolean(item.favorite),updatedAt:new Date().toISOString()};
    const duplicate=findSavedItemDuplicate(this.props.items,candidate);
    if(duplicate){
      const duplicateSku=sku&&normalizeSavedItemSku(duplicate.sku??'')===normalizeSavedItemSku(sku);
      this.setState({error:duplicateSku?t(`SKU “${sku}” is already used by ${titleOf(duplicate)}.`,`SKU «${sku}» مستخدم بالفعل للصنف ${titleOf(duplicate)}.`):t(`A product named “${titleOf(duplicate)}” already exists.`,`يوجد صنف باسم «${titleOf(duplicate)}» بالفعل.`)});
      return;
    }
    this.setState({busy:true,error:''});
    try{await this.props.onSave(candidate);this.setState({busy:false,editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to save product.','تعذر حفظ الصنف.')});}
  };

  private remove=async()=>{
    const item=this.state.deleting;if(!item||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{await this.props.onDelete(item);this.setState({busy:false,deleting:null,editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});}
    catch(e){this.setState({busy:false,deleting:null,error:e instanceof Error?e.message:t('Unable to delete product.','تعذر حذف الصنف.')});}
  };

  private toggleFavorite=async(item:SavedItem)=>{
    if(this.state.busy)return;
    const editing=this.state.editing;
    if(editing?.id===item.id){this.set('favorite',!Boolean(editing.favorite));return;}
    this.setState({busy:true,error:''});
    try{await this.props.onSave({...item,favorite:!Boolean(item.favorite),updatedAt:new Date().toISOString()});this.setState({busy:false});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to update favorite.','تعذر تحديث المفضلة.')});}
  };

  private ordered=(items:SavedItem[]):SavedItem[]=>{
    if(this.state.sortMode==='smart')return sortSavedItems(items);
    if(this.state.sortMode==='recent')return [...items].sort((a,b)=>recentStamp(b).localeCompare(recentStamp(a)));
    if(this.state.sortMode==='sku')return [...items].sort((a,b)=>(a.sku||'~~~~').localeCompare(b.sku||'~~~~',undefined,{numeric:true,sensitivity:'base'}));
    return [...items].sort((a,b)=>titleOf(a).localeCompare(titleOf(b),isArabic()?'ar':'en',{numeric:true,sensitivity:'base'}));
  };

  render():any{
    const query=this.state.query.trim().toLocaleLowerCase();
    const categories=Array.from(new Set(this.props.items.map(categoryOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b,isArabic()?'ar':'en',{sensitivity:'base'}));
    const categoryPresets=categoryChoices(isArabic());
    const existingCategorySet=new Set(categories);
    const categorySuggestions=[...categories.map(value=>({value,label:value})),...categoryPresets.filter(choice=>!existingCategorySet.has(choice.value))];
    const tags=ranked(this.props.items,item=>item.tags??[],18);
    const hsCodes=ranked(this.props.items,item=>item.hsCode?[item.hsCode]:[],12);
    let filtered=this.props.items.filter(item=>(!query||savedItemSearchText(item).includes(query))&&(!this.state.category||categoryOf(item)===this.state.category));
    filtered=this.ordered(filtered);
    const edit=this.state.editing;
    const favorites=this.props.items.filter(item=>item.favorite).length;
    const skuCount=this.props.items.filter(item=>Boolean(item.sku?.trim())).length;

    return <div className={`product-library-pro ${edit?'editor-open':''}`}>
      <div className="product-library-commandbar">
        <div className="product-library-search"><Icon name="search"/><Input aria-label={t('Search product library','بحث في مكتبة الأصناف')} value={this.state.query} placeholder={t('Search name, SKU, HS code, category…','ابحث بالاسم أو SKU أو HS Code أو التصنيف…')} onChange={(e:any)=>this.setState({query:e.target.value})}/>{this.state.query?<IconButton icon="x" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>:<span>/</span>}</div>
        <Select aria-label={t('Filter category','فلتر التصنيف')} value={this.state.category} onChange={(e:any)=>this.setState({category:e.target.value})}><option value="">{t('All categories','كل التصنيفات')}</option>{categories.map(category=><option key={category} value={category}>{category}</option>)}</Select>
        <Select aria-label={t('Sort products','ترتيب الأصناف')} value={this.state.sortMode} onChange={(e:any)=>this.setState({sortMode:e.target.value})}><option value="smart">{t('Most used','الأكثر استخدامًا')}</option><option value="recent">{t('Recently updated','الأحدث')}</option><option value="name">{t('Name A–Z','الاسم أبجديًا')}</option><option value="sku">SKU</option></Select>
        <Button icon="upload" onClick={this.requestImport}>{t('Import','استيراد')}</Button>
        <Button icon="plus" variant="primary" onClick={this.newItem}>{t('New Product','صنف جديد')}</Button>
      </div>

      <div className="product-library-metrics" aria-label={t('Catalog summary','ملخص الكتالوج')}>
        <button type="button" className={!this.state.category&&!query?'active':''} onClick={()=>this.setState({category:'',query:''})}><span>{t('Products','الأصناف')}</span><strong>{this.props.items.length}</strong></button>
        <div><span>{t('With SKU','مع SKU')}</span><strong>{skuCount}</strong></div>
        <div><span>{t('Favorites','المفضلة')}</span><strong>{favorites}</strong></div>
        <div><span>{t('Categories','التصنيفات')}</span><strong>{categories.length}</strong></div>
      </div>

      <div className="product-library-body">
        <section className="product-library-list-pane">
          <div className="product-library-list-head"><div><strong>{this.state.category||t('Product catalog','كتالوج الأصناف')}</strong><span>{t(`${filtered.length} visible`,`${filtered.length} ظاهر`)}</span></div>{(query||this.state.category)?<Button variant="ghost" onClick={()=>this.setState({query:'',category:''})}>{t('Clear filters','مسح الفلاتر')}</Button>:null}</div>
          <div className="product-library-list">
            {filtered.map(item=>{
              const active=edit?.id===item.id;
              const rowFavorite=active?Boolean(edit?.favorite):Boolean(item.favorite);
              return <article key={item.id} className={`product-library-row ${active?'active':''}`}>
                <button type="button" className={`product-library-star ${rowFavorite?'on':''}`} aria-label={rowFavorite?t('Remove favorite','إزالة من المفضلة'):t('Add favorite','إضافة للمفضلة')} aria-pressed={rowFavorite} onClick={()=>void this.toggleFavorite(item)}>★</button>
                <button type="button" className="product-library-row-main" onClick={()=>this.beginEdit(item)}>
                  <div className="product-library-row-title"><strong>{titleOf(item)}</strong>{item.sku?<code>{item.sku}</code>:null}</div>
                  {item.descriptionEn&&item.descriptionAr?<span>{isArabic()?item.descriptionEn:item.descriptionAr}</span>:null}
                  <div className="product-library-row-chips">{categoryOf(item)?<em>{categoryOf(item)}</em>:null}{(item.tags??[]).slice(0,2).map(tag=><em key={tag}>#{tag}</em>)}</div>
                  <small>{[item.unit,item.lastUnitPrice?`${item.lastUnitPrice} ${item.lastCurrency}`:'',item.origin,item.hsCode?`HS ${item.hsCode}`:''].filter(Boolean).join(' · ')}</small>
                </button>
                <IconButton icon="edit" label={t('Edit product','تعديل الصنف')} onClick={()=>this.beginEdit(item)}/>
              </article>;
            })}
            {!filtered.length?<div className="product-library-empty"><Icon name="items" size={30}/><strong>{this.props.items.length?t('No products match these filters','لا توجد أصناف مطابقة لهذه الفلاتر'):t('Your product library is ready','مكتبة الأصناف جاهزة')}</strong><span>{this.props.items.length?t('Clear the filters or try another search.','امسح الفلاتر أو جرّب بحثًا آخر.'):t('Add your first product or import an Excel/CSV catalog.','أضف أول صنف أو استورد كتالوج Excel/CSV.')}</span>{!this.props.items.length?<div><Button icon="upload" onClick={this.requestImport}>{t('Import catalog','استيراد كتالوج')}</Button><Button icon="plus" variant="primary" onClick={this.newItem}>{t('New Product','صنف جديد')}</Button></div>:null}</div>:null}
          </div>
        </section>

        <aside className={`product-library-editor ${edit?'is-open':''}`}>
          {edit?<>
            <header className="product-library-editor-head"><div><p className="eyebrow">{this.props.items.some(item=>item.id===edit.id)?t('Edit saved product','تعديل صنف محفوظ'):t('New saved product','صنف محفوظ جديد')}</p><h2>{titleOf(edit)}</h2>{edit.sku?<code>{edit.sku}</code>:null}</div><IconButton icon="x" label={t('Close editor','إغلاق التحرير')} onClick={this.requestClose}/></header>
            <div className="product-library-editor-scroll">
              <section className="product-editor-section"><div className="product-editor-section-title"><span>01</span><div><strong>{t('Identity','الهوية')}</strong><small>{t('Name and internal product code','الاسم والكود الداخلي للصنف')}</small></div></div><div className="form-grid two">
                <Field label="SKU / Item Code" hint={t('Optional, but recommended for imports and price updates.','اختياري، لكنه موصى به للاستيراد وتحديث الأسعار.')}><Input value={edit.sku??''} placeholder="e.g. RB-250-ORG" autoCapitalize="characters" spellCheck={false} onChange={(e:any)=>this.set('sku',String(e.target.value).toUpperCase())}/></Field>
                <div className="product-sku-note"><Icon name="lock"/><span>{t('SKU must be unique when used.','عند استخدام SKU يجب أن يكون فريدًا.')}</span></div>
                <Field label={t('Description English','الوصف بالإنجليزية')}><Input autoFocus={!isArabic()} value={edit.descriptionEn} onChange={(e:any)=>this.set('descriptionEn',e.target.value)}/></Field>
                <Field label={t('Description Arabic','الوصف بالعربية')}><Input autoFocus={isArabic()} dir="rtl" value={edit.descriptionAr} onChange={(e:any)=>this.set('descriptionAr',e.target.value)}/></Field>
              </div></section>

              <section className="product-editor-section"><div className="product-editor-section-title"><span>02</span><div><strong>{t('Catalog organization','تنظيم الكتالوج')}</strong><small>{t('Category, tags and customs reference','التصنيف والوسوم والمرجع الجمركي')}</small></div></div><div className="form-grid two">
                <Field label={t('Category','التصنيف')}><Input value={edit.category??''} placeholder={t('Choose below or type a custom category','اختر أدناه أو اكتب تصنيفًا مخصصًا')} onChange={(e:any)=>this.set('category',e.target.value)}/><span className="product-library-choice-strip">{categorySuggestions.map(choice=><button type="button" key={choice.value} className={categoryOf(edit)===choice.value?'active':''} onClick={()=>this.set('category',choice.value)}>{choice.label}</button>)}</span></Field>
                <Field label={t('Tags','الوسوم')}><Input value={(edit.tags??[]).join(', ')} placeholder={t('e.g. 250ml, Energy','مثال: 250مل، طاقة')} onChange={(e:any)=>this.set('tags',parseSavedItemTags(String(e.target.value)))}/>{tags.length?<span className="product-library-choice-strip">{tags.map(tag=>{const active=(edit.tags??[]).some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase());return <button type="button" key={tag} className={active?'active':''} onClick={()=>this.toggleTag(tag)}>#{tag}</button>;})}</span>:null}</Field>
                <Field label="HS Code"><Input inputMode="numeric" value={edit.hsCode} onChange={(e:any)=>this.set('hsCode',e.target.value)}/>{hsCodes.length?<span className="product-library-choice-strip">{hsCodes.map(code=><button type="button" key={code} className={edit.hsCode===code?'active':''} onClick={()=>this.set('hsCode',code)}>{code}</button>)}</span>:null}</Field>
                <Field label={t('Origin','المنشأ')}><Input value={edit.origin} onChange={(e:any)=>this.set('origin',e.target.value)}/></Field>
              </div></section>

              <section className="product-editor-section"><div className="product-editor-section-title"><span>03</span><div><strong>{t('Commercial details','التفاصيل التجارية')}</strong><small>{t('Packing, unit and reusable price','التعبئة والوحدة والسعر القابل لإعادة الاستخدام')}</small></div></div><div className="form-grid two">
                <Field label={t('Packing','التعبئة')}><Input value={edit.packing} onChange={(e:any)=>this.set('packing',e.target.value)}/></Field>
                <Field label={t('Unit','الوحدة')}><Input value={edit.unit} onChange={(e:any)=>this.set('unit',e.target.value)}/></Field>
                <Field label={t('Last price','آخر سعر')}><Input inputMode="decimal" value={edit.lastUnitPrice} onChange={(e:any)=>this.set('lastUnitPrice',e.target.value)}/></Field>
                <Field label={t('Currency','العملة')}><Input value={edit.lastCurrency} onChange={(e:any)=>this.set('lastCurrency',String(e.target.value).toUpperCase())}/></Field>
              </div><div className="product-library-favorite"><Toggle checked={Boolean(edit.favorite)} onChange={favorite=>this.set('favorite',favorite)} label={t('Keep this product in Favorites','إبقاء هذا الصنف في المفضلة')}/></div></section>

              {this.state.error?<div className="inline-error product-library-error" role="alert">{this.state.error}</div>:null}
            </div>
            <footer className="product-library-editor-actions">
              <div>{this.props.items.some(item=>item.id===edit.id)?<><Button icon="copy" onClick={()=>this.duplicate(edit)}>{t('Duplicate','نسخ')}</Button><Button icon="trash" variant="danger" disabled={this.state.busy} onClick={()=>this.setState({deleting:structuredClone(edit)})}>{t('Delete','حذف')}</Button></>:null}</div>
              <Button icon="save" variant="primary" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Product','حفظ الصنف')}</Button>
            </footer>
          </>:<div className="product-library-editor-empty"><div><Icon name="items" size={30}/></div><p className="eyebrow">{t('Product details','بيانات الصنف')}</p><strong>{t('Choose a product to edit','اختر صنفًا لتعديله')}</strong><span>{t('The editor keeps recurring commercial data in one place without crowding the catalog list.','يبقي المحرر البيانات التجارية المتكررة في مكان واحد دون ازدحام قائمة الأصناف.')}</span><Button icon="plus" variant="primary" onClick={this.newItem}>{t('New Product','صنف جديد')}</Button></div>}
        </aside>
      </div>

      <ProductImportModal open={this.state.importOpen} items={this.props.items} currency={this.props.currency} onClose={()=>this.setState({importOpen:false})} onSaveMany={this.props.onSaveMany}/>
      <ConfirmDialog open={Boolean(this.state.discardAction)} title={t('Discard unsaved product changes?','تجاهل تعديلات الصنف غير المحفوظة؟')} message={t('Your current product changes have not been saved. Discard them and continue?','التعديلات الحالية على الصنف لم تُحفظ بعد. هل تريد تجاهلها والمتابعة؟')} confirmLabel={t('Discard changes','تجاهل التعديلات')} onCancel={()=>this.setState({discardAction:'',pendingEdit:null})} onConfirm={this.confirmDiscard}/>
      <ConfirmDialog open={Boolean(this.state.deleting)} title={t('Delete saved product?','حذف الصنف المحفوظ؟')} message={t('This removes the reusable catalog item. Existing invoices and quotes stay unchanged.','سيتم حذف الصنف من الكتالوج القابل لإعادة الاستخدام، ولن تتغير الفواتير وعروض الأسعار الحالية.')} onCancel={()=>this.setState({deleting:null})} onConfirm={()=>void this.remove()}/>
    </div>;
  }
}