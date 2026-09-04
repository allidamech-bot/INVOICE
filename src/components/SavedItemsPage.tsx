import type { SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { ProductLibraryWorkspace } from './ProductLibraryWorkspace.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onSaveMany:(items:SavedItem[])=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}

export class SavedItemsPage extends React.Component<Props>{
  componentDidMount():void{document.addEventListener('keydown',this.handleKeyDown);}
  componentWillUnmount():void{document.removeEventListener('keydown',this.handleKeyDown);}

  private handleKeyDown=(event:KeyboardEvent)=>{
    if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.key!=='/'||document.querySelector('.modal-backdrop'))return;
    const target=event.target;
    const typing=target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||Boolean(target instanceof HTMLElement&&target.isContentEditable);
    if(typing)return;
    const input=document.querySelector<HTMLInputElement>('.product-library-search input');
    if(!input)return;
    event.preventDefault();
    input.focus();
  };

  render():any{
    return <section className="page saved-items-page product-library-page">
      <div className="page-heading saved-items-page-heading product-library-page-heading"><div><p className="eyebrow">{t('Reusable catalog','كتالوج قابل لإعادة الاستخدام')}</p><h1>{t('Items','الأصناف')}</h1><p className="page-subtitle">{t('Keep names, SKU, categories, sale prices, internal costs and trade data organized once, then reuse them on every document.','رتّب الأسماء وSKU والتصنيفات وأسعار البيع والتكاليف الداخلية والبيانات التجارية مرة واحدة ثم أعد استخدامها في كل مستند.')}</p></div></div>
      <ProductLibraryWorkspace items={this.props.items} currency={this.props.currency} onSave={this.props.onSave} onSaveMany={this.props.onSaveMany} onDelete={this.props.onDelete}/>
    </section>;
  }
}
