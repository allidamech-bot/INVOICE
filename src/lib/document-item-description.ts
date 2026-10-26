import { documentDisplayValue } from './document-language.js';
import type { DocumentItem, DocumentLanguage } from '../types.js';

export interface DisplayItemDescription {
  text: string;
  language: 'ar' | 'en';
}

/** Resolve an item name for rendering only; never copy this fallback into document data. */
export function displayItemDescription(item: Pick<DocumentItem, 'descriptionEn' | 'descriptionAr'>, language: DocumentLanguage): DisplayItemDescription | null {
  if(language==='ar'){
    const arabic=documentDisplayValue(item.descriptionAr,'ar');
    if(arabic)return{text:arabic,language:'ar'};
    const english=documentDisplayValue(item.descriptionEn,'en');
    return english?{text:english,language:'en'}:null;
  }
  if(language==='en'){
    const english=documentDisplayValue(item.descriptionEn,'en');
    return english?{text:english,language:'en'}:null;
  }
  const english=String(item.descriptionEn??'').trim();
  const arabic=String(item.descriptionAr??'').trim();
  return english?{text:english,language:'en'}:arabic?{text:arabic,language:'ar'}:null;
}
