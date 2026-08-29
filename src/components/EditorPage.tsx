import type { AppSettings, CompanySettings, Customer, DocumentItem, LourexDocument, SavedItem } from '../types.js';
import { t } from '../lib/i18n.js';
import { Button, Icon } from './UI.js';
import { EditorPage as EditorPageCore } from './EditorPageCore.js';

interface Props {
  document:LourexDocument; documents:LourexDocument[]; customers:Customer[]; company:CompanySettings; savedItems:SavedItem[]; smartDefaults:AppSettings['smartDefaults'];
  onClose:()=>void; onSave:(doc:LourexDocument,auto?:boolean)=>Promise<void>; onSaveCustomer:(customer:Customer)=>Promise<void>;
  onSaveSavedItem:(item:SavedItem)=>Promise<void>; onSaveDocumentItem:(item:DocumentItem,currency:string)=>Promise<void>; onDeleteSavedItem:(item:SavedItem)=>Promise<void>;
  onSaveSmartDefaults:(defaults:AppSettings['smartDefaults'])=>Promise<void>; onConvert:(doc:LourexDocument)=>Promise<void>; onPrint:(doc:LourexDocument,mode:'print'|'pdf'|'share')=>void;
}

// Keep the editor's internal draft state scoped to one document identity.
// A new invoice created from a proforma must mount a fresh editor instead of
// retaining the source document's local state.
export function EditorPage(props:Props):any {
  const canConvertFinalQuote=props.document.kind==='proforma'&&props.document.status==='final';
  const saveAndReturn=async(doc:LourexDocument,auto?:boolean):Promise<void>=>{
    await props.onSave(doc,auto);
    // Explicit Save is a completed editor action: return to the document list.
    // Autosave stays in place, and issuing a Final document keeps the existing
    // review/print flow intact.
    if(!auto&&doc.status==='draft')props.onClose();
  };
  return <>
    <EditorPageCore key={props.document.id} {...props} onSave={saveAndReturn}/>
    {canConvertFinalQuote?<div className="final-quote-convert-bar" role="region" aria-label={t('Final quote actions','إجراءات عرض السعر النهائي')}>
      <div><Icon name="invoice" size={18}/><span><strong>{t('Deal confirmed? Create the invoice.','تم تأكيد الصفقة؟ أنشئ الفاتورة.')}</strong><small>{t('The quote stays Final and unchanged. A new invoice is created with its own number.','يبقى عرض السعر نهائيًا دون تغيير، ويتم إنشاء فاتورة جديدة برقم مستقل.')}</small></span></div>
      <Button icon="invoice" variant="primary" onClick={()=>void props.onConvert(props.document)}>{t('Create Invoice from Quote','إنشاء فاتورة من عرض السعر')}</Button>
    </div>:null}
  </>;
}