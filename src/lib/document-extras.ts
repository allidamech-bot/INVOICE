import type { DocumentLanguage, DocumentWatermark, LetterBlock, LetterDocumentData, LourexDocument } from '../types.js';
import { makeId } from './id.js';

const HEX=/^#[0-9a-f]{6}$/i;
const BLOCK_TYPES=new Set<LetterBlock['type']>(['paragraph','heading','subheading','bullet','quote','spacer']);
const DIRECTIONS=new Set<LetterBlock['direction']>(['auto','ltr','rtl']);
const ALIGNS=new Set<LetterBlock['align']>(['start','center','end','justify']);
const LETTER_FONTS=new Set<LetterBlock['font']>(['system','inter','source-sans','montserrat','playfair','cairo','tajawal','noto-kufi','noto-naskh']);
const PAGE_STYLES=new Set<LetterDocumentData['pageStyle']>(['plain','ruled','grid']);
const HEADER_STYLES=new Set<LetterDocumentData['headerStyle']>(['classic','minimal','accent']);
const FOOTER_STYLES=new Set<LetterDocumentData['footerStyle']>(['company','minimal','none']);
const LETTER_PRESETS=new Set<LetterDocumentData['preset']>(['blank','formal-letter','memo','notice']);

function str(value:unknown,fallback=''):string{return typeof value==='string'?value:fallback;}
function num(value:unknown,fallback:number,min:number,max:number):number{const n=typeof value==='number'?value:Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;}
function bool(value:unknown,fallback=false):boolean{return typeof value==='boolean'?value:fallback;}
function color(value:unknown,fallback:string):string{const v=str(value).trim();return HEX.test(v)?v:fallback;}

export function isLetterDocument(doc:Pick<LourexDocument,'kind'>|null|undefined):boolean{return Boolean(doc&&doc.kind==='draft');}

export function defaultWatermark():DocumentWatermark{
  return {enabled:false,type:'text',pattern:'single',text:'DRAFT',opacity:0.08,color:'#0f6f7a',angle:-32,size:72};
}

export function normalizeWatermark(value:unknown):DocumentWatermark{
  const source=value&&typeof value==='object'?value as any:{};
  return {
    enabled:bool(source.enabled,false),
    type:source.type==='logo'?'logo':'text',
    pattern:source.pattern==='repeat'?'repeat':'single',
    text:str(source.text,'DRAFT').slice(0,80),
    opacity:num(source.opacity,0.08,0.02,0.30),
    color:color(source.color,'#0f6f7a'),
    angle:num(source.angle,-32,-75,75),
    size:num(source.size,72,28,150)
  };
}

export function defaultLetterBlock(type:LetterBlock['type']='paragraph',text=''):LetterBlock{
  const heading=type==='heading',sub=type==='subheading';
  return {
    id:makeId('block'),type,text,direction:'auto',align:'start',font:'system',
    size:heading?24:sub?17:14,color:'#17323a',bold:heading||sub,italic:false,underline:false,
    lineHeight:heading?1.25:1.65,spacingBefore:heading?14:sub?10:4,spacingAfter:heading?10:sub?8:8
  };
}

export function defaultLetterData(language:DocumentLanguage='en'):LetterDocumentData{
  const rtl=language==='ar';
  const intro=defaultLetterBlock('paragraph','');
  intro.direction=rtl?'rtl':'auto';
  intro.align=rtl?'start':'start';
  intro.font=rtl?'cairo':'inter';
  return {
    preset:'blank',recipient:'',attention:'',subject:'',reference:'',pageStyle:'plain',headerStyle:'accent',footerStyle:'company',
    showLogo:true,showCompanyDetails:true,showDate:true,showReference:true,showSignature:true,showStamp:false,
    accentColor:'#2fc4cf',bodyWidth:'comfortable',blocks:[intro]
  };
}

export function letterPreset(preset:LetterDocumentData['preset'],language:DocumentLanguage='en'):LetterDocumentData{
  const base=defaultLetterData(language),rtl=language==='ar';
  const font=rtl?'cairo':'inter';
  const block=(type:LetterBlock['type'],text:string)=>({...defaultLetterBlock(type,text),direction:rtl?'rtl':'auto' as const,font:font as LetterBlock['font']});
  if(preset==='formal-letter')return {...base,preset,subject:rtl?'الموضوع':'Subject',blocks:[block('paragraph',rtl?'السادة المحترمون،':'Dear Sir / Madam,'),block('paragraph',''),block('paragraph',rtl?'وتفضلوا بقبول فائق الاحترام.':'Sincerely,')]};
  if(preset==='memo')return {...base,preset,headerStyle:'minimal',footerStyle:'minimal',blocks:[block('heading',rtl?'مذكرة داخلية':'INTERNAL MEMO'),block('paragraph','')]};
  if(preset==='notice')return {...base,preset,headerStyle:'accent',blocks:[block('heading',rtl?'إشعار رسمي':'OFFICIAL NOTICE'),block('paragraph','')]};
  return {...base,preset:'blank'};
}

export function normalizeLetterBlock(value:unknown,index=0):LetterBlock{
  const source=value&&typeof value==='object'?value as any:{};
  const type=BLOCK_TYPES.has(source.type)?source.type:'paragraph';
  const fallback=defaultLetterBlock(type);
  return {
    id:str(source.id,`block-${index+1}`)||`block-${index+1}`,type,text:str(source.text).slice(0,50000),
    direction:DIRECTIONS.has(source.direction)?source.direction:'auto',align:ALIGNS.has(source.align)?source.align:'start',
    font:LETTER_FONTS.has(source.font)?source.font:'system',size:num(source.size,fallback.size,9,52),color:color(source.color,'#17323a'),
    bold:bool(source.bold,fallback.bold),italic:bool(source.italic,false),underline:bool(source.underline,false),lineHeight:num(source.lineHeight,fallback.lineHeight,1,2.6),
    spacingBefore:num(source.spacingBefore,fallback.spacingBefore,0,48),spacingAfter:num(source.spacingAfter,fallback.spacingAfter,0,48)
  };
}

export function normalizeLetterData(value:unknown,language:DocumentLanguage='en'):LetterDocumentData{
  const source=value&&typeof value==='object'?value as any:{};
  const fallback=defaultLetterData(language);
  const blocks=Array.isArray(source.blocks)?source.blocks.slice(0,300).map((block:any,index:number)=>normalizeLetterBlock(block,index)):fallback.blocks;
  return {
    preset:LETTER_PRESETS.has(source.preset)?source.preset:'blank',recipient:str(source.recipient).slice(0,500),attention:str(source.attention).slice(0,500),subject:str(source.subject).slice(0,1000),reference:str(source.reference).slice(0,250),
    pageStyle:PAGE_STYLES.has(source.pageStyle)?source.pageStyle:'plain',headerStyle:HEADER_STYLES.has(source.headerStyle)?source.headerStyle:'accent',footerStyle:FOOTER_STYLES.has(source.footerStyle)?source.footerStyle:'company',
    showLogo:bool(source.showLogo,true),showCompanyDetails:bool(source.showCompanyDetails,true),showDate:bool(source.showDate,true),showReference:bool(source.showReference,true),showSignature:bool(source.showSignature,true),showStamp:bool(source.showStamp,false),
    accentColor:color(source.accentColor,'#2fc4cf'),bodyWidth:source.bodyWidth==='wide'?'wide':source.bodyWidth==='narrow'?'narrow':'comfortable',blocks:blocks.length?blocks:fallback.blocks
  };
}

export function letterPlainText(letter:LetterDocumentData|undefined):string{
  if(!letter)return'';
  return [letter.recipient,letter.attention,letter.subject,letter.reference,...letter.blocks.map(block=>block.text)].filter(Boolean).join(' ');
}

export function withLetterPreset(doc:LourexDocument,preset:LetterDocumentData['preset']):LourexDocument{
  return {...doc,letter:letterPreset(preset,doc.language),updatedAt:new Date().toISOString()};
}
