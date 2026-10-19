import type { DocumentAppearance, TemplateId } from '../types.js';
import { resolvedAccent, resolvedTemplateId } from '../lib/appearance.js';

interface ArtPalette { main:string; second:string; ink:string; footer:string; footerInk:string; brandInk?:string; }
/* Artwork colors are paired with their foreground here. SVG fills are literal
   colors so PDF rasterizers do not depend on inherited CSS custom properties. */
const palettes:Record<TemplateId,ArtPalette>={
  executive:{main:'#202445',second:'#353d69',ink:'#ffffff',footer:'#202445',footerInk:'#ffffff'},
  minimal:{main:'#ffffff',second:'#242833',ink:'#1b2330',footer:'#242833',footerInk:'#ffffff'},
  trade:{main:'#ffffff',second:'#1374ae',ink:'#172d3c',footer:'#1374ae',footerInk:'#ffffff'},
  signature:{main:'#b9c9af',second:'#94a58a',ink:'#1e3528',footer:'#dce6d5',footerInk:'#24392b'},
  obsidian:{main:'#181d26',second:'#303b4a',ink:'#ffffff',footer:'#10151d',footerInk:'#ffffff'},
  cobalt:{main:'#165da8',second:'#202d40',ink:'#ffffff',footer:'#202d40',footerInk:'#ffffff'},
  editorial:{main:'#ffffff',second:'#242733',ink:'#20232b',footer:'#242733',footerInk:'#ffffff'},
  split:{main:'#28295b',second:'#414277',ink:'#ffffff',brandInk:'#17212b',footer:'#28295b',footerInk:'#ffffff'},
  prism:{main:'#ffffff',second:'#087f8c',ink:'#172d3b',footer:'#087f8c',footerInk:'#ffffff'},
  slate:{main:'#eef5f5',second:'#93bec5',ink:'#193540',footer:'#d6e7e9',footerInk:'#193540'},
  horizon:{main:'#ffffff',second:'#166eb4',ink:'#173348',footer:'#166eb4',footerInk:'#ffffff'},
  mono:{main:'#ffffff',second:'#181b22',ink:'#181b22',footer:'#181b22',footerInk:'#ffffff'},
  aurora:{main:'#007e79',second:'#073d48',ink:'#ffffff',footer:'#073d48',footerInk:'#ffffff'},
  ledger:{main:'#ffffff',second:'#bf1938',ink:'#232c38',footer:'#bf1938',footerInk:'#ffffff'},
  noir:{main:'#121214',second:'#35302a',ink:'#fffaf0',footer:'#121214',footerInk:'#fffaf0'},
  midnight:{main:'#0c2545',second:'#16538a',ink:'#ffffff',footer:'#0c2545',footerInk:'#ffffff'},
  blackivory:{main:'#f1e7d3',second:'#201c18',ink:'#201c18',footer:'#f1e7d3',footerInk:'#201c18'},
  carbon:{main:'#20252d',second:'#3c4655',ink:'#ffffff',footer:'#20252d',footerInk:'#ffffff'}
};
export function templateArtPalette(appearance:DocumentAppearance):ArtPalette{return palettes[resolvedTemplateId(appearance.templateId)];}

export function TemplateArtwork({variant,position,accent}:{variant:TemplateId;position:'header'|'footer'|'rail';accent?:string}):any{
  const p=palettes[variant];const a=accent||resolvedAccent({templateId:variant,paletteMode:'auto'} as DocumentAppearance);
  const main=p.main,second=p.second;
  if(position==='rail'){
    if(variant==='prism')return <svg className="template-artwork template-artwork-rail" viewBox="0 0 1000 1414" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path fill={second} d="M0 0H52V1414H0Z"/><path fill={a} d="M982 250H1000V1414H982Z"/><path fill={main} d="M0 0H52V84H0Z"/></svg>;
    if(variant==='slate')return <svg className="template-artwork template-artwork-rail" viewBox="0 0 1000 1414" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path fill={second} d="M900 0H1000V1414H900Z"/><path fill={a} d="M0 0H9V1414H0Z"/></svg>;
    return null;
  }
  if(position==='footer'){
    let art:any;
    switch(variant){
      case 'executive':art=<><path fill={a} d="M0 28C260 117 640-38 1000 38V150H0Z"/><path fill={p.footer} d="M0 12C300 104 650-10 1000 54V150H0Z"/></>;break;
      case 'minimal':art=<><path fill={a} d="M0 18H725L755 42H1000V150H0Z"/><path fill={p.footer} d="M0 34H710L750 57H1000V150H0Z"/></>;break;
      case 'trade':art=<><path fill={a} d="M0 50Q350-12 1000 20V150H0Z"/><path fill={second} d="M0 18Q500 105 1000 44V150H0Z"/></>;break;
      case 'signature':art=<><path fill={second} d="M0 40C280-34 430 95 650 30S900 5 1000 40V150H0Z"/><path fill={p.footer} d="M0 57C300-10 440 115 690 54S930 28 1000 60V150H0Z"/></>;break;
      case 'obsidian':art=<><path fill={a} d="M0 0H325L390 47H1000V150H0Z"/><path fill={p.footer} d="M0 18H300L390 65H1000V150H0Z"/></>;break;
      case 'cobalt':art=<><path fill={a} d="M0 75C370-65 650 0 1000 12V150H0Z"/><path fill={p.footer} d="M0 48C310 25 640 98 1000 26V150H0Z"/></>;break;
      case 'editorial':art=<><path fill={a} d="M0 23H1000V38H0Z"/><path fill={p.footer} d="M0 50H1000V150H0Z"/></>;break;
      case 'split':art=<><path fill={a} d="M0 0C210 5 210 78 430 80V150H0Z"/><path fill={p.footer} d="M0 44C280 44 250-15 570 4S870 72 1000 45V150H0Z"/><circle fill={a} cx="0" cy="50" r="45"/></>;break;
      case 'prism':art=<><path fill={a} d="M0 33H1000V150H0Z"/><path fill={p.footer} d="M0 11H760L860 64H1000V150H0Z"/></>;break;
      case 'slate':art=<><path fill={second} d="M0 24H1000V150H0Z"/><path fill={p.footer} d="M0 38H1000V150H0Z"/></>;break;
      case 'horizon':art=<><path fill={a} d="M0 24C300 20 580 2 1000 50V150H0Z"/><path fill={p.footer} d="M0 44C280-34 630 60 1000 25V150H0Z"/></>;break;
      case 'mono':art=<><path fill={p.footer} d="M0 24H715L760 64H1000V150H0Z"/><path fill={main} d="M0 25H155L188 55H0Z"/></>;break;
      case 'aurora':art=<><path fill={a} d="M0 0C400 140 650-45 1000 50V150H0Z"/><path fill={p.footer} d="M0 34C340 8 600 100 1000 14V150H0Z"/></>;break;
      case 'ledger':art=<><path fill={a} d="M0 0C310 10 300 110 620 33S900 6 1000 36V150H0Z"/><path fill={p.footer} d="M0 50C370 130 590-33 1000 58V150H0Z"/></>;break;
      case 'noir':art=<><path fill={a} d="M0 7H300L410 47H1000V150H0Z"/><path fill={second} d="M0 17H280L395 56H1000V150H0Z"/><path fill={p.footer} d="M0 28H250L390 67H1000V150H0Z"/></>;break;
      case 'midnight':art=<><path fill={a} d="M0 36C260-38 700 86 1000 10V150H0Z"/><path fill={second} d="M0 18C340 100 700-48 1000 43V150H0Z"/><path fill={p.footer} d="M0 46C350 10 700 108 1000 35V150H0Z"/></>;break;
      case 'blackivory':art=<><path fill={second} d="M0 0H450L580 60H1000V150H0Z"/><path fill={a} d="M0 33H415L510 72H1000V150H0Z"/><path fill={p.footer} d="M0 48H390L480 83H1000V150H0Z"/></>;break;
      case 'carbon':art=<><path fill={a} d="M0 0H450L370 65H1000V150H0Z"/><path fill={second} d="M0 16H390L320 75H1000V150H0Z"/><path fill={p.footer} d="M0 45H1000V150H0Z"/></>;break;
    }
    // A uniform lower band protects variable-length footer copy and page numbers.
    return <svg className="template-artwork template-artwork-footer" viewBox="0 0 1000 150" preserveAspectRatio="none" aria-hidden="true" focusable="false">{art}<path fill={p.footer} d="M0 88H1000V150H0Z"/></svg>;
  }
  let art:any;
  switch(variant){
    case 'executive':art=<><path fill={main} d="M0 0H1000V253H0Z"/><path fill={a} d="M200-10H525L380 186Q211 383 0 192V261Q239 408 435 214L665-10Z"/><path fill={second} d="M700 0H1000V253H500Z"/></>;break;
    case 'minimal':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={a} d="M0 237H620V276H0ZM920 237H1000V276H920Z"/><path fill={second} d="M640 237H900V242H640Z"/></>;break;
    case 'trade':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={a} d="M0 23C280 113 600-37 1000 33V91C590 9 300 126 0 63Z"/><path fill={second} d="M0 0H1000V75C620 150 360-10 0 53Z"/></>;break;
    case 'signature':art=<><path fill={main} d="M0 0H1000V207C760 88 644 376 352 235S83 222 0 278Z"/><path fill={second} d="M1000 0H806C686 103 628 288 405 261C654 360 722 107 1000 235Z"/><path fill="#ffffff" d="M781 0H806C686 103 628 288 405 261C622 265 701 75 781 0Z"/></>;break;
    case 'obsidian':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M580 0H1000V320H350Z"/><path fill={a} d="M0 0H40L15 320H0Z"/><path fill={a} opacity=".2" d="M45 0H55L30 320H20Z"/></>;break;
    case 'cobalt':art=<><path fill={main} d="M0 0H1000V320C730 193 314 351 0 225Z"/><path fill={second} d="M610-100C560 50 699 239 1000 293V0Z"/><path fill={a} d="M0 224C310 350 730 193 1000 320C730 237 310 389 0 252Z"/></>;break;
    case 'editorial':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={a} d="M0 0H1000V24H0ZM0 260H270L310 289H0Z"/><path fill={second} d="M310 260H1000V289H350Z"/></>;break;
    case 'split':art=<><path fill={main} d="M0 0H1000V234C762 359 547 225 670 0Z"/><path fill={second} d="M620 0C570 167 758 298 1000 235V0Z"/><circle fill={a} cx="650" cy="0" r="56"/><path fill={a} d="M0 300C135 230 224 247 312 320H0Z"/></>;break;
    case 'prism':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M0 0H64V320H0ZM982 0H1000V320H982Z"/><path fill={a} d="M982 176H1000V320H982Z"/><path fill={second} d="M100 243H370L404 277H100V243Z"/></>;break;
    case 'slate':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M850 0H1000V320H850Z"/><path fill={a} d="M0 0H9V320H0Z"/><path fill={second} opacity=".18" d="M615 0H850V320H755Z"/></>;break;
    case 'horizon':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={a} d="M0 16C390-45 740 59 1000 7V54C710 91 380 1 0 58Z"/><path fill={second} d="M0 0H1000V26C660 132 410-30 0 78Z"/><path fill={second} d="M0 295H1000V300H0Z"/></>;break;
    case 'mono':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M0 0H1000V26H0ZM0 228H270L317 274H0ZM967 26H1000V320H967Z"/><path fill={a} d="M0 287H655L685 317H0Z"/></>;break;
    case 'aurora':art=<><path fill={main} d="M0 0H1000V320C700 187 289 362 0 239Z"/><path fill={second} d="M360-50C360 164 601 154 1000 320V0Z"/><path fill={a} d="M0 239C289 362 700 187 1000 320C663 233 277 393 0 267Z"/></>;break;
    case 'ledger':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={a} d="M460 0C620 213 761-51 1000 93V0Z"/><path fill={second} d="M555 0C696 185 851-32 1000 143V0Z"/><path fill={a} opacity=".15" d="M0 276C200 205 237 301 410 278L430 320H0Z"/></>;break;
    case 'noir':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M590 0H1000V320H290Z"/><path fill={a} d="M0 287H345L630 0H655L345 313H0Z"/><path fill={a} opacity=".35" d="M0 270H315L585 0H590L320 275H0Z"/></>;break;
    case 'midnight':art=<><path fill={main} d="M0 0H1000V320C600 196 280 362 0 247Z"/><path fill={second} d="M0 0H1000V53C650 176 240-72 0 31Z"/><path fill={a} d="M0 247C280 362 600 196 1000 320C600 220 280 388 0 274Z"/></>;break;
    case 'blackivory':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M0 0H310L400 83H0Z"/><path fill={a} d="M0 288H610L885 0H914L610 318H0Z"/><path fill={second} d="M980 0H1000V320H920Z"/></>;break;
    case 'carbon':art=<><path fill={main} d="M0 0H1000V320H0Z"/><path fill={second} d="M710 0H1000V320H400Z"/><path fill={a} d="M0 0H320L210 110H0Z"/><path fill={a} d="M745 0H775L455 320H425Z"/><path fill={a} opacity=".18" d="M800 0H1000V320H480Z"/></>;break;
  }
  return <svg className="template-artwork template-artwork-header" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-hidden="true" focusable="false">{art}</svg>;
}
