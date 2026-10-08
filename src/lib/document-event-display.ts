import { t } from './i18n.js';

/**
 * Audit events retain immutable machine-readable payloads in storage.
 * User-facing history renders a safe semantic label instead of that payload.
 */
export function documentEventDisplayNote(note:string):string{
  if(note.startsWith('@lourex:sales-order:delivery-invoice:v1:'))
    return t('Invoice draft prepared from confirmed physical delivery.','تم تجهيز مسودة فاتورة من تسليم فعلي مؤكد.');
  return note;
}
