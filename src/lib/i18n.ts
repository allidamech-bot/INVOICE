import type { UiLanguage } from '../types.js';

let currentLanguage: UiLanguage = 'en';

const arabicOverrides: Record<string,string> = {
  'مبدئية':'عروض الأسعار',
  'فاتورة مبدئية':'عرض سعر',
  'فاتورة مبدئية جديدة':'عرض سعر جديد',
  'فاتورة أولية':'عرض سعر',
  'احفظ فاتورة مبدئية صالحة قبل تحويلها.':'احفظ عرض سعر صالحًا قبل تحويله.',
  'بادئة الفاتورة المبدئية':'بادئة عرض السعر'
};

export function setUiLanguage(language: UiLanguage): void {
  currentLanguage = language;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  }
}

export function getUiLanguage(): UiLanguage { return currentLanguage; }
export function isArabic(): boolean { return currentLanguage === 'ar'; }
export function t(en: string, ar: string): string {
  if (currentLanguage !== 'ar') return en;
  return arabicOverrides[ar] ?? ar.replace(/فاتورة مبدئية/g,'عرض سعر').replace(/فاتورة أولية/g,'عرض سعر');
}

export function translateValidation(message: string): string {
  if (currentLanguage !== 'ar') return message;
  const map: Record<string,string> = {
    'Document number is required.':'رقم المستند مطلوب.',
    'Issue date is required.':'تاريخ الإصدار مطلوب.',
    'Valid until date is required.':'تاريخ صلاحية عرض السعر مطلوب.',
    'Currency is required.':'العملة مطلوبة.',
    'Select a customer.':'اختر عميلاً.',
    'Add at least one item.':'أضف صنفًا واحدًا على الأقل.',
    'Description is required.':'الوصف مطلوب.',
    'English description is required.':'الوصف الإنجليزي مطلوب.',
    'Arabic description is required.':'الوصف العربي مطلوب.',
    'Quantity must be greater than 0.':'يجب أن تكون الكمية أكبر من 0.',
    'Unit is required.':'الوحدة مطلوبة.',
    'Unit price is required.':'سعر الوحدة مطلوب.',
    'Unit price must be 0 or greater.':'يجب أن يكون سعر الوحدة 0 أو أكثر.',
    'Discount must be 0 or greater.':'يجب أن يكون الخصم 0 أو أكثر.',
    'Shipping must be 0 or greater.':'يجب أن تكون قيمة الشحن 0 أو أكثر.',
    'Other charges must be 0 or greater.':'يجب أن تكون الرسوم الأخرى 0 أو أكثر.',
    'Tax must be 0 or greater.':'يجب أن تكون الضريبة 0 أو أكثر.'
  };
  return map[message] ?? message;
}