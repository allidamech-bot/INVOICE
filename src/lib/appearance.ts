import type { ArabicFontId, DocumentAppearance, LatinFontId, TemplateId } from '../types.js';
import { getUiLanguage } from './i18n.js';

const autoFontLabel=():string=>getUiLanguage()==='ar'?'تلقائي':'Auto';

export const LATIN_FONT_OPTIONS: Array<{value:LatinFontId;label:string}> = [
  {value:'auto',get label(){return autoFontLabel();}},
  {value:'inter',label:'Inter'},
  {value:'source-sans',label:'Source Sans 3'},
  {value:'montserrat',label:'Montserrat'},
  {value:'playfair',label:'Playfair Display'}
];
export const ARABIC_FONT_OPTIONS: Array<{value:ArabicFontId;label:string}> = [
  {value:'auto',get label(){return autoFontLabel();}},
  {value:'cairo',label:'Cairo'},
  {value:'tajawal',label:'Tajawal'},
  {value:'noto-kufi',label:'Noto Kufi Arabic'},
  {value:'noto-naskh',label:'Noto Naskh Arabic'}
];

const AUTO_ACCENTS: Record<TemplateId,string> = {
  executive:'#b58b4f', minimal:'#0b1d2d', trade:'#b58b4f', signature:'#b58b4f', obsidian:'#b79b67', cobalt:'#356f9c', editorial:'#8b7258', split:'#b58b4f', prism:'#3f736f', slate:'#5f7484', horizon:'#b58b4f', mono:'#161616', aurora:'#b58b4f', ledger:'#8a704b', noir:'#c7a15d', midnight:'#c8a25a', blackivory:'#b78a41', carbon:'#ba914d'
};
const DARK_TEMPLATES=new Set<TemplateId>(['obsidian','noir','midnight','blackivory','carbon']);
const LATIN_FONTS: Record<Exclude<LatinFontId,'auto'>,string> = {inter:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif','source-sans':'"Source Sans 3", "Segoe UI", Arial, sans-serif',montserrat:'Montserrat, Arial, sans-serif',playfair:'"Playfair Display", Georgia, serif'};
const ARABIC_FONTS: Record<Exclude<ArabicFontId,'auto'>,string> = {cairo:'Cairo, Tahoma, Arial, sans-serif',tajawal:'Tajawal, Tahoma, Arial, sans-serif','noto-kufi':'"Noto Kufi Arabic", Tahoma, Arial, sans-serif','noto-naskh':'"Noto Naskh Arabic", Tahoma, Arial, serif'};
const AUTO_LATIN_BY_TEMPLATE: Record<TemplateId,Exclude<LatinFontId,'auto'>> = {executive:'inter',minimal:'source-sans',trade:'source-sans',signature:'playfair',obsidian:'montserrat',cobalt:'montserrat',editorial:'playfair',split:'inter',prism:'montserrat',slate:'source-sans',horizon:'playfair',mono:'source-sans',aurora:'montserrat',ledger:'source-sans',noir:'montserrat',midnight:'montserrat',blackivory:'playfair',carbon:'montserrat'};
const AUTO_ARABIC_BY_TEMPLATE: Record<TemplateId,Exclude<ArabicFontId,'auto'>> = {executive:'cairo',minimal:'tajawal',trade:'tajawal',signature:'noto-naskh',obsidian:'noto-kufi',cobalt:'noto-kufi',editorial:'noto-naskh',split:'cairo',prism:'noto-kufi',slate:'tajawal',horizon:'noto-naskh',mono:'tajawal',aurora:'noto-kufi',ledger:'tajawal',noir:'noto-kufi',midnight:'noto-kufi',blackivory:'noto-naskh',carbon:'noto-kufi'};

type TextScale='small'|'normal'|'large';

export interface TemplateAppearanceTokens {
  page:string;surface:string;surfaceInk:string;surfaceMuted:string;
  darkSurface:string;darkSurfaceInk:string;darkSurfaceMuted:string;
  heading:string;primary:string;secondary:string;muted:string;border:string;
  tableHeader:string;tableHeaderText:string;accent:string;accentInk:string;
  totalsSurface:string;inverse:string;
  titleScale:number;headingScale:number;bodyScale:number;tableScale:number;
}

function validHex(value:unknown):value is string{return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
export function resolvedAccent(appearance:DocumentAppearance):string{return (appearance.paletteMode??'auto')==='custom'&&validHex(appearance.accentColor)?appearance.accentColor:AUTO_ACCENTS[appearance.templateId];}
function linearChannel(value:number):number{const channel=value/255;return channel<=0.04045?channel/12.92:Math.pow((channel+0.055)/1.055,2.4);}
function luminance(hex:string):number{
  const clean=hex.replace('#','');
  const full=clean.length===3?clean.split('').map(x=>x+x).join(''):clean;
  if(!/^[0-9a-f]{6}$/i.test(full))return 0;
  const r=parseInt(full.slice(0,2),16),g=parseInt(full.slice(2,4),16),b=parseInt(full.slice(4,6),16);
  return .2126*linearChannel(r)+.7152*linearChannel(g)+.0722*linearChannel(b);
}
function contrastRatio(a:number,b:number):number{const lighter=Math.max(a,b),darker=Math.min(a,b);return(lighter+0.05)/(darker+0.05);}
function colorContrast(foreground:string,background:string):number{return contrastRatio(luminance(foreground),luminance(background));}
function safeTextColor(candidate:unknown,background:string,fallback:string,minContrast=4.5):string{
  if(!validHex(candidate))return fallback;
  return colorContrast(candidate,background)>=minContrast?candidate:fallback;
}
function scaleValue(value:TextScale|undefined,small:number,large:number):number{return value==='small'?small:value==='large'?large:1;}

export function resolvedAccentInk(hex:string):'#ffffff'|'#101010'{
  if(!validHex(hex))return'#101010';
  const value=luminance(hex);
  const dark=luminance('#101010');
  return contrastRatio(1,value)>=contrastRatio(value,dark)?'#ffffff':'#101010';
}

export function resolvedAppearanceTokens(appearance:DocumentAppearance):TemplateAppearanceTokens{
  const dark=DARK_TEMPLATES.has(appearance.templateId);
  const accent=resolvedAccent(appearance);
  const custom=(appearance.paletteMode??'auto')==='custom';
  const page=dark?'#151515':'#fffdf8';
  const defaultPrimary=dark?'#f7f2e8':'#17212b';
  const defaultSecondary=dark?'#d7d0c4':'#4d5b68';
  const primary=custom?safeTextColor(appearance.primaryTextColor,page,defaultPrimary,4.5):defaultPrimary;
  const secondary=custom?safeTextColor(appearance.secondaryTextColor,page,defaultSecondary,4.5):defaultSecondary;
  const autoHeading=safeTextColor(accent,page,primary,3);
  const heading=custom?safeTextColor(appearance.headingTextColor,page,autoHeading,3):autoHeading;
  const legacyScale=appearance.textScale??'normal';
  const titleScale=scaleValue(appearance.documentTitleScale??'normal',.92,1.10);
  const headingScale=scaleValue(appearance.sectionHeadingScale??'normal',.94,1.08);
  const bodyScale=scaleValue(appearance.bodyTextScale??legacyScale,.95,1.06);
  const tableScale=scaleValue(appearance.tableTextScale??legacyScale,.95,1.05);

  // Surface tokens intentionally describe the actual component surface. A dark
  // template can still contain a white customer card, so those cards must never
  // inherit dark-page ink or unsafe user colors.
  const surface='#ffffff';
  const surfaceInk='#17212b';
  const surfaceMuted='#58656f';
  const darkSurface=dark?'#202020':'#102b3d';
  const darkSurfaceInk='#fffaf0';
  const darkSurfaceMuted='#d7d0c4';

  return {
    page,surface,surfaceInk,surfaceMuted,darkSurface,darkSurfaceInk,darkSurfaceMuted,
    heading,primary,secondary,muted:dark?'#aaa398':'#687582',border:dark?'#48443e':'#d8dde2',
    tableHeader:dark?'#292724':'#eef1f3',tableHeaderText:dark?'#fffaf0':'#17212b',
    accent,accentInk:resolvedAccentInk(accent),totalsSurface:dark?'#25231f':'#f5f2ea',inverse:'#ffffff',
    titleScale,headingScale,bodyScale,tableScale
  };
}

export function resolvedLatinFont(appearance:DocumentAppearance):string{const requested=appearance.latinFont??'auto';const fontId=requested==='auto'?AUTO_LATIN_BY_TEMPLATE[appearance.templateId]:requested;return LATIN_FONTS[fontId];}
export function resolvedArabicFont(appearance:DocumentAppearance):string{const requested=appearance.arabicFont??'auto';const fontId=requested==='auto'?AUTO_ARABIC_BY_TEMPLATE[appearance.templateId]:requested;return ARABIC_FONTS[fontId];}
