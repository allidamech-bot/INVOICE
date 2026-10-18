/** Read-only presentation data model for LOUREX local business evidence.
 * The source is the stored assistant message, never legacy nested JSX.
 * This parser never calculates money, loads records, or triggers actions. */
export type FinancialFact={label:string;value:string};
export type FinancialMovement={kind:'movement';label:string;date:string;reference:string;amount:string;balance:string};
export type FinancialSection={title:string;facts:FinancialFact[];movements:FinancialMovement[];notes:string[]};
export type FinancialReadout={title:string;party:string;intro:FinancialFact[];sections:FinancialSection[];itemsTitle:string;items:string[];partial:boolean};

const clean=(value:string)=>value.replace(/[\u2066-\u2069]/g,'').replace(/\*\*/g,'').replace(/\x60/g,'').trim();
const fact=(line:string):FinancialFact|null=>{
 const m=line.match(/^-\s+\*\*([^*]{1,100})\*\*:\s*(.+)$/);
 return m?{label:clean(m[1]||''),value:clean(m[2]||'')}:null;
};

/** Backward-compatible reader for the exact locally produced evidence format.
 * All content remains plain text; malformed delimiters fail closed. */
export function parseFinancialReadout(source:unknown):FinancialReadout|null{
 if(typeof source!=='string'||source.length>15000)return null;
 const raw=source.replace(/\r\n?/g,'\n');
 const lines=raw.split('\n'),first=lines[0]?.trim()||'';
 if(!/^## [^\n]{1,180}$/.test(first))return null;
 const start=lines.findIndex(s=>s.startsWith(':::lourex-details '));
 const stop=lines.indexOf(':::lourex-end',start+1);
 if(start<1||stop<=start||stop!==lines.length-1)return null;
 if(lines.slice(1,start).some(s=>s.startsWith(':::lourex-')))return null;
 const title=clean(first.slice(3)),itemsTitle=clean((lines[start]||'').slice(':::lourex-details '.length));
 if(!title||!itemsTitle)return null;
 const answer:FinancialReadout={title,party:'',intro:[],sections:[],itemsTitle,items:[],partial:false};
 let active:FinancialSection|null=null,latest:FinancialMovement|null=null;
 for(const original of lines.slice(1,start)){
  const line=original.trim();if(!line)continue;
  if(line.startsWith('### ')){
   active={title:clean(line.slice(4)),facts:[],movements:[],notes:[]};
   if(!active.title)return null;
   answer.sections.push(active);latest=null;continue;
  }
  if(line.startsWith('**الطرف:** ')||line.startsWith('**Party:** ')){
   answer.party=clean(line.split(':').slice(1).join(':'));
   continue;
  }
  if(line.startsWith('- **')){
   const data=fact(line);
   if(data){(active?.facts||answer.intro).push(data);latest=null;continue;}
   const match=line.match(/^-\s+\*\*(.+?)\*\*\s*·\s*(.*?)\s*·\s*(.*)$/);
   if(match&&active){
    latest={kind:'movement',label:clean(match[1]||''),date:clean(match[2]||''),reference:clean(match[3]||''),amount:'',balance:''};
    active.movements.push(latest);continue;
   }
  }
  if(latest&&(line.includes('Balance after:')||line.includes('الرصيد بعد الحركة:'))){
   const segments=line.split(/\s*·\s*/);
   latest.amount=clean(segments[0]||'');
   latest.balance=clean(segments.slice(1).join(' · '));
   latest=null;continue;
  }
  if(active)active.notes.push(clean(line));
  else answer.intro.push({label:'',value:clean(line)});
 }
 for(const line of lines.slice(start+1,stop)){
  const text=line.trim();if(!text)continue;
  if(text.startsWith('- '))answer.items.push(clean(text.slice(2)));
  else if(text.includes('جزئية')||/partial|incomplete/i.test(text))answer.partial=true;
  else answer.items.push(clean(text));
 }
 if(answer.items.length>20)return null;
 return answer;
}
