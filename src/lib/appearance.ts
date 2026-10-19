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

/* Keep Auto aligned with the authored output identities rather than maintaining a
 * second visual system with near-but-not-identical colors. */
const AUTO_ACCENTS: Record<TemplateId,string> = {
  executive:'#ffbc1c', minimal:'#ffc619', trade:'#ff932b', signature:'#57774c', obsidian:'#00bfc2', cobalt:'#00a5d4', editorial:'#f2be22', split:'#f9a821', prism:'#f55378', slate:'#4e8c9b', horizon:'#ff8d22', mono:'#191b22', aurora:'#20bbb0', ledger:'#ef2549', noir:'#c29a52', midnight:'#c6a25e', blackivory:'#b99558', carbon:'#cfaa67'

};

/* Authored paper colors in the canonical v141 design. */
const TEMPLATE_PAPERS: Record<TemplateId,string> = {
  executive:'#ffffff', minimal:'#ffffff', trade:'#ffffff', signature:'#fcfaf5', obsidian:'#15191c', cobalt:'#ffffff', editorial:'#ffffff', split:'#ffffff', prism:'#ffffff', slate:'#ffffff', horizon:'#ffffff', mono:'#ffffff', aurora:'#fdfbf6', ledger:'#ffffff', noir:'#121212', midnight:'#071824', blackivory:'#14130f', carbon:'#1b1d20'
};

/* Foreground roles are used on more than the page itself: alternating item rows,
 * party cards and section labels also use authored light fills. A color that only
 * clears 4.5:1 on pure white can still become unreadable on those slightly darker
 * surfaces, so custom text must pass both the page and the darkest common light
 * semantic surface for that template. */
// This is the canonical alternating-row surface, emitted by Page into v141.
// The readability guard and CSS therefore cannot disagree about its color.
const TEMPLATE_LIGHT_SURFACES: Record<TemplateId,string> = {
  executive:'#f4f6f8', minimal:'#f5f6f8', trade:'#edf5fb', signature:'#f0f3ed', obsidian:'#20262a', cobalt:'#eef5fb', editorial:'#f7f7f5', split:'#f3f2fa', prism:'#edf6f7', slate:'#edf4f5', horizon:'#eef5fb', mono:'#f5f5f6', aurora:'#edf5f1', ledger:'#fbf0f2', noir:'#1b1a18', midnight:'#0d2434', blackivory:'#1f1d18', carbon:'#24282b'
};
const DARK_BODY_TEMPLATES=new Set<TemplateId>(['obsidian','noir','midnight','blackivory','carbon']);
const TEMPLATE_DARK_SURFACES: Partial<Record<TemplateId,string>> = {
  obsidian:'#20262a',noir:'#1b1a18',midnight:'#0d2434',blackivory:'#1f1d18',carbon:'#24282b'
};
const LATIN_FONTS: Record<Exclude<LatinFontId,'auto'>,string> = {inter:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif','source-sans':'"Source Sans 3", "Segoe UI", Arial, sans-serif',montserrat:'Montserrat, Arial, sans-serif',playfair:'"Playfair Display", Georgia, serif'};
const ARABIC_FONTS: Record<Exclude<ArabicFontId,'auto'>,string> = {cairo:'Cairo, Tahoma, Arial, sans-serif',tajawal:'"LOUREX Tajawal", Tahoma, Arial, sans-serif','noto-kufi':'"Noto Kufi Arabic", Tahoma, Arial, sans-serif','noto-naskh':'"Noto Naskh Arabic", Tahoma, Arial, serif'};
const AUTO_LATIN_BY_TEMPLATE: Record<TemplateId,Exclude<LatinFontId,'auto'>> = {executive:'inter',minimal:'source-sans',trade:'source-sans',signature:'playfair',obsidian:'montserrat',cobalt:'montserrat',editorial:'playfair',split:'inter',prism:'montserrat',slate:'source-sans',horizon:'playfair',mono:'source-sans',aurora:'montserrat',ledger:'source-sans',noir:'montserrat',midnight:'montserrat',blackivory:'playfair',carbon:'montserrat'};
const AUTO_ARABIC_BY_TEMPLATE: Record<TemplateId,Exclude<ArabicFontId,'auto'>> = {executive:'tajawal',minimal:'tajawal',trade:'tajawal',signature:'tajawal',obsidian:'tajawal',cobalt:'tajawal',editorial:'tajawal',split:'tajawal',prism:'tajawal',slate:'tajawal',horizon:'tajawal',mono:'tajawal',aurora:'tajawal',ledger:'tajawal',noir:'tajawal',midnight:'tajawal',blackivory:'tajawal',carbon:'tajawal'};

type TextScale='small'|'normal'|'large';
export type DocumentTone='light'|'dark';

export interface TemplateAppearanceTokens {
  page:string;rowSurface:string;surface:string;surfaceInk:string;surfaceMuted:string;
  darkSurface:string;darkSurfaceInk:string;darkSurfaceMuted:string;
  heading:string;primary:string;secondary:string;muted:string;border:string;
  tableHeader:string;tableHeaderText:string;accent:string;accentInk:string;
  totalsSurface:string;inverse:string;
  titleScale:number;headingScale:number;bodyScale:number;tableScale:number;
}

function validHex(value:unknown):value is string{return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);}
export function resolvedTemplateId(value:unknown):TemplateId{return typeof value==='string'&&Object.prototype.hasOwnProperty.call(AUTO_ACCENTS,value)?value as TemplateId:'executive';}
export function resolvedDocumentTone(appearance:DocumentAppearance):DocumentTone{return DARK_BODY_TEMPLATES.has(resolvedTemplateId((appearance as any)?.templateId))?'dark':'light';}
function safeLatinFontId(value:unknown):LatinFontId{return value==='inter'||value==='source-sans'||value==='montserrat'||value==='playfair'?value:'auto';}
function safeArabicFontId(value:unknown):ArabicFontId{return value==='cairo'||value==='tajawal'||value==='noto-kufi'||value==='noto-naskh'?value:'auto';}
export function resolvedAccent(appearance:DocumentAppearance):string{const templateId=resolvedTemplateId((appearance as any)?.templateId);return (appearance?.paletteMode??'auto')==='custom'&&validHex(appearance?.accentColor)?appearance.accentColor:AUTO_ACCENTS[templateId];}
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
function safeTextColor(candidate:unknown,backgrounds:string|readonly string[],fallback:string,minContrast=4.5):string{
  if(!validHex(candidate))return fallback;
  const surfaces=Array.isArray(backgrounds)?backgrounds:[backgrounds as string];
  return surfaces.every(background=>colorContrast(candidate,background)>=minContrast)?candidate:fallback;
}
function scaleValue(value:TextScale|undefined,normal:number,smallRatio:number,largeRatio:number):number{
  return normal*(value==='small'?smallRatio:value==='large'?largeRatio:1);
}

export function resolvedAccentInk(hex:string):'#ffffff'|'#101010'{
  if(!validHex(hex))return'#101010';
  const value=luminance(hex);
  const dark=luminance('#101010');
  return contrastRatio(1,value)>=contrastRatio(value,dark)?'#ffffff':'#101010';
}

export function resolvedAppearanceTokens(appearance:DocumentAppearance):TemplateAppearanceTokens{
  /* Revision history and recurring templates can outlive the schema version that
   * created them. Resolve defensively at the renderer boundary as well as in vault
   * migration so one malformed legacy template/font id can never produce undefined
   * colors or fonts in Preview/PDF/Print/Share. */
  const templateId=resolvedTemplateId((appearance as any)?.templateId);
  const accent=resolvedAccent({...appearance,templateId});
  const custom=(appearance?.paletteMode??'auto')==='custom';
  const darkBody=DARK_BODY_TEMPLATES.has(templateId);
  const page=TEMPLATE_PAPERS[templateId];
  const lightSurface=TEMPLATE_LIGHT_SURFACES[templateId];
  // Dark identities must clear both their paper and their authored dark semantic
  // surfaces. Light identities clear paper + local light fills.
  const darkSemanticSurface=TEMPLATE_DARK_SURFACES[templateId]||page;
  const bodyContrastSurfaces=darkBody?[page,darkSemanticSurface]:[page,lightSurface];

  const defaultPrimary=darkBody?'#f5f1e9':'#17212b';
  const defaultSecondary=darkBody?'#aeb5ba':'#4d5b68';
  const primary=custom?safeTextColor(appearance?.primaryTextColor,bodyContrastSurfaces,defaultPrimary):defaultPrimary;
  const secondary=custom?safeTextColor(appearance?.secondaryTextColor,bodyContrastSurfaces,defaultSecondary):defaultSecondary;
  const autoHeading=safeTextColor(accent,bodyContrastSurfaces,primary);
  const heading=custom?safeTextColor(appearance?.headingTextColor,bodyContrastSurfaces,autoHeading):autoHeading;
  const legacyScale=appearance?.textScale??'normal';

  // Keep commercial PDFs readable at normal zoom. The old effective cascade
  // drifted to ~5–6pt labels/table copy, which looked washed out on iPhone and
  // in client PDFs. Normal now restores a restrained business-document baseline
  // while Small/Large remain bounded around it.
  const titleScale=scaleValue(appearance?.documentTitleScale??'normal',1,.92,1.10);
  const headingScale=scaleValue(appearance?.sectionHeadingScale??'normal',.78,.94,1.08);
  const bodyScale=scaleValue(appearance?.bodyTextScale??legacyScale,1,.95,1.06);
  const tableScale=scaleValue(appearance?.tableTextScale??legacyScale,8.2/9.1,.95,1.05);

  // All dark documents keep identity and signing areas on their own paper.
  const surface=darkBody?darkSemanticSurface:'#ffffff';
  const surfaceInk=darkBody?'#f5f1e9':'#17212b';
  const surfaceMuted=darkBody?'#aeb5ba':'#58656f';
  const darkSurface=darkBody?darkSemanticSurface:'#202020';
  const darkSurfaceInk='#fffaf0';
  const darkSurfaceMuted='#d7d0c4';

  return {
    page,rowSurface:lightSurface,surface,surfaceInk,surfaceMuted,darkSurface,darkSurfaceInk,darkSurfaceMuted,
    heading,primary,secondary,muted:darkBody?'#aeb5ba':'#687582',border:darkBody?'#343a3f':'#d8dde2',
    tableHeader:darkBody?'#080a0c':'#eef1f3',tableHeaderText:darkBody?'#fffaf0':'#17212b',
    accent,accentInk:resolvedAccentInk(accent),totalsSurface:darkBody?'#202529':'#f5f2ea',inverse:'#ffffff',
    titleScale,headingScale,bodyScale,tableScale
  };
}

export function resolvedLatinFont(appearance:DocumentAppearance):string{const templateId=resolvedTemplateId((appearance as any)?.templateId);const requested=safeLatinFontId((appearance as any)?.latinFont);const fontId=requested==='auto'?AUTO_LATIN_BY_TEMPLATE[templateId]:requested;return LATIN_FONTS[fontId];}
export function resolvedArabicFont(appearance:DocumentAppearance):string{const templateId=resolvedTemplateId((appearance as any)?.templateId);const requested=safeArabicFontId((appearance as any)?.arabicFont);const fontId=requested==='auto'?AUTO_ARABIC_BY_TEMPLATE[templateId]:requested;return ARABIC_FONTS[fontId];}
