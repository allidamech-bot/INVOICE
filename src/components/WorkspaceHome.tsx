import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';

interface Props{
  companyName:string;
  documentCount:number;
  customerCount:number;
  itemCount:number;
  onNewQuotation:()=>void;
  onNewInvoice:()=>void;
  onNavigate:(screen:'documents'|'customers'|'items'|'receivables'|'operations')=>void;
}

export function WorkspaceHome({companyName,documentCount,customerCount,itemCount,onNewQuotation,onNewInvoice,onNavigate}:Props):any{
  return <section className="workspace-home-page">
    <header className="workspace-home-hero">
      <div>
        <p className="workspace-home-eyebrow">{t('Business workspace','مساحة الأعمال')}</p>
        <h1>{companyName||'LOUREX Invoice'}</h1>
        <p>{t('Create documents, manage customers, and keep the commercial workflow in one clear place.','أنشئ المستندات وأدر العملاء وتابع أعمالك التجارية من مكان واحد واضح.')}</p>
      </div>
      <div className="workspace-home-actions">
        <Button icon="proforma" variant="primary" onClick={onNewQuotation}>{t('New Quotation','عرض سعر جديد')}</Button>
        <Button icon="invoice" onClick={onNewInvoice}>{t('New Invoice','فاتورة جديدة')}</Button>
      </div>
    </header>

    <div className="workspace-home-grid" aria-label={t('Workspace shortcuts','اختصارات مساحة العمل')}>
      <button type="button" onClick={()=>onNavigate('documents')}><span className="workspace-home-card-icon"><Icon name="file"/></span><span><small>{t('Documents','المستندات')}</small><strong>{documentCount}</strong><em>{t('Quotations and invoices','عروض السعر والفواتير')}</em></span><Icon name="arrowLeft" className="workspace-home-card-arrow"/></button>
      <button type="button" onClick={()=>onNavigate('customers')}><span className="workspace-home-card-icon"><Icon name="users"/></span><span><small>{t('Customers','العملاء')}</small><strong>{customerCount}</strong><em>{t('Customer records and activity','ملفات العملاء ونشاطهم')}</em></span><Icon name="arrowLeft" className="workspace-home-card-arrow"/></button>
      <button type="button" onClick={()=>onNavigate('items')}><span className="workspace-home-card-icon"><Icon name="items"/></span><span><small>{t('Items','الأصناف')}</small><strong>{itemCount}</strong><em>{t('Saved product library','مكتبة الأصناف المحفوظة')}</em></span><Icon name="arrowLeft" className="workspace-home-card-arrow"/></button>
      <button type="button" onClick={()=>onNavigate('receivables')}><span className="workspace-home-card-icon"><Icon name="invoice"/></span><span><small>{t('Finance','المالية')}</small><strong>→</strong><em>{t('Receivables and reports','المستحقات والتقارير')}</em></span><Icon name="arrowLeft" className="workspace-home-card-arrow"/></button>
      <button type="button" onClick={()=>onNavigate('operations')}><span className="workspace-home-card-icon"><Icon name="backup"/></span><span><small>{t('Business','الأعمال')}</small><strong>→</strong><em>{t('Suppliers, purchases and expenses','الموردون والمشتريات والمصروفات')}</em></span><Icon name="arrowLeft" className="workspace-home-card-arrow"/></button>
    </div>
  </section>;
}
