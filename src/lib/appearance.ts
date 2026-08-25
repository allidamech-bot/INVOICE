import type { ArabicFontId, DocumentAppearance, LatinFontId, TemplateId } from '../types.js';

export const LATIN_FONT_OPTIONS: Array<{value:LatinFontId;label:string}> = [
  {value:'auto',label:'Auto'},
  {value:'inter',label:'Inter'},
  {value:'source-sans',label:'Source Sans 3'},
  {value:'montserrat',label:'Montserrat'},
  {value:'playfair',label:'Playfair Display'}
];

export const ARABIC_FONT_OPTIONS: Array<{value:ArabicFontId;label:string}> = [
  {value:'auto',label:'تلقائي'},
  {value:'cairo',label:'Cairo'},
  {value:'tajawal',label:'Tajawal'},
  {value:'noto-kufi',label:'Noto Kufi Arabic'},
  {value:'noto-naskh',label:'Noto Naskh Arabic'}
];

const AUTO_ACCENTS: Record<TemplateId,string> = {
  executive:'#b58b4f', minimal:'#0b1d2d', trade:'#b58b4f', signature:'#b58b4f',
  obsidian:'#c7a86a', cobalt:'#426a9f', editorial:'#9f634b', split:'#bd8c48',
  prism:'#7259b8', slate:'#627486', horizon:'#b38750', mono:'#161616',
  aurora:'#6b5bb4', ledger:'#8c6d42', noir:'#c7a15d', midnight:'#c8a25a',
  blackivory:'#b78a41', carbon:'#ba914d'
};

const LATIN_FONTS: Record<Exclude<LatinFontId,'auto'>,string> = {
  inter:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
  'source-sans':'"Source Sans 3", "Segoe UI", Arial, sans-serif',
  montserrat:'Montserrat, Arial, sans-serif',
  playfair:'"Playfair Display", Georgia, serif'
};

const ARABIC_FONTS: Record<Exclude<ArabicFontId,'auto'>,string> = {
  cairo:'Cairo, Tahoma, Arial, sans-serif',
  tajawal:'Tajawal, Tahoma, Arial, sans-serif',
  'noto-kufi':'"Noto Kufi Arabic", Tahoma, Arial, sans-serif',
  'noto-naskh':'"Noto Naskh Arabic", Tahoma, Arial, serif'
};

const AUTO_LATIN_BY_TEMPLATE: Record<TemplateId,Exclude<LatinFontId,'auto'>> = {
  executive:'inter', minimal:'source-sans', trade:'source-sans', signature:'playfair',
  obsidian:'montserrat', cobalt:'montserrat', editorial:'playfair', split:'inter',
  prism:'montserrat', slate:'source-sans', horizon:'playfair', mono:'source-sans',
  aurora:'montserrat', ledger:'source-sans', noir:'montserrat', midnight:'montserrat',
  blackivory:'playfair', carbon:'montserrat'
};

const AUTO_ARABIC_BY_TEMPLATE: Record<TemplateId,Exclude<ArabicFontId,'auto'>> = {
  executive:'cairo', minimal:'tajawal', trade:'tajawal', signature:'noto-naskh',
  obsidian:'noto-kufi', cobalt:'noto-kufi', editorial:'noto-naskh', split:'cairo',
  prism:'noto-kufi', slate:'tajawal', horizon:'noto-naskh', mono:'tajawal',
  aurora:'noto-kufi', ledger:'tajawal', noir:'noto-kufi', midnight:'noto-kufi',
  blackivory:'noto-naskh', carbon:'noto-kufi'
};

export function resolvedAccent(appearance:DocumentAppearance):string{
  return (appearance.paletteMode??'auto')==='custom' && appearance.accentColor ? appearance.accentColor : AUTO_ACCENTS[appearance.templateId];
}

export function resolvedAccentInk(hex:string):'#ffffff'|'#101010'{
  const clean=hex.replace('#','');
  const full=clean.length===3?clean.split('').map(x=>x+x).join(''):clean;
  if(!/^[0-9a-f]{6}$/i.test(full))return '#101010';
  const r=parseInt(full.slice(0,2),16);
  const g=parseInt(full.slice(2,4),16);
  const b=parseInt(full.slice(4,6),16);
  const luma=(0.2126*r)+(0.7152*g)+(0.0722*b);
  return luma<145?'#ffffff':'#101010';
}

export function resolvedLatinFont(appearance:DocumentAppearance):string{
  const requested=appearance.latinFont??'auto';
  const fontId=requested==='auto'?AUTO_LATIN_BY_TEMPLATE[appearance.templateId]:requested;
  return LATIN_FONTS[fontId];
}

export function resolvedArabicFont(appearance:DocumentAppearance):string{
  const requested=appearance.arabicFont??'auto';
  const fontId=requested==='auto'?AUTO_ARABIC_BY_TEMPLATE[appearance.templateId]:requested;
  return ARABIC_FONTS[fontId];
}
