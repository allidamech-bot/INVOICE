/**
 * Current-turn-only deny guard for the ONE original LOUREX Controller.
 *
 * A historical answer, attached source or model output can never cancel a
 * prohibition in the latest user's text or grant execution privileges.
 * This is not an NLU action classifier: a false positive is read-only and
 * reversible; an uncertain command still requires the existing approval.
 */
const normalize=value=>String(value??'').normalize('NFKC').trim().slice(0,6000)
  .replace(/[،؛.!؟?,;:]+/gu,' ').replace(/\s+/gu,' ');

export function explicitNoWriteRequested(message){
  if(typeof message!=='string'||message.length>6000)return false;
  const text=normalize(message);
  if(!text)return false;
  // Affirmative correction "لا، خلي الكمية 12" is NOT a prohibition.
  // A negative verb must occur after the negator.
  const ar=/(?:^|\s)(?:و?لا|لن|بدون|دون|مش|مو)\s+(?:ت?(?:نشئ|نشيء|نشا|نشأ|انشئ|أنشئ|حفظ|عدل|عدّل|غير|غيّر|سجل|سجّل|نفذ|نفّذ|صدر|أصدر|اصدر|حذف|احذف|رحّل|رحل|اعتمد|وافق)|إنشاء|انشاء|حفظ|تعديل|تغيير|تنفيذ|إصدار|اصدار|حذف|اعتماد|موافقة|ترحيل)(?=\s|$)/iu;
  // "do not create or save", "don't edit", "without saving".
  const en=/(?:^|\s)(?:do\s+not|don't|dont|never|without|no)\s+(?:(?:any|further|actual|new|real|more|anything)\s+){0,2}(?:create|save|saving|edit|modify|change|update|apply|execute|issue|post|delete|archive|approve|record|write|creation|modification|execution|changes)(?=\s|$)/iu;
  const preview=/(?:\b(?:preview\s+only|only\s+(?:a\s+)?preview|review\s+only|just\s+(?:show|preview)|no\s+save)\b|(?:معاينة|مراجعة|عرض)\s+فقط|فقط\s+(?:اعرض|أرني|ارني)|للمعاينة\s+فقط|للمراجعة\s+فقط)/iu;
  return ar.test(text)||en.test(text)||preview.test(text);
}
