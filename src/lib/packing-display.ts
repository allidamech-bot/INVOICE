import { PACKING_TYPE_CHOICES, parsePackingPreset } from './product-presets.js';

export function displayPackingPreset(raw:string,arabic:boolean):string{
  const value=(raw||'').trim();
  if(!value)return '';
  const parsed=parsePackingPreset(value);
  if(parsed.custom)return value;
  const choice=PACKING_TYPE_CHOICES.find(item=>item.value===parsed.type);
  const type=choice?(arabic?choice.ar:choice.en):parsed.type;
  if(parsed.count&&parsed.size)return `${parsed.count} × ${parsed.size} / ${type}`;
  if(parsed.count)return `${parsed.count} ${arabic?'قطعة':'PCS'} / ${type}`;
  return type;
}
