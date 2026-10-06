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
  executive:'#bd9659', minimal:'#242b30', trade:'#ad8747', signature:'#aa8143', obsidian:'#b68d4e', cobalt:'#246ea8', editorial:'#1e2529', split:'#527382', prism:'#4f7d78', slate:'#566874', horizon:'#235269', mono:'#111111', aurora:'#477b74', ledger:'#314e5d', noir:'#b58a46', midnight:'#c19b59', blackivory:'#26231f', carbon:'#a98148'
};

/* Effective output papers after the currently loaded cascade. v141 makes the
 * commercial identities light, but the later v330 identity layer deliberately
 * turns Obsidian back into a graphite sheet while leaving its party cards light. */
const TEMPLATE_PAPERS: Record<TemplateId,string> = {
  executive:'#ffffff', minimal:'#ffffff', trade:'#ffffff', signature:'#fcfaf5', obsidian:'#15191c', cobalt:'#ffffff', editorial:'#ffffff', split:'#ffffff', prism:'#ffffff', slate:'#ffffff', horizon:'#ffffff', mono:'#ffffff', aurora:'#fdfbf6', ledger:'#ffffff', noir:'#fffdf8', midnight:'#fcfaf4', blackivory:'#fbf6eb', carbon:'#fafafa'
};

/* Foreground roles are used on more than the page itself: alternating item rows,
 * party cards and section labels also use authored light fills. A color that only
 * clears 4.5:1 on pure white can still become unreadable on those slightly darker
 * surfaces, so custom text must pass both the page and the darkest common light
 * semantic surface for that template. */
const TEMPLATE_LIGHT_SURFACES: Record<TemplateId,string> = {
  executive:'#f5f7f8', minimal:'#ffffff', trade:'#f2f6f7', signature:'#f8f3e8', obsidian:'#f1f2f2', cobalt:'#f1f6fa', editorial:'#ffffff', split:'#eef2f2', prism:'#f3f8f7', slate:'#f1f3f4', horizon:'#f4f8f9', mono:'#f4f4f4', aurora:'#eef5f3', ledger:'#e9eef0', noir:'#f5f2eb', midnight:'#edf2f3', blackivory:'#f5efe3', carbon:'#eceeef'
};
const DARK_BODY_TEMPLATES=new Set<TemplateId>(['obsidian']);
const AUTO_LIGHT_TEXT='#101010';
const AUTO_DARK_TEXT='#ffffff';
const LATIN_FONTS: Record<Exclude<LatinFontId,'auto'>,string> = {inter:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif','source-sans':'"Source Sans 3", "Segoe UI", Arial, sans-serif',montserrat:'Montserrat, Arial, sans-serif',playfair:'"Playfair Display", Georgia, serif'};
const ARABIC_FONTS: Record<Exclude<ArabicFontId,'auto'>,string> = {cairo:'Cairo, Tahoma, Arial, sans-serif',tajawal:'Tajawal, Tahoma, Arial, sans-serif','noto-kufi':'"Noto Kufi Arabic", Tahoma, Arial, sans-serif','noto-naskh':'"Noto Naskh Arabic", Tahoma, Arial, serif'};
const AUTO_LATIN_BY_TEMPLATE: Record<TemplateId,Exclude<LatinFontId,'auto'>> = {executive:'inter',minimal:'source-sans',trade:'source-sans',signature:'playfair',obsidian:'montserrat',cobalt:'montserrat',editorial:'playfair',split:'inter',prism:'montserrat',slate:'source-sans',horizon:'playfair',mono:'source-sans',aurora:'montserrat',ledger:'source-sans',noir:'montserrat',midnight:'montserrat',blackivory:'playfair',carbon:'montserrat'};
const AUTO_ARABIC_BY_TEMPLATE: Record<TemplateId,Exclude<ArabicFontId,'auto'>> = {executive:'cairo',minimal:'tajawal',trade:'tajawal',signature:'noto-naskh',obsidian:'noto-kufi',cobalt:'noto-kufi',editorial:'noto-naskh',split:'cairo',prism:'noto-kufi',slate:'tajawal',horizon:'noto-naskh',mono:'tajawal',aurora:'noto-kufi',ledger:'tajawal',noir:'noto-kufi',midnight:'noto-kufi',blackivory:'noto-naskh',carbon:'noto-kufi'};

type TextScale='small'|'normal'|'large';
export type DocumentTone='light'|'dark';

export interface TemplateAppearanceTokens {
  page:string;surface:string;surfaceInk:string;surfaceMuted:string;
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
  // Obsidian body copy can render on both the graphite page and its #20262a soft
  // rows/sections. Light templates likewise need to clear paper + semantic fill.
  const bodyContrastSurfaces=darkBody?[page,'#20262a']:[page,lightSurface];

  const defaultPrimary=darkBody?'#f5f1e9':'#17212b';
  const defaultSecondary=darkBody?'#aeb5ba':'#4d5b68';
  const autoText=darkBody?AUTO_DARK_TEXT:AUTO_LIGHT_TEXT;
  const primary=custom?safeTextColor(appearance?.primaryTextColor,bodyContrastSurfaces,defaultPrimary):autoText;
  const secondary=custom?safeTextColor(appearance?.secondaryTextColor,bodyContrastSurfaces,defaultSecondary):autoText;
  const autoHeading=safeTextColor(accent,bodyContrastSurfaces,primary);
  const heading=custom?safeTextColor(appearance?.headingTextColor,bodyContrastSurfaces,autoHeading):autoText;
  const legacyScale=appearance?.textScale??'normal';

  // Renderer variables predate role-based sizing and use historical numeric bases
  // (10 / 9.2 / 9.1 px). Normal is anchored to the effective shipped document
  // cascade: v364 owns 6.8px section headings while v141 owns 8.2px body and
  // 7.25px table text. Small/Large remain restrained multipliers around those.
  const titleScale=scaleValue(appearance?.documentTitleScale??'normal',1,.92,1.10);
  const headingScale=scaleValue(appearance?.sectionHeadingScale??'normal',.68,.94,1.08);
  const bodyScale=scaleValue(appearance?.bodyTextScale??legacyScale,8.2/9.2,.95,1.06);
  const tableScale=scaleValue(appearance?.tableTextScale??legacyScale,7.25/9.1,.95,1.05);

  // Surface tokens describe local modules, not the page as a whole. Obsidian is
  // intentionally mixed: graphite page/body plus light #f1f2f2 party cards.
  // Custom page text can therefore never be reused blindly inside those cards.
  const surface=darkBody?lightSurface:'#ffffff';
  const surfaceInk='#17212b';
  const surfaceMuted='#58656f';
  const darkSurface=darkBody?page:'#202020';
  const darkSurfaceInk='#fffaf0';
  const darkSurfaceMuted='#d7d0c4';

  return {
    page,surface,surfaceInk,surfaceMuted,darkSurface,darkSurfaceInk,darkSurfaceMuted,
    heading,primary,secondary,muted:darkBody?'#aeb5ba':'#687582',border:darkBody?'#343a3f':'#d8dde2',
    tableHeader:darkBody?'#080a0c':'#eef1f3',tableHeaderText:darkBody?'#fffaf0':'#17212b',
    accent,accentInk:resolvedAccentInk(accent),totalsSurface:darkBody?'#202529':'#f5f2ea',inverse:'#ffffff',
    titleScale,headingScale,bodyScale,tableScale
  };
}

export function resolvedLatinFont(appearance:DocumentAppearance):string{const templateId=resolvedTemplateId((appearance as any)?.templateId);const requested=safeLatinFontId((appearance as any)?.latinFont);const fontId=requested==='auto'?AUTO_LATIN_BY_TEMPLATE[templateId]:requested;return LATIN_FONTS[fontId];}
export function resolvedArabicFont(appearance:DocumentAppearance):string{const templateId=resolvedTemplateId((appearance as any)?.templateId);const requested=safeArabicFontId((appearance as any)?.arabicFont);const fontId=requested==='auto'?AUTO_ARABIC_BY_TEMPLATE[templateId]:requested;return ARABIC_FONTS[fontId];}
