import { t } from './i18n.js';

/**
 * Audit events retain immutable machine-readable payloads in storage.
 * User-facing history renders a safe semantic label instead of that payload.
 */
export function documentEventDisplayNote(note:string):string{
  if(note.startsWith('@lourex:sales-order:delivery-invoice:v1:'))
    return t('Invoice draft prepared from confirmed physical delivery.','تم تجهيز مسودة فاتورة من تسليم فعلي مؤكد.');
  if(note.startsWith('@lourex:sales-order:accepted:v1:'))
    return t('Customer Sales Order accepted and recorded.','تم اعتماد أمر البيع وتسجيله.');
  if(note.startsWith('@lourex:sales-order:delivery-confirmed:v1:'))
    return t('Physical delivery confirmed against Sales Order.','تم تأكيد التسليم الفعلي مقابل أمر البيع.');
  if(note.startsWith('@lourex:sales-order:delivery-draft:v1:')
    ||note.startsWith('@lourex:sales-order:delivery-draft:v2:'))
    return t('Delivery Note draft linked to accepted Sales Order.','تم ربط مسودة سند التسليم بأمر البيع المعتمد.');
  return note;
}
