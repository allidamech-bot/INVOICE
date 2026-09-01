import type { SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { ProductLibraryWorkspace } from './ProductLibraryWorkspace.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}

export class SavedItemsPage extends React.Component<Props>{
  render():any{
    return <section className="page saved-items-page product-library-page">
      <div className="page-heading saved-items-page-heading product-library-page-heading"><div><p className="eyebrow">{t('Reusable product catalog','كتالوج أصناف قابل لإعادة الاستخدام')}</p><h1>{t('Product Library','مكتبة الأصناف')}</h1><p className="page-subtitle">{t('Organize product data once, reuse it everywhere, and update large catalogs safely from Excel or CSV.','رتّب بيانات الأصناف مرة واحدة، استخدمها في كل مكان، وحدّث الكتالوجات الكبيرة بأمان من Excel أو CSV.')}</p></div></div>
      <ProductLibraryWorkspace items={this.props.items} currency={this.props.currency} onSave={this.props.onSave} onDelete={this.props.onDelete}/>
    </section>;
  }
}
