/** Presentation only. Never parse, round, evaluate or rewrite a financial value. */
export interface AiInlineTextRun {text:string;direction?:'ltr';}
export function aiTextDirection(value:string):'rtl'|'ltr'{
  const first=value.match(/\p{Letter}/u)?.[0]||'';
  return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(first)?'rtl':'ltr';
}
export function aiInlineTextRuns(value:string):AiInlineTextRun[]{
  const digits='[0-9\\u0660-\\u0669\\u06f0-\\u06f9]';
  const number=`[+−-]?${digits}+(?:[.,\\u066b\\u066c]${digits}+)*`;
  const atom=`\\(?\\s*${number}(?:\\s*\\))?`;
  const pattern=new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${atom}(?:\\s*[+−–×÷*/=\\-]\\s*${atom})+(?:\\s*[%٪])?|${number}\\s*[%٪])(?![\\p{L}\\p{N}_-])`,'gu');
  const runs:AiInlineTextRun[]=[];let cursor=0;
  for(const match of value.matchAll(pattern)){
    const start=match.index!;
    if(start>cursor)runs.push({text:value.slice(cursor,start)});
    runs.push({text:match[0],direction:'ltr'});cursor=start+match[0].length;
  }
  if(cursor<value.length)runs.push({text:value.slice(cursor)});
  return runs.length?runs:[{text:value}];
}
