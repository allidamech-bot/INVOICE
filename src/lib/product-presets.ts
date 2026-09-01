export interface PresetChoice {
  value:string;
  label:string;
}

const PREFERRED_CURRENCIES=['USD','EUR','SAR','TRY','AED','GBP','SYP','CNY','CHF','JPY','QAR','KWD','BHD','OMR','JOD','EGP','IQD','LBP','INR','PKR'];
const FALLBACK_CURRENCIES=[
  ...PREFERRED_CURRENCIES,'AFN','ALL','DZD','AOA','ARS','AMD','AUD','AZN','BDT','BGN','BRL','BYN','CAD','CLP','COP','CRC','CZK','DKK','DOP','ETB','GEL','GHS','HKD','HUF','IDR','ILS','ISK','KES','KRW','KZT','MAD','MDL','MKD','MMK','MNT','MUR','MXN','MYR','NGN','NOK','NPR','NZD','PEN','PHP','PLN','RON','RSD','RUB','RWF','SEK','SGD','THB','TND','TWD','TZS','UAH','UGX','UYU','UZS','VND','XAF','XOF','ZAR','ZMW'
];

export const UNIT_CHOICES:Array<{value:string;en:string;ar:string}>=[
  {value:'PCS',en:'Piece',ar:'قطعة'},
  {value:'Unit',en:'Unit',ar:'وحدة'},
  {value:'Carton',en:'Carton',ar:'كرتون'},
  {value:'Box',en:'Box',ar:'علبة / صندوق'},
  {value:'Pack',en:'Pack',ar:'عبوة'},
  {value:'Case',en:'Case',ar:'كرتونة / كيس'},
  {value:'Bag',en:'Bag',ar:'كيس'},
  {value:'Bottle',en:'Bottle',ar:'زجاجة'},
  {value:'Can',en:'Can',ar:'علبة معدنية'},
  {value:'Jar',en:'Jar',ar:'مرطبان'},
  {value:'Pouch',en:'Pouch',ar:'كيس مرن'},
  {value:'Tray',en:'Tray',ar:'صينية'},
  {value:'Pallet',en:'Pallet',ar:'طبالي'},
  {value:'Sack',en:'Sack',ar:'شوال'},
  {value:'Drum',en:'Drum',ar:'برميل'},
  {value:'Roll',en:'Roll',ar:'رول'},
  {value:'Bundle',en:'Bundle',ar:'حزمة'},
  {value:'Tube',en:'Tube',ar:'أنبوب'},
  {value:'Set',en:'Set',ar:'طقم'},
  {value:'Pair',en:'Pair',ar:'زوج'},
  {value:'Dozen',en:'Dozen',ar:'درزن'},
  {value:'KG',en:'Kilogram',ar:'كيلوغرام'},
  {value:'G',en:'Gram',ar:'غرام'},
  {value:'Ton',en:'Metric ton',ar:'طن'},
  {value:'L',en:'Liter',ar:'لتر'},
  {value:'ML',en:'Milliliter',ar:'مل'},
  {value:'M',en:'Meter',ar:'متر'},
  {value:'CM',en:'Centimeter',ar:'سم'},
  {value:'SQM',en:'Square meter',ar:'متر مربع'},
  {value:'CBM',en:'Cubic meter',ar:'متر مكعب'}
];

export const PACKING_TYPE_CHOICES:Array<{value:string;en:string;ar:string}>=[
  {value:'Carton',en:'Carton',ar:'كرتون'},
  {value:'Master Carton',en:'Master carton',ar:'كرتون رئيسي'},
  {value:'Box',en:'Box',ar:'علبة / صندوق'},
  {value:'Case',en:'Case',ar:'كرتونة'},
  {value:'Pack',en:'Pack',ar:'عبوة'},
  {value:'Bag',en:'Bag',ar:'كيس'},
  {value:'Bottle',en:'Bottle',ar:'زجاجة'},
  {value:'Can',en:'Can',ar:'علبة معدنية'},
  {value:'Jar',en:'Jar',ar:'مرطبان'},
  {value:'Pouch',en:'Pouch',ar:'كيس مرن'},
  {value:'Tray',en:'Tray',ar:'صينية'},
  {value:'Pallet',en:'Pallet',ar:'طبالي'},
  {value:'Sack',en:'Sack',ar:'شوال'},
  {value:'Drum',en:'Drum',ar:'برميل'},
  {value:'Crate',en:'Crate',ar:'صندوق نقل'},
  {value:'Bundle',en:'Bundle',ar:'حزمة'},
  {value:'Roll',en:'Roll',ar:'رول'},
  {value:'Tube',en:'Tube',ar:'أنبوب'}
];

export const PACKING_COUNT_CHOICES=['1','2','4','6','8','10','12','15','18','20','24','25','30','36','40','48','50','60','72','96','100','108','120','144'];
export const PACKING_SIZE_CHOICES=[
  '10 ml','20 ml','25 ml','30 ml','50 ml','60 ml','100 ml','125 ml','150 ml','180 ml','200 ml','250 ml','300 ml','330 ml','355 ml','400 ml','500 ml','600 ml','750 ml','1 L','1.5 L','2 L','5 L',
  '10 g','25 g','50 g','100 g','125 g','200 g','250 g','500 g','1 kg','2 kg','5 kg','10 kg','25 kg'
];

const REGION_CODES=('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' ');
const PREFERRED_REGIONS=['TR','SA','SY','AE','CN','PL','DE','EG','US','GB','IT','FR','NL','BE','ES','IN'];

function displayNames(locale:string,type:'region'|'currency'):Intl.DisplayNames|null{
  try{return new Intl.DisplayNames([locale],{type});}catch{return null;}
}

export function unitChoices(arabic:boolean):PresetChoice[]{
  return UNIT_CHOICES.map(choice=>({value:choice.value,label:arabic?`${choice.ar} — ${choice.value}`:`${choice.en} — ${choice.value}`}));
}

export function packingTypeChoices(arabic:boolean):PresetChoice[]{
  return PACKING_TYPE_CHOICES.map(choice=>({value:choice.value,label:arabic?`${choice.ar} — ${choice.value}`:choice.en}));
}

export function currencyChoices(arabic:boolean):PresetChoice[]{
  let supported:string[]=[];
  try{
    const fn=(Intl as any).supportedValuesOf;
    if(typeof fn==='function')supported=fn('currency');
  }catch{}
  const codes=Array.from(new Set([...PREFERRED_CURRENCIES,...(supported.length?supported:FALLBACK_CURRENCIES)])).filter(Boolean);
  const ui=displayNames(arabic?'ar':'en','currency');
  const preferred=new Set(PREFERRED_CURRENCIES);
  return codes
    .map(code=>({value:code,label:`${code} — ${ui?.of(code)||code}`}))
    .sort((a,b)=>{
      const ap=preferred.has(a.value),bp=preferred.has(b.value);
      if(ap!==bp)return ap?-1:1;
      if(ap&&bp)return PREFERRED_CURRENCIES.indexOf(a.value)-PREFERRED_CURRENCIES.indexOf(b.value);
      return a.label.localeCompare(b.label,arabic?'ar':'en',{sensitivity:'base'});
    });
}

export function countryChoices(arabic:boolean):PresetChoice[]{
  const en=displayNames('en','region');
  const ui=displayNames(arabic?'ar':'en','region');
  const preferred=new Set(PREFERRED_REGIONS);
  return REGION_CODES.map(code=>{
    const english=en?.of(code)||code;
    const local=ui?.of(code)||english;
    return {value:english,label:arabic?`${local} — ${english}`:english,code};
  }).sort((a,b)=>{
    const ap=preferred.has(a.code),bp=preferred.has(b.code);
    if(ap!==bp)return ap?-1:1;
    if(ap&&bp)return PREFERRED_REGIONS.indexOf(a.code)-PREFERRED_REGIONS.indexOf(b.code);
    return a.label.localeCompare(b.label,arabic?'ar':'en',{sensitivity:'base'});
  }).map(({value,label})=>({value,label}));
}

export interface ParsedPacking {
  type:string;
  count:string;
  size:string;
  custom:boolean;
}

export function parsePackingPreset(raw:string):ParsedPacking{
  const value=(raw||'').trim();
  if(!value)return {type:'',count:'',size:'',custom:false};
  const types=new Set(PACKING_TYPE_CHOICES.map(choice=>choice.value));
  const full=value.match(/^(\d+)\s*[×xX*]\s*(.+?)\s*\/\s*(.+)$/);
  if(full){
    const count=full[1]||'',size=(full[2]||'').trim(),type=(full[3]||'').trim();
    if(types.has(type))return {type,count,size,custom:false};
  }
  const counted=value.match(/^(\d+)\s*(?:PCS|Pieces?)\s*\/\s*(.+)$/i);
  if(counted){
    const count=counted[1]||'',type=(counted[2]||'').trim();
    if(types.has(type))return {type,count,size:'',custom:false};
  }
  if(types.has(value))return {type:value,count:'',size:'',custom:false};
  return {type:'',count:'',size:'',custom:true};
}

export function buildPackingPreset(type:string,count:string,size:string):string{
  if(!type)return '';
  if(count&&size)return `${count} × ${size} / ${type}`;
  if(count)return `${count} PCS / ${type}`;
  return type;
}
