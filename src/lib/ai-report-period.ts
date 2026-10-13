import {todayIso} from './id.js';

export interface AiReportPeriod {from:string;to:string;}

/**
 * An exact named report month can be used as a navigation FILTER, never as
 * a record mutation. The year and month come from the user, not from model
 * output. Named months without an explicit year use the current local year.
 * Ambiguous ranges are not inferred.
 */
export function requestedAiReportPeriod(message:string,today=todayIso()):AiReportPeriod|null{
 const ar='٠١٢٣٤٥٦٧٨٩',fa='۰۱۲۳۴۵۶۷۸۹';
 const text=String(message||'').normalize('NFKC')
  .replace(/[٠-٩۰-۹]/gu,ch=>String(ar.includes(ch)?ar.indexOf(ch):fa.indexOf(ch)))
  .replace(/[\u064b-\u065f\u0670]/gu,'').trim();
 if(!text||text.length>600||!/(?:تقرير|تقارير|\breports?\b)/iu.test(text)||
    !/^(?:افتح|أفتح|اعرض|أعرض|اظهر|أظهر|وريني|ورني|show|open|view|display)(?:\s|$)/iu.test(text)||
    /^(?:لا\s+|do\s+not\s+|don't\s+|without\s+)/iu.test(text))return null;
 const names:[RegExp,number][]=[
  [/(?:يناير|كانون\s+الثاني|january|jan)/iu,1],
  [/(?:فبراير|شباط|february|feb)/iu,2],
  [/(?:مارس|اذار|آذار|march|mar)/iu,3],
  [/(?:ابريل|أبريل|نيسان|april|apr)/iu,4],
  [/(?:مايو|ايار|أيار|may)/iu,5],
  [/(?:يونيو|حزيران|june|jun)/iu,6],
  [/(?:يوليو|تموز|july|jul)/iu,7],
  [/(?:اغسطس|أغسطس|اب|آب|august|aug)/iu,8],
  [/(?:سبتمبر|ايلول|أيلول|september|sep)/iu,9],
  [/(?:اكتوبر|أكتوبر|تشرين\s+الأول|october|oct)/iu,10],
  [/(?:نوفمبر|تشرين\s+الثاني|november|nov)/iu,11],
  [/(?:ديسمبر|كانون\s+الأول|december|dec)/iu,12]
 ];
 const hits=names.filter(([pattern])=>pattern.test(text));
 if(hits.length!==1)return null;
 const years=[...text.matchAll(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/gu)].map(match=>Number(match[1]));
 if(new Set(years).size>1)return null;
 const year=years[0]??Number(today.slice(0,4)),month=hits[0]![1];
 if(!Number.isInteger(year)||year<2000||year>2099||!Number.isInteger(month))return null;
 const monthString=String(month).padStart(2,'0');
 const end=new Date(Date.UTC(year,month,0)).getUTCDate();
 return{from:String(year)+'-'+monthString+'-01',to:String(year)+'-'+monthString+'-'+String(end).padStart(2,'0')};
}
/** Defense in depth: use only date-shaped, strictly ordered report periods. */
export function safeAiReportPeriod(value:unknown):AiReportPeriod|null{
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const raw=value as Record<string,unknown>;
 const from=raw.from,to=raw.to;
 if(typeof from!=='string'||typeof to!=='string')return null;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return null;
 const valid=(date:string)=>{
  const [year=0,month=0,day=0]=date.split('-').map(Number);
  return year>=2000&&year<=2099&&month>=1&&month<=12&&day>=1&&
   day<=new Date(Date.UTC(year,month,0)).getUTCDate();
 };
 return valid(from)&&valid(to)&&from<=to?{from,to}:null;
}
