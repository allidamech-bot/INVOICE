import type { SavedItem } from '../types.js';
import { makeId } from '../lib/id.js';
import { decimalToScaled, isDecimalInput, normalizeDecimalInput } from '../lib/money.js';
import { findSavedItemDuplicate, normalizeSavedItemIdentity, parseSavedItemTags, savedItemSearchText, sortSavedItems } from '../lib/saved-items.js';
import { isArabic, t } from '../lib/i18n.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Modal, Select, Toggle } from './UI.js';

interface Props {
  open:boolean;
  embedded?:boolean;
  items:SavedItem[];
  currency:string;
  onClose?:()=>void;
  onSelectMany?:(items:SavedItem[])=>Promise<void>;
  onSave:(item:SavedItem)=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}
type DiscardAction=''|'editor'|'modal'|'select';
type LibraryView='favorites'|'recent'|'categories'|'all';
type SortMode='smart'|'name'|'recent'|'category';
interface State {
  query:string;
  editing:SavedItem|null;
  editingInitial:string;
  discardAction:DiscardAction;
  pendingSelect:SavedItem|null;
  deleting:SavedItem|null;
  busy:boolean;
  error:string;
  view:LibraryView;
  category:string;
  filterCategory:string;
  sortMode:SortMode;
  favoriteBusyId:string;
  selectedIds:string[];
}

function blank(currency:string,seed=''):SavedItem{
  const now=new Date().toISOString();
  const description=seed.trim();
  const arabic=isArabic();
  return {
    id:makeId('product'),createdAt:now,updatedAt:now,
    descriptionEn:arabic?'':description,descriptionAr:arabic?description:'',
    hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',
    lastCurrency:currency||'USD',usageCount:0,lastUsedAt:now,category:'',tags:[],favorite:false
  };
}

function titleOf(item:SavedItem):string{
  return (isArabic()?item.descriptionAr:item.descriptionEn)||item.descriptionEn||item.descriptionAr||t('Untitled item','صنف بلا اسم');
}
function categoryOf(item:SavedItem):string{return (item.category??'').trim();}
function recentStamp(item:SavedItem):string{return item.lastUsedAt||item.updatedAt||item.createdAt||'';}

export class SavedItemsModal extends React.Component<Props,State>{
  state:State={
    query:'',editing:null,editingInitial:'',discardAction:'',pendingSelect:null,deleting:null,
    busy:false,error:'',view:this.props.items.some(item=>item.favorite)?'favorites':'recent',
    category:'',filterCategory:'',sortMode:'smart',favoriteBusyId:'',selectedIds:[]
  };

  componentDidMount():void{document.addEventListener('keydown',this.handleLibraryKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleLibraryKeyDown);}

  componentDidUpdate(prev:Props):void{
    if(this.props.open&&!prev.open){
      this.setState({
        query:'',editing:null,editingInitial:'',discardAction:'',pendingSelect:null,deleting:null,
        busy:false,error:'',view:this.props.items.some(item=>item.favorite)?'favorites':'recent',
        category:'',filterCategory:'',sortMode:'smart',favoriteBusyId:'',selectedIds:[]
      });
      return;
    }
    if(prev.items!==this.props.items){
      const existing=new Set(this.props.items.map(item=>item.id));
      const selectedIds=this.state.selectedIds.filter(id=>existing.has(id));
      if(selectedIds.length!==this.state.selectedIds.length)this.setState({selectedIds});
    }
  }

  private searchInput=():HTMLInputElement|null=>
    document.querySelector('.saved-items-shell .saved-items-search-input') as HTMLInputElement|null;

  private handleLibraryKeyDown=(event:KeyboardEvent)=>{
    if(!this.props.open||this.state.editing)return;
    const target=event.target as HTMLElement|null;
    const typing=Boolean(target?.closest('input,textarea,select,[contenteditable="true"]'));
    if(event.key==='/'&&!typing){
      event.preventDefault();
      this.searchInput()?.focus();
      return;
    }
    if(event.key==='Escape'&&this.state.query){
      event.preventDefault();
      event.stopImmediatePropagation();
      this.setState({query:''});
      this.searchInput()?.focus();
    }
  };

  private set=(key:keyof SavedItem,value:any)=>
    this.setState(state=>({editing:state.editing?{...state.editing,[key]:value}:null,error:''}));

  private beginEdit=(item:SavedItem)=>{
    const editing=structuredClone({...item,category:item.category??'',tags:[...(item.tags??[])],favorite:Boolean(item.favorite)});
    this.setState({editing,editingInitial:JSON.stringify(editing),discardAction:'',pendingSelect:null,error:''});
  };
  private newItem=()=>this.beginEdit(blank(this.props.currency,this.state.query));
  private editingDirty=()=>Boolean(this.state.editing&&this.state.editingInitial&&JSON.stringify(this.state.editing)!==this.state.editingInitial);
  private closeEditor=()=>this.setState({editing:null,editingInitial:'',discardAction:'',pendingSelect:null,error:''});
  private requestEditorClose=()=>{
    if(this.state.busy)return;
    if(this.editingDirty())this.setState({discardAction:'editor'});
    else this.closeEditor();
  };
  private requestModalClose=()=>{
    if(this.state.busy)return;
    if(this.editingDirty())this.setState({discardAction:'modal'});
    else this.props.onClose?.();
  };
  private selectItem=(item:SavedItem)=>{
    if(this.props.onSelectMany){
      this.setState(state=>({
        selectedIds:state.selectedIds.includes(item.id)
          ? state.selectedIds.filter(id=>id!==item.id)
          : [...state.selectedIds,item.id],
        error:''
      }));
      return;
    }
    if(this.editingDirty()){this.setState({discardAction:'select',pendingSelect:item});return;}
    this.beginEdit(item);
  };
  private confirmDiscard=()=>{
    const action=this.state.discardAction;
    const pending=this.state.pendingSelect;
    if(action==='editor'){this.closeEditor();return;}
    if(action==='modal'){
      this.setState({editing:null,editingInitial:'',discardAction:'',pendingSelect:null,error:''},()=>this.props.onClose?.());
      return;
    }
    if(action==='select'&&pending){
      this.setState({editing:null,editingInitial:'',discardAction:'',pendingSelect:null,error:''},()=>this.beginEdit(pending));
      return;
    }
    this.setState({discardAction:'',pendingSelect:null});
  };

  private order=(items:SavedItem[]):SavedItem[]=>{
    const locale=isArabic()?'ar':'en';
    if(this.state.sortMode==='name'){
      return [...items].sort((a,b)=>titleOf(a).localeCompare(titleOf(b),locale,{numeric:true,sensitivity:'base'}));
    }
    if(this.state.sortMode==='category'){
      return [...items].sort((a,b)=>{
        const ac=categoryOf(a),bc=categoryOf(b);
        if(!ac&&bc)return 1;
        if(ac&&!bc)return -1;
        const byCategory=ac.localeCompare(bc,locale,{numeric:true,sensitivity:'base'});
        return byCategory||titleOf(a).localeCompare(titleOf(b),locale,{numeric:true,sensitivity:'base'});
      });
    }
    if(this.state.sortMode==='recent'){
      return [...items].sort((a,b)=>recentStamp(b).localeCompare(recentStamp(a)));
    }
    if(this.state.view==='recent'){
      return [...items].sort((a,b)=>recentStamp(b).localeCompare(recentStamp(a)));
    }
    return sortSavedItems(items);
  };

  private setView=(view:LibraryView)=>
    this.setState({view,category:view==='categories'?this.state.category:'',filterCategory:'',query:''});

  private toggleFavorite=async(item:SavedItem)=>{
    if(this.state.favoriteBusyId||this.state.busy)return;
    this.setState({favoriteBusyId:item.id,error:''});
    try{
      await this.props.onSave({
        ...item,favorite:!Boolean(item.favorite),updatedAt:new Date().toISOString(),
        category:item.category??'',tags:[...(item.tags??[])]
      });
      this.setState({favoriteBusyId:''});
    }catch(e){
      this.setState({favoriteBusyId:'',error:e instanceof Error?e.message:t('Unable to update favorite.','تعذر تحديث المفضلة.')});
    }
  };

  private toggleVisibleSelection=(visible:SavedItem[])=>{
    if(!visible.length)return;
    const visibleIds=new Set(visible.map(item=>item.id));
    this.setState(state=>{
      const current=new Set(state.selectedIds);
      const allVisibleSelected=visible.every(item=>current.has(item.id));
      if(allVisibleSelected)visibleIds.forEach(id=>current.delete(id));
      else visibleIds.forEach(id=>current.add(id));
      return {selectedIds:Array.from(current)};
    });
  };

  private addSelected=async()=>{
    const selectedIds=new Set(this.state.selectedIds);
    const selected=this.props.items.filter(item=>selectedIds.has(item.id));
    if(!selected.length||!this.props.onSelectMany||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      await this.props.onSelectMany(selected);
      this.setState({busy:false,selectedIds:[]});
    }catch(e){
      this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to add selected items.','تعذر إضافة الأصناف المحددة.')});
    }
  };

  private save=async()=>{
    const item=this.state.editing;
    if(!item)return;
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim()){
      this.setState({error:t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.')});
      return;
    }
    if(item.lastUnitPrice.trim()&&(!isDecimalInput(item.lastUnitPrice)||decimalToScaled(item.lastUnitPrice)<0n)){
      this.setState({error:t('Last price must be a valid number that is 0 or greater.','يجب أن يكون آخر سعر رقمًا صالحًا يساوي 0 أو أكثر.')});
      return;
    }
    if(!item.unit.trim()){this.setState({error:t('Unit is required.','الوحدة مطلوبة.')});return;}
    const lastCurrency=(item.lastCurrency||this.props.currency||'USD').trim().toUpperCase();
    if(!lastCurrency){this.setState({error:t('Currency is required.','العملة مطلوبة.')});return;}
    const current=this.props.items.find(existing=>existing.id===item.id);
    const identityChanged=!current||
      normalizeSavedItemIdentity(current.descriptionEn)!==normalizeSavedItemIdentity(item.descriptionEn)||
      normalizeSavedItemIdentity(current.descriptionAr)!==normalizeSavedItemIdentity(item.descriptionAr);
    const duplicate=identityChanged?findSavedItemDuplicate(this.props.items,item):undefined;
    if(duplicate){
      this.setState({error:t(
        `An item named “${titleOf(duplicate)}” already exists. Edit the existing item instead.`,
        `يوجد صنف باسم «${titleOf(duplicate)}» بالفعل. عدّل الصنف الموجود بدلًا من إنشاء نسخة مكررة.`
      )});
      return;
    }
    const tags=Array.from(new Set((item.tags??[]).map(tag=>tag.trim()).filter(Boolean)));
    this.setState({busy:true,error:''});
    try{
      await this.props.onSave({
        ...item,category:(item.category??'').trim(),tags,favorite:Boolean(item.favorite),
        lastUnitPrice:item.lastUnitPrice.trim()?normalizeDecimalInput(item.lastUnitPrice):'',
        updatedAt:new Date().toISOString(),lastCurrency
      });
      this.setState({
        busy:false,editing:null,editingInitial:'',discardAction:'',pendingSelect:null,
        query:'',filterCategory:''
      });
    }catch(e){
      this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to save item.','تعذر حفظ الصنف.')});
    }
  };

  private remove=async()=>{
    const item=this.state.deleting;
    if(!item||this.state.busy)return;
    this.setState({busy:true,error:''});
    try{
      await this.props.onDelete(item);
      this.setState({busy:false,editing:null,editingInitial:'',discardAction:'',pendingSelect:null,deleting:null});
    }catch(e){
      this.setState({busy:false,deleting:null,error:e instanceof Error?e.message:t('Unable to delete item.','تعذر حذف الصنف.')});
    }
  };

  render():any{
    const rawQuery=this.state.query.trim();
    const q=rawQuery.toLowerCase();
    const locale=isArabic()?'ar':'en';
    const categories=Array.from(new Set(this.props.items.map(categoryOf).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b,locale,{numeric:true,sensitivity:'base'}));
    const uncategorizedCount=this.props.items.filter(item=>!categoryOf(item)).length;
    const favoriteCount=this.props.items.filter(item=>item.favorite).length;

    let pool:SavedItem[]=[];
    if(q)pool=this.props.items.filter(item=>savedItemSearchText(item).includes(q));
    else if(this.state.view==='favorites')pool=this.props.items.filter(item=>item.favorite);
    else if(this.state.view==='recent')pool=[...this.props.items].sort((a,b)=>recentStamp(b).localeCompare(recentStamp(a))).slice(0,24);
    else if(this.state.view==='categories'){
      pool=this.state.category==='__uncategorized'
        ? this.props.items.filter(item=>!categoryOf(item))
        : this.state.category
          ? this.props.items.filter(item=>categoryOf(item)===this.state.category)
          : [];
    }else pool=this.props.items;

    const basePool=[...pool];
    const basePoolCount=basePool.length;
    if(this.state.view!=='categories'&&this.state.filterCategory){
      pool=this.state.filterCategory==='__uncategorized'
        ? basePool.filter(item=>!categoryOf(item))
        : basePool.filter(item=>categoryOf(item)===this.state.filterCategory);
    }

    const filtered=this.order(pool);
    const edit=this.state.editing;
    const contextLabel=q
      ? t('Search results','نتائج البحث')
      : this.state.view==='favorites'
        ? t('Favorites','المفضلة')
        : this.state.view==='recent'
          ? t('Recently used','المستخدمة مؤخرًا')
          : this.state.view==='categories'
            ? (this.state.category==='__uncategorized'?t('Uncategorized','غير مصنفة'):this.state.category||t('Choose a category','اختر تصنيفًا'))
            : t('All items','كل الأصناف');

    const picker=Boolean(this.props.onSelectMany);
    const selectedCount=this.state.selectedIds.length;
    const selectedIds=new Set(this.state.selectedIds);
    const allVisibleSelected=Boolean(filtered.length)&&filtered.every(item=>selectedIds.has(item.id));
    const quickFiltersVisible=this.state.view!=='categories'&&(categories.length>0||uncategorizedCount>0);

    const library=<div className={`saved-items-shell ${picker?'is-picker':''}`}>
      <aside className="saved-items-list-pane">
        <div className="saved-items-smart-nav" role="tablist" aria-label={t('Product library views','طرق عرض مكتبة الأصناف')}>
          <button type="button" role="tab" aria-selected={this.state.view==='favorites'} className={this.state.view==='favorites'?'active':''} onClick={()=>this.setView('favorites')}>
            <span aria-hidden="true">★</span><strong>{t('Favorites','المفضلة')}</strong><small>{favoriteCount}</small>
          </button>
          <button type="button" role="tab" aria-selected={this.state.view==='recent'} className={this.state.view==='recent'?'active':''} onClick={()=>this.setView('recent')}>
            <strong>{t('Recent','الأخيرة')}</strong><small>{Math.min(this.props.items.length,24)}</small>
          </button>
          <button type="button" role="tab" aria-selected={this.state.view==='categories'} className={this.state.view==='categories'?'active':''} onClick={()=>this.setView('categories')}>
            <strong>{t('Categories','التصنيفات')}</strong><small>{categories.length+(uncategorizedCount?1:0)}</small>
          </button>
          <button type="button" role="tab" aria-selected={this.state.view==='all'} className={this.state.view==='all'?'active':''} onClick={()=>this.setView('all')}>
            <strong>{t('All','الكل')}</strong><small>{this.props.items.length}</small>
          </button>
        </div>

        <div className="saved-items-toolbar">
          <div className="search-box saved-items-search-box">
            <Icon name="search"/>
            <Input
              className="saved-items-search-input"
              aria-label={t('Search saved items','بحث في الأصناف المحفوظة')}
              value={this.state.query}
              placeholder={t('Search name, code, category or tag','ابحث بالاسم أو الكود أو التصنيف أو الوسم')}
              onChange={(e:any)=>this.setState({query:e.target.value})}
            />
            {rawQuery
              ? <IconButton icon="x" className="saved-items-search-clear" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>
              : <span className="saved-items-search-shortcut" aria-hidden="true">/</span>}
          </div>
          <Select className="saved-items-sort" aria-label={t('Sort saved items','ترتيب الأصناف')} value={this.state.sortMode} onChange={(e:any)=>this.setState({sortMode:e.target.value})}>
            <option value="smart">{t('Most used','الأكثر استخدامًا')}</option>
            <option value="recent">{t('Latest used','آخر استخدام')}</option>
            <option value="name">{t('A–Z','أبجدي')}</option>
            <option value="category">{t('By category','حسب التصنيف')}</option>
          </Select>
          <Button icon="plus" variant="primary" onClick={this.newItem}>
            {rawQuery?t(`Add “${rawQuery}”`,`إضافة «${rawQuery}»`):t('New item','صنف جديد')}
          </Button>
        </div>

        {quickFiltersVisible
          ? <div className="saved-items-quick-filters" aria-label={t('Quick category filter','فلتر التصنيف السريع')}>
              <button type="button" className={!this.state.filterCategory?'active':''} onClick={()=>this.setState({filterCategory:''})}>
                <span>{t('All categories','كل التصنيفات')}</span><small>{basePoolCount}</small>
              </button>
              {categories.map(category=>{
                const count=basePool.filter(item=>categoryOf(item)===category).length;
                if(!count)return null;
                return <button type="button" key={category} className={this.state.filterCategory===category?'active':''} onClick={()=>this.setState({filterCategory:this.state.filterCategory===category?'':category})}>
                  <span>{category}</span><small>{count}</small>
                </button>;
              })}
              {basePool.some(item=>!categoryOf(item))
                ? <button type="button" className={this.state.filterCategory==='__uncategorized'?'active':''} onClick={()=>this.setState({filterCategory:this.state.filterCategory==='__uncategorized'?'':'__uncategorized'})}>
                    <span>{t('Uncategorized','غير مصنفة')}</span><small>{basePool.filter(item=>!categoryOf(item)).length}</small>
                  </button>
                : null}
            </div>
          : null}

        {this.state.view==='categories'&&!q
          ? <div className="saved-items-categories" aria-label={t('Item categories','تصنيفات الأصناف')}>
              {categories.map(category=><button type="button" key={category} className={this.state.category===category?'active':''} onClick={()=>this.setState({category})}>
                <span>{category}</span><small>{this.props.items.filter(item=>categoryOf(item)===category).length}</small>
              </button>)}
              {uncategorizedCount
                ? <button type="button" className={this.state.category==='__uncategorized'?'active':''} onClick={()=>this.setState({category:'__uncategorized'})}>
                    <span>{t('Uncategorized','غير مصنفة')}</span><small>{uncategorizedCount}</small>
                  </button>
                : null}
            </div>
          : null}

        <div className="saved-items-list-context">
          <strong>{contextLabel}{this.state.filterCategory?` · ${this.state.filterCategory==='__uncategorized'?t('Uncategorized','غير مصنفة'):this.state.filterCategory}`:''}</strong>
          <span><b>{filtered.length}</b>{basePoolCount!==filtered.length?<><i>/</i>{basePoolCount}</>:null}</span>
        </div>

        <div className="saved-items-list">
          {filtered.map(item=>{
            const selected=selectedIds.has(item.id);
            return <article key={item.id} className={`saved-item-row ${item.favorite?'is-favorite ':''}${selected?'is-selected':''}`}>
              <button type="button" className={`saved-item-favorite ${item.favorite?'is-active':''}`} aria-pressed={Boolean(item.favorite)} aria-label={item.favorite?t('Remove from favorites','إزالة من المفضلة'):t('Add to favorites','إضافة إلى المفضلة')} disabled={Boolean(this.state.favoriteBusyId)} onClick={()=>void this.toggleFavorite(item)}>
                <span aria-hidden="true">★</span>
              </button>
              <button type="button" className="saved-item-main" aria-pressed={picker?selected:undefined} onClick={()=>this.selectItem(item)}>
                <strong>{titleOf(item)}</strong>
                {item.descriptionEn&&item.descriptionAr?<span dir={isArabic()?'ltr':'rtl'}>{isArabic()?item.descriptionEn:item.descriptionAr}</span>:null}
                <div className="saved-item-row-meta">
                  {categoryOf(item)?<em>{categoryOf(item)}</em>:null}
                  {(item.tags??[]).slice(0,2).map(tag=><em key={tag}>#{tag}</em>)}
                </div>
                <small>{[item.unit,item.lastUnitPrice?`${item.lastUnitPrice} ${item.lastCurrency}`:'',item.origin].filter(Boolean).join(' · ')}</small>
              </button>
              <IconButton icon="edit" label={t('Edit','تعديل')} onClick={()=>this.beginEdit(item)}/>
            </article>;
          })}
        </div>

        {!filtered.length
          ? <div className="saved-items-empty">
              <Icon name="file"/>
              <strong>{rawQuery?t('No matching saved item','لا يوجد صنف محفوظ مطابق'):this.state.filterCategory?t('No items in this category','لا توجد أصناف في هذا التصنيف'):this.state.view==='favorites'?t('No favorites yet','لا توجد مفضلة بعد'):this.state.view==='categories'&&!this.state.category?t('Choose a category','اختر تصنيفًا'):t('No saved items here','لا توجد أصناف هنا')}</strong>
              <span>{rawQuery?t('Create it without typing the description again.','أنشئه دون إعادة كتابة الوصف.'):this.state.filterCategory?t('Clear the category filter or choose another category.','امسح فلتر التصنيف أو اختر تصنيفًا آخر.'):this.state.view==='favorites'?t('Star frequently used products so they stay one tap away.','ضع نجمة على الأصناف المتكررة لتبقى على بُعد نقرة واحدة.'):this.state.view==='categories'&&!this.state.category?t('Categories keep large product libraries fast and predictable.','التصنيفات تجعل مكتبات الأصناف الكبيرة سريعة ومرتبة.'):t('Create reusable product profiles for faster quotes and invoices.','أنشئ أصنافًا قابلة لإعادة الاستخدام لتسريع عروض الأسعار والفواتير.')}</span>
              {rawQuery?<Button icon="plus" variant="primary" onClick={this.newItem}>{t(`Create “${rawQuery}”`,`إنشاء «${rawQuery}»`)}</Button>:null}
            </div>
          : null}

        {this.state.error&&!edit?<div className="saved-items-list-error inline-error" role="alert">{this.state.error}</div>:null}

        {picker
          ? <div className="saved-items-picker-bar">
              <div>
                <strong>{selectedCount?t(`${selectedCount} selected`,`${selectedCount} محدد`):t('Select one or more items','اختر صنفًا واحدًا أو أكثر')}</strong>
                <small>{filtered.length?t(`${filtered.length} currently visible`,`${filtered.length} ظاهر حاليًا`):t('Use search or categories to find products.','استخدم البحث أو التصنيفات للعثور على الأصناف.')}</small>
              </div>
              {filtered.length
                ? <Button variant="ghost" onClick={()=>this.toggleVisibleSelection(filtered)}>
                    {allVisibleSelected?t('Deselect visible','إلغاء الظاهر'):t('Select visible','تحديد الظاهر')}
                  </Button>
                : null}
              {selectedCount?<Button variant="ghost" onClick={()=>this.setState({selectedIds:[]})}>{t('Clear','مسح')}</Button>:null}
              <Button icon="plus" variant="primary" disabled={!selectedCount||this.state.busy} onClick={()=>void this.addSelected()}>
                {this.state.busy?t('Adding…','جارٍ الإضافة…'):t(`Add ${selectedCount||''}`.trim(),`إضافة ${selectedCount||''}`.trim())}
              </Button>
            </div>
          : null}
      </aside>

      <section className={`saved-item-editor ${edit?'is-open':''}`}>
        {edit
          ? <>
              <div className="saved-item-editor-head">
                <div><p className="eyebrow">{t('Product library','مكتبة الأصناف')}</p><h3>{edit.descriptionEn||edit.descriptionAr||t('New saved item','صنف محفوظ جديد')}</h3></div>
                <IconButton icon="x" label={t('Close editor','إغلاق التحرير')} onClick={this.requestEditorClose}/>
              </div>
              <div className="form-grid two">
                <Field label={t('Description English','الوصف بالإنجليزية')}><Input autoFocus={!isArabic()} value={edit.descriptionEn} onChange={(e:any)=>this.set('descriptionEn',e.target.value)}/></Field>
                <Field label={t('Description Arabic','الوصف بالعربية')}><Input autoFocus={isArabic()} dir="rtl" value={edit.descriptionAr} onChange={(e:any)=>this.set('descriptionAr',e.target.value)}/></Field>
                <Field label={t('Category','التصنيف')} hint={t('Type a new category or tap one below.','اكتب تصنيفًا جديدًا أو اختر واحدًا أدناه.')}>
                  <Input value={edit.category??''} onChange={(e:any)=>this.set('category',e.target.value)}/>
                  {categories.length?<span className="saved-item-category-suggestions">{categories.slice(0,8).map(category=><button type="button" key={category} className={categoryOf(edit)===category?'active':''} onClick={()=>this.set('category',category)}>{category}</button>)}</span>:null}
                </Field>
                <Field label={t('Tags','الوسوم')} hint={t('Separate tags with English or Arabic commas.','افصل الوسوم بفواصل إنجليزية أو عربية.')}>
                  <Input value={(edit.tags??[]).join(', ')} placeholder={t('e.g. 250ml, Energy','مثال: 250مل، طاقة')} onChange={(e:any)=>this.set('tags',parseSavedItemTags(String(e.target.value)))}/>
                </Field>
                <Field label="HS Code"><Input value={edit.hsCode} onChange={(e:any)=>this.set('hsCode',e.target.value)}/></Field>
                <Field label={t('Origin','المنشأ')}><Input value={edit.origin} onChange={(e:any)=>this.set('origin',e.target.value)}/></Field>
                <Field label={t('Packing','التعبئة')}><Input value={edit.packing} onChange={(e:any)=>this.set('packing',e.target.value)}/></Field>
                <Field label={t('Unit','الوحدة')}><Input value={edit.unit} onChange={(e:any)=>this.set('unit',e.target.value)}/></Field>
                <Field label={t('Last price','آخر سعر')}><Input inputMode="decimal" value={edit.lastUnitPrice} onChange={(e:any)=>this.set('lastUnitPrice',e.target.value)}/></Field>
                <Field label={t('Currency','العملة')}><Input value={edit.lastCurrency} onChange={(e:any)=>this.set('lastCurrency',e.target.value.toUpperCase())}/></Field>
              </div>
              <div className="saved-item-favorite-toggle">
                <Toggle checked={Boolean(edit.favorite)} onChange={favorite=>this.set('favorite',favorite)} label={t('Keep this item in Favorites','إبقاء هذا الصنف في المفضلة')}/>
              </div>
              {this.state.error?<div className="inline-error" role="alert">{this.state.error}</div>:null}
              <div className="saved-item-editor-actions">
                {this.props.items.some(item=>item.id===edit.id)
                  ? <Button variant="danger" icon="trash" disabled={this.state.busy} onClick={()=>this.setState({deleting:structuredClone(edit),error:''})}>{t('Delete','حذف')}</Button>
                  : <span/>}
                <Button variant="primary" icon="save" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save item','حفظ الصنف')}</Button>
              </div>
            </>
          : <div className="saved-item-editor-placeholder">
              <Icon name={picker?'check':'edit'} size={28}/>
              <strong>{picker?t('Select items to add','اختر الأصناف لإضافتها'):t('Select an item to edit','اختر صنفًا لتعديله')}</strong>
              <span>{picker?t('Filter by category, select several products, then add them in one step.','صفِّ حسب التصنيف، اختر عدة أصناف، ثم أضفها بخطوة واحدة.'):t('Favorites, recent items and categories keep even a large catalog fast to use.','المفضلة والأصناف الأخيرة والتصنيفات تجعل حتى المكتبة الكبيرة سريعة وسهلة الاستخدام.')}</span>
            </div>}
      </section>
    </div>;

    return <>
      {this.props.embedded
        ? <div className="saved-items-embedded">{library}</div>
        : <Modal open={this.props.open} title={t('Saved Items','الأصناف المحفوظة')} size="xl" onClose={this.requestModalClose}>{library}</Modal>}
      <ConfirmDialog
        open={Boolean(this.state.discardAction)}
        title={t('Discard item changes?','تجاهل تعديلات الصنف؟')}
        message={t('You have unsaved item changes. Discard them and continue?','لديك تعديلات غير محفوظة على الصنف. هل تريد تجاهلها والمتابعة؟')}
        confirmLabel={t('Discard','تجاهل')}
        onCancel={()=>this.setState({discardAction:'',pendingSelect:null})}
        onConfirm={this.confirmDiscard}
      />
      <ConfirmDialog
        open={Boolean(this.state.deleting)}
        title={t('Delete saved item?','حذف الصنف المحفوظ؟')}
        message={t('This removes the item from the reusable product library. Existing documents are not changed.','سيتم حذف الصنف من مكتبة الأصناف القابلة لإعادة الاستخدام، ولن تتغير المستندات الحالية.')}
        onCancel={()=>{if(!this.state.busy)this.setState({deleting:null});}}
        onConfirm={()=>void this.remove()}
      />
    </>;
  }
}
