import type { SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { ProductLibraryWorkspace } from './ProductLibraryWorkspace.js';
import { Button, Icon } from './UI.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onSaveMany:(items:SavedItem[])=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
  onInspectInventory?:(item:SavedItem)=>void;
  onInspectPurchases?:(item:SavedItem)=>void;
}

export class SavedItemsPage extends React.Component<Props>{
  componentDidMount():void{document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleKeyDown);}

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.key!=='/'||document.querySelector('.modal-backdrop'))return;
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
    if(typing)return;
    const input=document.querySelector<HTMLInputElement>('.ta-product-search input');
    if(!input)return;
    event.preventDefault();input.focus();
  };

  render():any{
    return <section className="ta-product-library-page">
      <header className="ta-product-page-header"><div><span className="ta-product-page-eyebrow">{t('Reusable product catalog','كتالوج أصناف قابل لإعادة الاستخدام')}</span><h1>{t('Product Library','مكتبة الأصناف')}</h1><p>{t('Organize product data once, reuse it everywhere, and update large catalogs safely from Excel or CSV.','رتّب بيانات الأصناف مرة واحدة، استخدمها في كل مكان، وحدّث الكتالوجات الكبيرة بأمان من Excel أو CSV.')}</p></div><Button icon="plus" variant="primary" onClick={()=>window.dispatchEvent(new Event('lourex-open-product-editor'))}>{t('New Product','صنف جديد')}</Button></header>
      <div className="ta-product-page-note"><span><Icon name="items"/></span><div><strong>{t('One product source across LOUREX','مصدر واحد للأصناف في LOUREX')}</strong><small>{t('Catalog details flow into documents, purchasing, inventory and profitability without changing issued documents.','تنتقل بيانات الكتالوج إلى المستندات والمشتريات والمخزون والربحية دون تغيير المستندات الصادرة.')}</small></div></div>
      <ProductLibraryWorkspace items={this.props.items} currency={this.props.currency} onSave={this.props.onSave} onSaveMany={this.props.onSaveMany} onDelete={this.props.onDelete} onInspectInventory={this.props.onInspectInventory} onInspectPurchases={this.props.onInspectPurchases}/>
    </section>;
  }
}
