import type { SavedItem } from '../types.js';
import { makeId } from '../lib/id.js';
import { decimalToScaled, isDecimalInput, normalizeDecimalInput } from '../lib/money.js';
import { categoryChoices } from '../lib/product-presets.js';
import { findSavedItemDuplicate, normalizeSavedItemSku, parseSavedItemTags, savedItemSearchText, sortSavedItems } from '../lib/saved-items.js';
import { isArabic, t } from '../lib/i18n.js';
import { displayUnitPreset } from '../lib/unit-display.js';
import { Button, ConfirmDialog, Field, Icon, IconButton, Input, Select, Toggle } from './UI.js';
import { ProductImportModal } from './ProductImportModal.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onSaveMany:(items:SavedItem[])=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
  onInspectInventory?:(item:SavedItem)=>void;
  onInspectPurchases?:(item:SavedItem)=>void;
}

type SortMode='smart'|'name'|'recent'|'sku';
type DiscardAction=''|'close'|'new'|'select'|'import';
interface State {
  query:string;category:string;favoriteOnly:boolean;sortMode:SortMode;
  editing:SavedItem|null;editingInitial:string;deleting:SavedItem|null;
  busy:boolean;error:string;importOpen:boolean;discardAction:DiscardAction;pendingEdit:SavedItem|null;
  selectionMode:boolean;selectedIds:string[];libraryMenuOpen:boolean;rowMenuId:string|null;bulkDeleteConfirm:boolean;
}

function titleOf(item:SavedItem):string{return(isArabic()?item.descriptionAr:item.descriptionEn)||item.descriptionEn||item.descriptionAr||t('Untitled item','صنف بلا اسم');}
function categoryOf(item:SavedItem):string{return(item.category??'').trim();}
function recentStamp(item:SavedItem):string{return item.lastUsedAt||item.updatedAt||item.createdAt||'';}
function blank(currency:string):SavedItem{
  const now=new Date().toISOString(),normalizedCurrency=(currency||'USD').trim().toUpperCase();
  return{id:makeId('product'),createdAt:now,updatedAt:now,sku:'',descriptionEn:'',descriptionAr:'',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitPrice:'',lastCurrency:normalizedCurrency,lastUnitCost:'',lastCostCurrency:normalizedCurrency,usageCount:0,lastUsedAt:now,category:'',tags:[],favorite:false};
}
function ranked(items:SavedItem[],values:(item:SavedItem)=>string[],limit:number):string[]{
  const map=new Map<string,{value:string;score:number;recent:string}>();
  items.forEach(item=>values(item).map(value=>value.trim()).filter(Boolean).forEach(value=>{
    const key=value.toLowerCase(),current=map.get(key)??{value,score:0,recent:''};current.score+=1+Math.max(0,item.usageCount||0);if(recentStamp(item)>current.recent)current.recent=recentStamp(item);map.set(key,current);
  }));
  return Array.from(map.values()).sort((a,b)=>b.score-a.score||b.recent.localeCompare(a.recent)).slice(0,limit).map(entry=>entry.value);
}

/** v320 product catalog: TailAdmin structure with the existing LOUREX mutation/dirty-state logic intact. */
export class ProductLibraryWorkspace extends React.Component<Props,State>{
  private mutationInFlight=false;
  state:State={query:'',category:'',favoriteOnly:false,sortMode:'smart',editing:null,editingInitial:'',deleting:null,busy:false,error:'',importOpen:false,discardAction:'',pendingEdit:null,selectionMode:false,selectedIds:[],libraryMenuOpen:false,rowMenuId:null,bulkDeleteConfirm:false};

  componentDidMount():void{document.addEventListener('pointerdown',this.closeMenus);document.addEventListener('keydown',this.closeMenusOnEscape);window.addEventListener('lourex-open-product-editor',this.handleQuickCreate);window.addEventListener('beforeunload',this.handleBeforeUnload);this.syncDirtyMarker();}
  componentDidUpdate():void{this.syncDirtyMarker();}
  componentWillUnmount():void{document.removeEventListener('pointerdown',this.closeMenus);document.removeEventListener('keydown',this.closeMenusOnEscape);window.removeEventListener('lourex-open-product-editor',this.handleQuickCreate);window.removeEventListener('beforeunload',this.handleBeforeUnload);if(document.documentElement.getAttribute('data-lourex-workspace-dirty')==='products')document.documentElement.removeAttribute('data-lourex-workspace-dirty');}
  private handleQuickCreate=()=>this.newItem();
  private closeMenus=(event:PointerEvent)=>{const target=event.target;if(target instanceof Element&&target.closest('.ta-product-overflow,.ta-product-row-menu-wrap'))return;if(this.state.libraryMenuOpen||this.state.rowMenuId)this.setState({libraryMenuOpen:false,rowMenuId:null});};
  private closeMenusOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&(this.state.libraryMenuOpen||this.state.rowMenuId))this.setState({libraryMenuOpen:false,rowMenuId:null});};
  private mutating=():boolean=>this.mutationInFlight||this.state.busy;
  private set=(key:keyof SavedItem,value:any)=>this.setState(state=>({editing:state.editing?{...state.editing,[key]:value}:null,error:''}));

  private loadEdit=(item:SavedItem)=>{const editing=structuredClone({...item,sku:item.sku??'',category:item.category??'',tags:[...(item.tags??[])],favorite:Boolean(item.favorite),lastUnitCost:item.lastUnitCost??'',lastCostCurrency:item.lastCostCurrency??item.lastCurrency??this.props.currency??'USD'});this.setState({editing,editingInitial:JSON.stringify(editing),error:'',discardAction:'',pendingEdit:null,rowMenuId:null});};
  private editingDirty=():boolean=>Boolean(this.state.editing&&(!this.state.editingInitial||JSON.stringify(this.state.editing)!==this.state.editingInitial));
  private syncDirtyMarker=()=>{const root=document.documentElement;if(this.editingDirty())root.setAttribute('data-lourex-workspace-dirty','products');else if(root.getAttribute('data-lourex-workspace-dirty')==='products')root.removeAttribute('data-lourex-workspace-dirty');};
  private handleBeforeUnload=(event:BeforeUnloadEvent)=>{if(!this.editingDirty())return;event.preventDefault();event.returnValue='';};
  private beginEdit=(item:SavedItem)=>{if(this.mutating()||this.state.selectionMode||this.state.editing?.id===item.id)return;if(this.editingDirty()){this.setState({discardAction:'select',pendingEdit:item});return;}this.loadEdit(item);};
  private newItem=()=>{if(this.mutating()||this.state.selectionMode)return;if(this.editingDirty()){this.setState({discardAction:'new',pendingEdit:null});return;}this.loadEdit(blank(this.props.currency));};
  private requestClose=()=>{if(this.mutating())return;if(this.editingDirty()){this.setState({discardAction:'close',pendingEdit:null});return;}this.setState({editing:null,editingInitial:'',error:''});};
  private requestImport=()=>{if(this.mutating()||this.state.selectionMode)return;if(this.editingDirty()){this.setState({discardAction:'import',pendingEdit:null});return;}this.setState({importOpen:true,libraryMenuOpen:false,rowMenuId:null});};
  private clearFilters=()=>this.setState({query:'',category:'',favoriteOnly:false});
  private confirmDiscard=()=>{const action=this.state.discardAction,pending=this.state.pendingEdit;if(action==='select'&&pending){this.loadEdit(pending);return;}if(action==='new'){this.loadEdit(blank(this.props.currency));return;}if(action==='import'){this.setState({editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null,importOpen:true});return;}this.setState({editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});};
  private duplicate=(source:SavedItem)=>{
    if(this.mutating()||this.state.selectionMode)return;
    if(this.editingDirty()){this.setState({error:t('Save or discard the current changes before duplicating this product.','احفظ التعديلات الحالية أو تجاهلها قبل نسخ هذا الصنف.')});return;}
    const now=new Date().toISOString();
    const copy:SavedItem={...structuredClone(source),id:makeId('product'),createdAt:now,updatedAt:now,lastUsedAt:now,usageCount:0,sku:'',favorite:false,descriptionEn:source.descriptionEn?`${source.descriptionEn} Copy`:'',descriptionAr:source.descriptionAr?`${source.descriptionAr} - نسخة`:''};
    this.setState({editing:copy,editingInitial:'',error:'',discardAction:'',pendingEdit:null});
  };
  private beginSelection=(initialId?:string)=>{if(this.mutating())return;if(this.editingDirty()){this.setState({libraryMenuOpen:false,rowMenuId:null,error:t('Save or discard the current product changes before selecting products.','احفظ تعديلات الصنف الحالية أو تجاهلها قبل تحديد الأصناف.')});return;}this.setState({selectionMode:true,selectedIds:initialId?[initialId]:[],libraryMenuOpen:false,rowMenuId:null,editing:null,editingInitial:'',error:''});};
  private endSelection=()=>this.setState({selectionMode:false,selectedIds:[],bulkDeleteConfirm:false,libraryMenuOpen:false,rowMenuId:null,error:''});
  private toggleSelection=(id:string)=>{if(this.mutating())return;this.setState(state=>({selectedIds:state.selectedIds.includes(id)?state.selectedIds.filter(value=>value!==id):[...state.selectedIds,id]}));};
  private setVisibleSelection=(ids:string[])=>{if(this.mutating())return;const visible=new Set(ids),allVisibleSelected=ids.length>0&&ids.every(id=>this.state.selectedIds.includes(id));this.setState(state=>({selectedIds:allVisibleSelected?state.selectedIds.filter(id=>!visible.has(id)):Array.from(new Set([...state.selectedIds,...ids]))}));};
  private requestSingleDelete=(item:SavedItem)=>{if(this.mutating())return;if(this.editingDirty()){this.setState({rowMenuId:null,error:t('Save or discard the current product changes before deleting a product.','احفظ تعديلات الصنف الحالية أو تجاهلها قبل حذف صنف.')});return;}this.setState({deleting:structuredClone(item),rowMenuId:null,libraryMenuOpen:false,error:''});};
  private requestBulkDelete=()=>{if(this.mutating()||!this.state.selectedIds.length)return;this.setState({bulkDeleteConfirm:true,libraryMenuOpen:false,rowMenuId:null,error:''});};
  private removeSelected=async()=>{
    if(this.mutating())return;const selected=new Set(this.state.selectedIds),products=this.props.items.filter(item=>selected.has(item.id));if(!products.length){this.endSelection();return;}
    this.mutationInFlight=true;this.setState({busy:true,bulkDeleteConfirm:false,error:''});let deleted=0;
    try{for(const item of products){await this.props.onDelete(item);deleted+=1;}this.setState({busy:false,selectionMode:false,selectedIds:[],editing:null,editingInitial:'',error:'',rowMenuId:null,libraryMenuOpen:false});}
    catch(e){const remaining=products.slice(deleted).map(item=>item.id),base=e instanceof Error?e.message:t('Unable to delete the selected products.','تعذر حذف الأصناف المحددة.');this.setState({busy:false,selectionMode:true,selectedIds:remaining,error:deleted?t(`${deleted} products were deleted before the operation stopped. ${base}`,`تم حذف ${deleted} صنف قبل توقف العملية. ${base}`):base});}
    finally{this.mutationInFlight=false;}
  };
  private toggleTag=(tag:string)=>{const item=this.state.editing;if(!item)return;const current=item.tags??[],key=tag.toLowerCase();this.set('tags',current.some(value=>value.toLowerCase()===key)?current.filter(value=>value.toLowerCase()!==key):[...current,tag]);};
  private save=async()=>{
    const item=this.state.editing;if(!item||this.mutating())return;const sku=(item.sku??'').trim().toUpperCase();
    if(!item.descriptionEn.trim()&&!item.descriptionAr.trim()){this.setState({error:t('Enter an English or Arabic description.','أدخل وصفًا بالإنجليزية أو العربية.')});return;}
    if(!item.unit.trim()){this.setState({error:t('Unit is required.','الوحدة مطلوبة.')});return;}
    if(item.lastUnitPrice.trim()&&(!isDecimalInput(item.lastUnitPrice)||decimalToScaled(item.lastUnitPrice)<0n)){this.setState({error:t('Enter a valid non-negative sale price.','أدخل سعر بيع صالحًا يساوي صفرًا أو أكثر.')});return;}
    const cost=(item.lastUnitCost??'').trim();if(cost&&(!isDecimalInput(cost)||decimalToScaled(cost,12)<0n)){this.setState({error:t('Enter a valid non-negative unit cost.','أدخل تكلفة وحدة صالحة تساوي صفرًا أو أكثر.')});return;}
    const lastCurrency=(item.lastCurrency||this.props.currency||'USD').trim().toUpperCase();
    const candidate:SavedItem={...item,sku,lastCurrency,lastCostCurrency:cost?(item.lastCostCurrency||lastCurrency).trim().toUpperCase():'',category:categoryOf(item),tags:Array.from(new Set((item.tags??[]).map(tag=>tag.trim()).filter(Boolean))),lastUnitPrice:item.lastUnitPrice.trim()?normalizeDecimalInput(item.lastUnitPrice):'',lastUnitCost:cost?normalizeDecimalInput(cost):'',favorite:Boolean(item.favorite),updatedAt:new Date().toISOString()};
    const duplicate=findSavedItemDuplicate(this.props.items,candidate);
    if(duplicate){const duplicateSku=sku&&normalizeSavedItemSku(duplicate.sku??'')===normalizeSavedItemSku(sku);this.setState({error:duplicateSku?t(`SKU “${sku}” is already used by ${titleOf(duplicate)}.`,`SKU «${sku}» مستخدم بالفعل للصنف ${titleOf(duplicate)}.`):t(`A product named “${titleOf(duplicate)}” already exists.`,`يوجد صنف باسم «${titleOf(duplicate)}» بالفعل.`)});return;}
    this.mutationInFlight=true;this.setState({busy:true,error:''});
    try{await this.props.onSave(candidate);this.setState({busy:false,editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});}
    catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to save product.','تعذر حفظ الصنف.')});}
    finally{this.mutationInFlight=false;}
  };
  private remove=async()=>{const item=this.state.deleting;if(!item||this.mutating())return;this.mutationInFlight=true;this.setState({busy:true,error:''});try{await this.props.onDelete(item);this.setState({busy:false,deleting:null,editing:null,editingInitial:'',error:'',discardAction:'',pendingEdit:null});}catch(e){this.setState({busy:false,deleting:null,error:e instanceof Error?e.message:t('Unable to delete product.','تعذر حذف الصنف.')});}finally{this.mutationInFlight=false;}};
  private toggleFavorite=async(item:SavedItem)=>{if(this.mutating()||this.state.selectionMode)return;const editing=this.state.editing;if(editing?.id===item.id){this.set('favorite',!Boolean(editing.favorite));return;}this.mutationInFlight=true;this.setState({busy:true,error:''});try{await this.props.onSave({...item,favorite:!Boolean(item.favorite),updatedAt:new Date().toISOString()});this.setState({busy:false});}catch(e){this.setState({busy:false,error:e instanceof Error?e.message:t('Unable to update favorite.','تعذر تحديث المفضلة.')});}finally{this.mutationInFlight=false;}};
  private ordered=(items:SavedItem[]):SavedItem[]=>{if(this.state.sortMode==='smart')return sortSavedItems(items);if(this.state.sortMode==='recent')return[...items].sort((a,b)=>recentStamp(b).localeCompare(recentStamp(a)));if(this.state.sortMode==='sku')return[...items].sort((a,b)=>(a.sku||'~~~~').localeCompare(b.sku||'~~~~',undefined,{numeric:true,sensitivity:'base'}));return[...items].sort((a,b)=>titleOf(a).localeCompare(titleOf(b),isArabic()?'ar':'en',{numeric:true,sensitivity:'base'}));};

  render():any{
    const query=this.state.query.trim().toLowerCase();
    const categories=Array.from(new Set(this.props.items.map(categoryOf).filter(Boolean))).sort((a,b)=>a.localeCompare(b,isArabic()?'ar':'en',{sensitivity:'base'}));
    const categoryPresets=categoryChoices(isArabic()),categoryPresetMap=new Map(categoryPresets.map(choice=>[choice.value,choice.label])),categoryLabel=(value:string)=>categoryPresetMap.get(value)||value;
    const existingCategorySet=new Set(categories),categorySuggestions=[...categories.map(value=>({value,label:categoryLabel(value)})),...categoryPresets.filter(choice=>!existingCategorySet.has(choice.value))];
    const tags=ranked(this.props.items,item=>item.tags??[],18),hsCodes=ranked(this.props.items,item=>item.hsCode?[item.hsCode]:[],12);
    let filtered=this.props.items.filter(item=>(!query||savedItemSearchText(item).includes(query))&&(!this.state.category||categoryOf(item)===this.state.category)&&(!this.state.favoriteOnly||Boolean(item.favorite)));filtered=this.ordered(filtered);
    const edit=this.state.editing,favorites=this.props.items.filter(item=>item.favorite).length,skuCount=this.props.items.filter(item=>Boolean(item.sku?.trim())).length,filtersActive=Boolean(query||this.state.category||this.state.favoriteOnly),selectedSet=new Set(this.state.selectedIds),selectedCount=this.state.selectedIds.length,visibleIds=filtered.map(item=>item.id),allVisibleSelected=visibleIds.length>0&&visibleIds.every(id=>selectedSet.has(id));

    return <div className={`ta-product-library ${edit?'is-editor-open':''} ${this.state.selectionMode?'is-selection-mode':''}`}>
      <section className="ta-product-commandbar">
        <div className="ta-product-search"><Icon name="search"/><Input aria-label={t('Search product library','بحث في مكتبة الأصناف')} value={this.state.query} placeholder={t('Search name, SKU, HS code, category…','ابحث بالاسم أو SKU أو HS Code أو التصنيف…')} onChange={(e:any)=>this.setState({query:e.target.value})}/>{this.state.query?<IconButton icon="x" label={t('Clear search','مسح البحث')} onClick={()=>this.setState({query:''})}/>:<kbd aria-hidden="true">/</kbd>}</div>
        <Select className="ta-product-filter" aria-label={t('Filter category','فلتر التصنيف')} value={this.state.category} disabled={this.state.selectionMode} onChange={(e:any)=>this.setState({category:e.target.value})}><option value="">{t('All categories','كل التصنيفات')}</option>{categories.map(category=><option key={category} value={category}>{categoryLabel(category)}</option>)}</Select>
        <Select className="ta-product-sort" aria-label={t('Sort products','ترتيب الأصناف')} value={this.state.sortMode} disabled={this.state.selectionMode} onChange={(e:any)=>this.setState({sortMode:e.target.value})}><option value="smart">{t('Most used','الأكثر استخدامًا')}</option><option value="recent">{t('Recently updated','الأحدث')}</option><option value="name">{t('Name A–Z','الاسم أبجديًا')}</option><option value="sku">SKU</option></Select>
        <Button icon="upload" disabled={this.state.selectionMode} onClick={this.requestImport}>{t('Import','استيراد')}</Button>
        <Button icon="plus" variant="primary" disabled={this.state.selectionMode} onClick={this.newItem}>{t('New Product','صنف جديد')}</Button>
        <div className="ta-product-overflow"><IconButton icon="more" label={t('Product actions','إجراءات الأصناف')} aria-expanded={this.state.libraryMenuOpen} onClick={()=>this.setState(state=>({libraryMenuOpen:!state.libraryMenuOpen,rowMenuId:null}))}/>{this.state.libraryMenuOpen?<div className="ta-product-menu" role="menu"><button type="button" role="menuitem" onClick={()=>this.beginSelection()}><Icon name="check"/><span>{t('Select products','تحديد أصناف')}</span></button><button type="button" role="menuitem" onClick={this.requestImport}><Icon name="upload"/><span>{t('Import catalog','استيراد كتالوج')}</span></button></div>:null}</div>
      </section>

      <section className="ta-product-metrics" aria-label={t('Catalog summary','ملخص الكتالوج')}>
        <button type="button" className={!filtersActive?'is-active':''} disabled={this.state.selectionMode} onClick={this.clearFilters}><span className="ta-product-metric-icon"><Icon name="items"/></span><span><small>{t('Products','الأصناف')}</small><strong>{this.props.items.length}</strong></span></button>
        <div><span className="ta-product-metric-icon"><Icon name="file"/></span><span><small>{t('With SKU','مع SKU')}</small><strong>{skuCount}</strong></span></div>
        <button type="button" className={this.state.favoriteOnly?'is-active':''} disabled={this.state.selectionMode} onClick={()=>this.setState(state=>({favoriteOnly:!state.favoriteOnly}))}><span className="ta-product-metric-icon"><Icon name="star"/></span><span><small>{t('Favorites','المفضلة')}</small><strong>{favorites}</strong></span></button>
        <div><span className="ta-product-metric-icon"><Icon name="chart"/></span><span><small>{t('Categories','التصنيفات')}</small><strong>{categories.length}</strong></span></div>
      </section>

      <div className="ta-product-layout">
        <section className="ta-product-register">
          {this.state.selectionMode?<div className="ta-product-selection-bar"><div><strong>{t(`${selectedCount} selected`,`${selectedCount} محدد`)}</strong><span>{t(`${filtered.length} visible products`,`${filtered.length} صنف ظاهر`)}</span></div><div><Button variant="ghost" disabled={!visibleIds.length} onClick={()=>this.setVisibleSelection(visibleIds)}>{allVisibleSelected?t('Clear visible','إلغاء تحديد الظاهر'):t('Select visible','تحديد الظاهر')}</Button><Button icon="trash" variant="danger" disabled={!selectedCount||this.state.busy} onClick={this.requestBulkDelete}>{t('Delete selected','حذف المحدد')}</Button><Button variant="ghost" disabled={this.state.busy} onClick={this.endSelection}>{t('Done','تم')}</Button></div></div>:<header className="ta-product-register-header"><div><small>{t('Catalog','الكتالوج')}</small><h2>{this.state.favoriteOnly?t('Favorite products','الأصناف المفضلة'):this.state.category?categoryLabel(this.state.category):t('Product catalog','كتالوج الأصناف')}</h2><span>{t(`${filtered.length} visible`,`${filtered.length} ظاهر`)}</span></div>{filtersActive?<button type="button" onClick={this.clearFilters}>{t('Clear filters','مسح التصفية')}</button>:null}</header>}
          {this.state.error&&!edit?<div className="ta-product-error" role="alert">{this.state.error}</div>:null}
          <div className="ta-product-table" role="table">
            <div className="ta-product-table-head" role="row"><span>{t('Product','الصنف')}</span><span>SKU</span><span>{t('Category','التصنيف')}</span><span>{t('Commercial','تجاري')}</span><span>{t('Price','السعر')}</span><span aria-label={t('Actions','الإجراءات')}/></div>
            {filtered.map(item=>{
              const active=edit?.id===item.id,selected=selectedSet.has(item.id),rowFavorite=active?Boolean(edit?.favorite):Boolean(item.favorite),cost=item.lastUnitCost?.trim()?`${item.lastUnitCost} ${item.lastCostCurrency||item.lastCurrency}`:'';
              return <article key={item.id} className={`ta-product-row ${active?'is-active':''} ${selected?'is-selected':''}`} role="row">
                <div className="ta-product-row-leading">{this.state.selectionMode?<button type="button" className="ta-product-select" aria-label={selected?t('Unselect product','إلغاء تحديد الصنف'):t('Select product','تحديد الصنف')} aria-pressed={selected} onClick={()=>this.toggleSelection(item.id)}>{selected?<Icon name="check" size={15}/>:null}</button>:<button type="button" className={`ta-product-favorite ${rowFavorite?'is-on':''}`} aria-label={rowFavorite?t('Remove favorite','إزالة من المفضلة'):t('Add favorite','إضافة للمفضلة')} aria-pressed={rowFavorite} onClick={()=>void this.toggleFavorite(item)}><Icon name="star" size={15}/></button>}</div>
                <button type="button" className="ta-product-row-main" onClick={()=>this.state.selectionMode?this.toggleSelection(item.id):this.beginEdit(item)}>
                  <span className="ta-product-name"><strong>{titleOf(item)}</strong>{item.descriptionEn&&item.descriptionAr?<small>{isArabic()?item.descriptionEn:item.descriptionAr}</small>:null}</span>
                  <code>{item.sku||'—'}</code>
                  <span className="ta-product-category">{categoryOf(item)?categoryLabel(categoryOf(item)):t('Uncategorized','بدون تصنيف')}</span>
                  <span className="ta-product-commercial"><small>{[displayUnitPreset(item.unit,isArabic()),cost?`${t('Cost','تكلفة')} ${cost}`:'',item.origin,item.hsCode?`HS ${item.hsCode}`:''].filter(Boolean).join(' · ')||'—'}</small>{(item.tags??[]).length?<em>{(item.tags??[]).slice(0,2).map(tag=>`#${tag}`).join(' · ')}</em>:null}</span>
                  <strong className="ta-product-price"><bdi>{item.lastUnitPrice?`${item.lastUnitPrice} ${item.lastCurrency}`:t('No price','بدون سعر')}</bdi></strong>
                </button>
                {!this.state.selectionMode?<div className="ta-product-row-menu-wrap"><IconButton icon="more" label={t('Product actions','إجراءات الصنف')} aria-expanded={this.state.rowMenuId===item.id} onClick={()=>this.setState(state=>({rowMenuId:state.rowMenuId===item.id?null:item.id,libraryMenuOpen:false}))}/>{this.state.rowMenuId===item.id?<div className="ta-product-menu ta-product-row-menu" role="menu">{this.props.onInspectInventory?<button type="button" role="menuitem" onClick={()=>{this.setState({rowMenuId:null});this.props.onInspectInventory?.(item);}}><Icon name="items"/><span>{t('Stock History','سجل المخزون')}</span></button>:null}{this.props.onInspectPurchases?<button type="button" role="menuitem" onClick={()=>{this.setState({rowMenuId:null});this.props.onInspectPurchases?.(item);}}><Icon name="backup"/><span>{t('Purchase History','سجل المشتريات')}</span></button>:null}<button type="button" role="menuitem" onClick={()=>this.beginEdit(item)}><Icon name="edit"/><span>{t('Edit','تعديل')}</span></button><button type="button" role="menuitem" onClick={()=>this.beginSelection(item.id)}><Icon name="check"/><span>{t('Select','تحديد')}</span></button><button type="button" role="menuitem" className="is-danger" onClick={()=>this.requestSingleDelete(item)}><Icon name="trash"/><span>{t('Delete','حذف')}</span></button></div>:null}</div>:null}
              </article>;
            })}
            {!filtered.length?<div className="ta-product-empty"><span><Icon name="items" size={28}/></span><h3>{this.props.items.length?t('No products match these filters','لا توجد أصناف مطابقة لهذه الفلاتر'):t('Your product library is ready','مكتبة الأصناف جاهزة')}</h3><p>{this.props.items.length?t('Clear the filters or try another search.','امسح الفلاتر أو جرّب بحثًا آخر.'):t('Add your first product or import an Excel/CSV catalog.','أضف أول صنف أو استورد كتالوج Excel/CSV.')}</p>{!this.props.items.length?<div><Button icon="upload" onClick={this.requestImport}>{t('Import catalog','استيراد كتالوج')}</Button><Button icon="plus" variant="primary" onClick={this.newItem}>{t('New Product','صنف جديد')}</Button></div>:null}</div>:null}
          </div>
        </section>

        <aside className={`ta-product-editor ${edit?'is-open':''}`}>
          {edit?<><header className="ta-product-editor-header"><div><small>{this.props.items.some(item=>item.id===edit.id)?t('Edit saved product','تعديل صنف محفوظ'):t('New saved product','صنف محفوظ جديد')}</small><h2>{titleOf(edit)}</h2>{edit.sku?<code>{edit.sku}</code>:null}</div><IconButton icon="x" label={t('Close editor','إغلاق التحرير')} onClick={this.requestClose}/></header>
            <div className="ta-product-editor-scroll">
              <section className="ta-product-editor-section"><header><span>01</span><div><strong>{t('Identity','الهوية')}</strong><small>{t('Name and internal product code','الاسم والكود الداخلي للصنف')}</small></div></header><div className="ta-product-form-grid"><Field label="SKU / Item Code" hint={t('Optional, but recommended for imports and price updates.','اختياري، لكنه موصى به للاستيراد وتحديث الأسعار.')}><Input value={edit.sku??''} placeholder="e.g. RB-250-ORG" autoCapitalize="characters" spellCheck={false} onChange={(e:any)=>this.set('sku',String(e.target.value).toUpperCase())}/></Field><div className="ta-product-sku-note"><Icon name="lock"/><span>{t('SKU must be unique when used.','عند استخدام SKU يجب أن يكون فريدًا.')}</span></div><Field label={t('Description English','الوصف بالإنجليزية')}><Input autoFocus={!isArabic()} value={edit.descriptionEn} onChange={(e:any)=>this.set('descriptionEn',e.target.value)}/></Field><Field label={t('Description Arabic','الوصف بالعربية')}><Input autoFocus={isArabic()} dir="rtl" value={edit.descriptionAr} onChange={(e:any)=>this.set('descriptionAr',e.target.value)}/></Field></div></section>

              <details className="ta-product-more" open={Boolean(edit.category||(edit.tags??[]).length||edit.hsCode||edit.origin)}><summary><span>+</span><strong>{t('Catalog details','تفاصيل الكتالوج')}</strong><small>{t('Category, tags, HS code and origin','التصنيف والوسوم ورمز HS والمنشأ')}</small></summary><section className="ta-product-editor-section"><header><span>02</span><div><strong>{t('Catalog organization','تنظيم الكتالوج')}</strong><small>{t('Category, tags and customs reference','التصنيف والوسوم والمرجع الجمركي')}</small></div></header><div className="ta-product-form-grid"><Field label={t('Category','التصنيف')}><Input value={edit.category??''} placeholder={t('Choose below or type a custom category','اختر أدناه أو اكتب تصنيفًا مخصصًا')} onChange={(e:any)=>this.set('category',e.target.value)}/><span className="ta-product-choice-strip">{categorySuggestions.map(choice=><button type="button" key={choice.value} className={categoryOf(edit)===choice.value?'is-active':''} onClick={()=>this.set('category',choice.value)}>{choice.label}</button>)}</span></Field><Field label={t('Tags','الوسوم')}><Input value={(edit.tags??[]).join(', ')} placeholder={t('e.g. 250ml, Energy','مثال: 250مل، طاقة')} onChange={(e:any)=>this.set('tags',parseSavedItemTags(String(e.target.value)))}/>{tags.length?<span className="ta-product-choice-strip">{tags.map(tag=>{const active=(edit.tags??[]).some(value=>value.toLowerCase()===tag.toLowerCase());return <button type="button" key={tag} className={active?'is-active':''} onClick={()=>this.toggleTag(tag)}>#{tag}</button>;})}</span>:null}</Field><Field label="HS Code"><Input inputMode="numeric" value={edit.hsCode} onChange={(e:any)=>this.set('hsCode',e.target.value)}/>{hsCodes.length?<span className="ta-product-choice-strip">{hsCodes.map(code=><button type="button" key={code} className={edit.hsCode===code?'is-active':''} onClick={()=>this.set('hsCode',code)}>{code}</button>)}</span>:null}</Field><Field label={t('Origin','المنشأ')}><Input value={edit.origin} onChange={(e:any)=>this.set('origin',e.target.value)}/></Field></div></section></details>

              <section className="ta-product-editor-section"><header><span>03</span><div><strong>{t('Pricing & commercial details','التسعير والتفاصيل التجارية')}</strong><small>{t('Packing, unit, reusable sale price and internal cost','التعبئة والوحدة وسعر البيع والتكلفة الداخلية')}</small></div></header><div className="ta-product-form-grid"><Field label={t('Packing','التعبئة')}><Input value={edit.packing} onChange={(e:any)=>this.set('packing',e.target.value)}/></Field><Field label={t('Unit','الوحدة')}><Input value={edit.unit} onChange={(e:any)=>this.set('unit',e.target.value)}/></Field><Field label={t('Sale price','سعر البيع')}><Input inputMode="decimal" value={edit.lastUnitPrice} onChange={(e:any)=>this.set('lastUnitPrice',e.target.value)}/></Field><Field label={t('Sale currency','عملة البيع')}><Input value={edit.lastCurrency} onChange={(e:any)=>this.set('lastCurrency',String(e.target.value).toUpperCase())}/></Field><Field label={t('Unit cost (internal)','تكلفة الوحدة (داخلية)')} hint={t('Used for profitability and never printed on customer documents.','تُستخدم لحساب الربحية ولا تظهر في مستندات العميل.')}><Input inputMode="decimal" value={edit.lastUnitCost??''} onChange={(e:any)=>this.set('lastUnitCost',e.target.value)}/></Field><Field label={t('Cost currency','عملة التكلفة')}><Input value={edit.lastCostCurrency??edit.lastCurrency} onChange={(e:any)=>this.set('lastCostCurrency',String(e.target.value).toUpperCase())}/></Field></div><div className="ta-product-favorite-toggle"><Toggle checked={Boolean(edit.favorite)} onChange={favorite=>this.set('favorite',favorite)} label={t('Keep this product in Favorites','إبقاء هذا الصنف في المفضلة')}/></div></section>
              {this.state.error?<div className="ta-product-error" role="alert">{this.state.error}</div>:null}
            </div>
            <footer className="ta-product-editor-footer"><div>{this.props.items.some(item=>item.id===edit.id)?<><Button icon="copy" disabled={this.state.busy} onClick={()=>this.duplicate(edit)}>{t('Duplicate','نسخ')}</Button><Button icon="trash" variant="danger" disabled={this.state.busy} onClick={()=>this.requestSingleDelete(edit)}>{t('Delete','حذف')}</Button></>:null}</div><Button icon="save" variant="primary" disabled={this.state.busy} onClick={()=>void this.save()}>{this.state.busy?t('Saving…','جارٍ الحفظ…'):t('Save Product','حفظ الصنف')}</Button></footer>
          </>:<div className="ta-product-editor-empty"><span><Icon name="items" size={28}/></span><small>{t('Product details','بيانات الصنف')}</small><h3>{t('Choose a product to edit','اختر صنفًا لتعديله')}</h3><p>{t('The editor keeps recurring commercial data in one place without crowding the catalog list.','يبقي المحرر البيانات التجارية المتكررة في مكان واحد دون ازدحام قائمة الأصناف.')}</p><Button icon="plus" variant="primary" onClick={this.newItem}>{t('New Product','صنف جديد')}</Button></div>}
        </aside>
      </div>

      <ProductImportModal open={this.state.importOpen} items={this.props.items} currency={this.props.currency} onClose={()=>this.setState({importOpen:false})} onSaveMany={this.props.onSaveMany}/>
      <ConfirmDialog open={Boolean(this.state.discardAction)} title={t('Discard unsaved product changes?','تجاهل تعديلات الصنف غير المحفوظة؟')} message={t('Your current product changes have not been saved. Discard them and continue?','التعديلات الحالية على الصنف لم تُحفظ بعد. هل تريد تجاهلها والمتابعة؟')} confirmLabel={t('Discard changes','تجاهل التعديلات')} onCancel={()=>this.setState({discardAction:'',pendingEdit:null})} onConfirm={this.confirmDiscard}/>
      <ConfirmDialog open={Boolean(this.state.deleting)} title={t('Delete saved product?','حذف الصنف المحفوظ؟')} message={this.state.deleting?t(`Delete “${titleOf(this.state.deleting)}” from the reusable catalog? Existing invoices and quotes stay unchanged.`,`حذف «${titleOf(this.state.deleting)}» من كتالوج الأصناف؟ لن تتغير الفواتير وعروض الأسعار الحالية.`):''} confirmLabel={t('Delete product','حذف الصنف')} onCancel={()=>this.setState({deleting:null})} onConfirm={()=>void this.remove()}/>
      <ConfirmDialog open={this.state.bulkDeleteConfirm} title={t('Delete selected products?','حذف الأصناف المحددة؟')} message={t(`Delete ${selectedCount} selected products from the reusable catalog? Existing invoices and quotes stay unchanged.`,`حذف ${selectedCount} صنف محدد من الكتالوج؟ لن تتغير الفواتير وعروض الأسعار الحالية.`)} confirmLabel={t(`Delete ${selectedCount} products`,`حذف ${selectedCount} صنف`)} onCancel={()=>this.setState({bulkDeleteConfirm:false})} onConfirm={()=>void this.removeSelected()}/>
    </div>;
  }
}
