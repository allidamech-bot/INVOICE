import type { SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { SavedItemsModal } from './SavedItemsModal.js';

interface Props {
  items:SavedItem[];
  currency:string;
  onSave:(item:SavedItem)=>Promise<void>;
  onDelete:(item:SavedItem)=>Promise<void>;
}

export class SavedItemsPage extends React.Component<Props>{
  render():any{
    return <section className="page saved-items-page">
      <div className="page-heading saved-items-page-heading"><div><p className="eyebrow">{t('Reusable catalog','كتالوج قابل لإعادة الاستخدام')}</p><h1>{t('Items','الأصناف')}</h1><p className="page-subtitle">{t('Keep product details organized once, then reuse them in every quote and invoice.','رتّب بيانات الأصناف مرة واحدة، ثم استخدمها بسهولة في كل عرض سعر وفاتورة.')}</p></div></div>
      <SavedItemsModal embedded open items={this.props.items} currency={this.props.currency} onSave={this.props.onSave} onDelete={this.props.onDelete}/>
    </section>;
  }
}
