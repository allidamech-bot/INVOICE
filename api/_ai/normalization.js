const ARABIC_INDIC='٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC='۰۱۲۳۴۵۶۷۸۹';

function asciiDigits(value){
  let output='';
  for(const char of String(value??'')){
    const ar=ARABIC_INDIC.indexOf(char);if(ar>=0){output+=String(ar);continue;}
    const fa=EASTERN_ARABIC.indexOf(char);if(fa>=0){output+=String(fa);continue;}
    output+=char==='٫'?'.':char==='٬'?',':char;
  }
  return output;
}

/**
 * Normalize an untrusted AI-extracted non-negative decimal without silently
 * changing an ambiguous localized value into a different amount.
 *
 * - Supports Arabic/Persian digits and Arabic decimal/thousands separators.
 * - Supports 1,234.50 and 1.234,50 when both separator roles are explicit.
 * - A lone comma with exactly three trailing digits (for example 1,234) is
 *   intentionally rejected because it can mean either 1234 or 1.234.
 */
export function normalizeAiDecimal(value,{maxWhole=18,maxFraction=4}={}){
  let raw=asciiDigits(value).normalize('NFKC').trim().replace(/[\s\u00a0\u202f]/g,'');
  if(!raw||!/^[0-9.,]+$/.test(raw))return'';
  const commas=(raw.match(/,/g)||[]).length,dots=(raw.match(/\./g)||[]).length;
  if(commas&&dots){
    const decimal=raw.lastIndexOf(',')>raw.lastIndexOf('.')?',':'.';const grouping=decimal===','?'.':',';
    const parts=raw.split(decimal);if(parts.length!==2)return'';const wholeRaw=parts[0]||'',fraction=parts[1]||'';if(!fraction||fraction.length>maxFraction)return'';
    const groups=wholeRaw.split(grouping);const first=groups[0]||'';if(groups.length>1&&!(first.length>=1&&first.length<=3&&groups.slice(1).every(group=>/^\d{3}$/.test(group))))return'';
    raw=`${groups.join('')}.${fraction}`;
  }else if(commas){
    const parts=raw.split(',');if(parts.some(part=>!/^[0-9]+$/.test(part)))return'';
    if(commas===1){const whole=parts[0]||'',fraction=parts[1]||'';if(fraction.length===3&&whole.length<=3)return'';if(!fraction||fraction.length>maxFraction)return'';raw=`${whole}.${fraction}`;}
    else{const first=parts[0]||'';if(!(first.length>=1&&first.length<=3&&parts.slice(1).every(group=>/^\d{3}$/.test(group))))return'';raw=parts.join('');}
  }else if(dots>1){
    const parts=raw.split('.');const first=parts[0]||'';if(!(first.length>=1&&first.length<=3&&parts.slice(1).every(group=>/^\d{3}$/.test(group))))return'';raw=parts.join('');
  }
  const pattern=new RegExp(`^\\d{1,${Math.max(1,Math.min(30,maxWhole))}}(?:\\.\\d{1,${Math.max(1,Math.min(12,maxFraction))}})?$`);
  return pattern.test(raw)?raw:'';
}

export function normalizeAiDate(value){
  const text=asciiDigits(value).normalize('NFKC').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return'';
  const [year,month,day]=text.split('-').map(Number);if(year<1900||year>2200||month<1||month>12||day<1||day>31)return'';
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?text:'';
}
