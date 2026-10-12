import { getUiLanguage, t } from './i18n.js';

/** Presentation only: never writes site or commercial-document preferences. */
export function assistantToolLanguage():'ar'|'en' {
  const language=typeof document==='undefined'?null:document.getElementById('lourex-ai-panel')?.getAttribute('data-ai-ui-language');
  return language==='ar'||language==='en'?language:getUiLanguage();
}
export function assistantToolText(en:string,ar:string):string {
  const language=typeof document==='undefined'?null:document.getElementById('lourex-ai-panel')?.getAttribute('data-ai-ui-language');
  return language==='ar'?ar:language==='en'?en:t(en,ar);
}
export function assistantToolIsArabic():boolean{return assistantToolLanguage()==='ar';}
