import type { DocumentLanguage, LourexDocument } from '../types.js';

export type DocumentValueKind='prose'|'currency'|'unit'|'country'|'technical'|'neutral';

const ARABIC_RE=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u;
const LATIN_RE=/[A-Za-z]/;
const ARABIC_RUN_RE=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]+/gu;
const LATIN_RUN_RE=/[A-Za-z][A-Za-zÀ-ž'’.-]*/g;

const currencyToEn:Record<string,string>={
  'دولار':'USD','دولار أمريكي':'USD','الدولار':'USD','الدولار الأمريكي':'USD',
  'يورو':'EUR','اليورو':'EUR','ريال':'SAR','ريال سعودي':'SAR','الريال السعودي':'SAR',
  'ليرة سورية':'SYP','الليرة السورية':'SYP','ليرة تركية':'TRY','الليرة التركية':'TRY',
  'درهم':'AED','درهم إماراتي':'AED','الدرهم الإماراتي':'AED',
  'جنيه استرليني':'GBP','جنيه إسترليني':'GBP','الجنيه الإسترليني':'GBP'
};
const currencyToAr:Record<string,string>={USD:'دولار أمريكي',EUR:'يورو',SAR:'ريال سعودي',SYP:'ليرة سورية',TRY:'ليرة تركية',AED:'درهم إماراتي',GBP:'جنيه إسترليني'};

const unitToEn:Record<string,string>={
  'قطعة':'PCS','قطع':'PCS','كرتون':'Carton','كرتونة':'Carton','صندوق':'Box','علبة':'Box',
  'طبلية':'Pallet','طبالي':'Pallet','منصة':'Pallet','كغ':'KG','كغم':'KG','كيلو':'KG','كيلوغرام':'KG',
  'وحدة':'Unit','طقم':'Set','مجموعة':'Set'
};
const unitToAr:Record<string,string>={PCS:'قطعة',CARTON:'كرتون',BOX:'صندوق',PALLET:'طبلية',KG:'كغ',UNIT:'وحدة',SET:'طقم'};

const countryToEn:Record<string,string>={
  'تركيا':'Türkiye','تركية':'Türkiye','المملكة العربية السعودية':'Saudi Arabia','السعودية':'Saudi Arabia',
  'سوريا':'Syria','الجمهورية العربية السورية':'Syria','الإمارات العربية المتحدة':'United Arab Emirates','الإمارات':'United Arab Emirates',
  'رومانيا':'Romania','إيرلندا':'Ireland','ايرلندا':'Ireland','المملكة المتحدة':'United Kingdom','بريطانيا':'United Kingdom',
  'الولايات المتحدة':'United States','الولايات المتحدة الأمريكية':'United States','أمريكا':'United States',
  'الصين':'China','ألمانيا':'Germany','المانيا':'Germany','فرنسا':'France','إيطاليا':'Italy','ايطاليا':'Italy',
  'مصر':'Egypt','لبنان':'Lebanon','الأردن':'Jordan','الاردن':'Jordan','العراق':'Iraq','الكويت':'Kuwait',
  'قطر':'Qatar','البحرين':'Bahrain','عمان':'Oman','سلطنة عمان':'Oman'
};
const countryToAr:Record<string,string>={
  'TÜRKIYE':'تركيا','TURKEY':'تركيا','SAUDI ARABIA':'المملكة العربية السعودية','SYRIA':'سوريا',
  'UNITED ARAB EMIRATES':'الإمارات العربية المتحدة','UAE':'الإمارات العربية المتحدة','ROMANIA':'رومانيا','IRELAND':'إيرلندا',
  'UNITED KINGDOM':'المملكة المتحدة','UK':'المملكة المتحدة','UNITED STATES':'الولايات المتحدة','UNITED STATES OF AMERICA':'الولايات المتحدة','USA':'الولايات المتحدة','US':'الولايات المتحدة',
  'CHINA':'الصين','GERMANY':'ألمانيا','FRANCE':'فرنسا','ITALY':'إيطاليا','EGYPT':'مصر','LEBANON':'لبنان','JORDAN':'الأردن','IRAQ':'العراق','KUWAIT':'الكويت','QATAR':'قطر','BAHRAIN':'البحرين','OMAN':'عمان'
};

function compact(value:string):string{
  return value
    .replace(/\s+/g,' ')
    .replace(/\s+([,.;:!?/|])/g,'$1')
    .replace(/([/|])\s*([/|])/g,'$1')
    .replace(/^[\s,.;:!?/|·•—–-]+|[\s,.;:!?/|·•—–-]+$/g,'')
    .trim();
}

function mappedValue(value:string,language:DocumentLanguage,kind:DocumentValueKind):string{
  const raw=value.trim();
  if(!raw||language==='bilingual'||kind==='neutral'||kind==='technical')return raw;
  if(kind==='currency'){
    if(language==='en')return currencyToEn[raw]||(/^[A-Za-z]{3}$/.test(raw)?raw.toUpperCase():raw);
    return currencyToAr[raw.toUpperCase()]||raw;
  }
  if(kind==='unit'){
    if(language==='en')return unitToEn[raw]||raw;
    return unitToAr[raw.toUpperCase()]||raw;
  }
  if(kind==='country'){
    if(language==='en')return countryToEn[raw]||raw;
    return countryToAr[raw.toUpperCase()]||raw;
  }
  return raw;
}

export function hasArabicScript(value:string):boolean{return ARABIC_RE.test(value);}
export function hasLatinScript(value:string):boolean{return LATIN_RE.test(value);}

export function documentDisplayValue(value:string|undefined|null,language:DocumentLanguage,kind:DocumentValueKind='prose'):string{
  const original=String(value??'').trim();
  if(!original)return '';
  let raw=mappedValue(original,language,kind);
  if(language==='bilingual'||kind==='neutral'||kind==='technical')return raw;
  if(language==='en'){
    if(!hasArabicScript(raw))return raw;
    raw=compact(raw.replace(ARABIC_RUN_RE,' '));
    return hasLatinScript(raw)?raw:'';
  }
  if(!hasLatinScript(raw))return raw;
  raw=compact(raw.replace(LATIN_RUN_RE,' '));
  return hasArabicScript(raw)?raw:'';
}

export function documentLanguageMismatch(value:string|undefined|null,language:DocumentLanguage,kind:DocumentValueKind='prose'):boolean{
  const original=String(value??'').trim();
  if(!original||language==='bilingual'||kind==='neutral'||kind==='technical')return false;
  const mapped=mappedValue(original,language,kind);
  return language==='en'?hasArabicScript(mapped):hasLatinScript(mapped);
}

export function documentCurrency(doc:LourexDocument):string{
  return documentDisplayValue(doc.currency,doc.language,'currency')||doc.currency.trim().toUpperCase()||'USD';
}

export function hasDocumentLanguageMismatch(doc:LourexDocument):boolean{
  if(doc.language==='bilingual')return false;
  const values:Array<[string,DocumentValueKind]>=[
    [doc.currency,'currency'],
    [doc.companySnapshot.footerText,'prose'],
    [doc.companySnapshot.city,'neutral'],[doc.companySnapshot.country,'country'],
    [doc.companySnapshot.bank.bankName,'neutral'],[doc.companySnapshot.bank.accountName,'neutral'],[doc.companySnapshot.bank.currency,'currency'],
    [doc.customerSnapshot?.city??'','neutral'],[doc.customerSnapshot?.country??'','country'],
    [doc.terms.paymentTerms,'prose'],[doc.terms.packing,'prose'],[doc.terms.deliveryTime,'prose'],[doc.terms.portOfLoading,'neutral'],
    [doc.terms.finalDestination,'neutral'],[doc.terms.countryOfOrigin,'country'],[doc.terms.validity,'prose'],[doc.terms.remarks,'prose'],[doc.notes,'prose']
  ];
  for(const item of doc.items){values.push([item.origin,'country'],[item.packing,'prose'],[item.unit,'unit']);}
  if(doc.language==='en'){
    values.push([doc.companySnapshot.nameEn,'prose'],[doc.companySnapshot.addressEn,'prose'],[doc.customerSnapshot?.companyNameEn??'','prose'],[doc.customerSnapshot?.addressEn??'','prose']);
    for(const item of doc.items)values.push([item.descriptionEn,'prose']);
  }else{
    values.push([doc.companySnapshot.nameAr,'prose'],[doc.companySnapshot.addressAr,'prose'],[doc.customerSnapshot?.companyNameAr??'','prose'],[doc.customerSnapshot?.addressAr??'','prose']);
    for(const item of doc.items)values.push([item.descriptionAr,'prose']);
  }
  return values.some(([value,kind])=>documentLanguageMismatch(value,doc.language,kind));
}
