import { UNIT_CHOICES } from './product-presets.js';

export function displayUnitPreset(raw:string|undefined|null,arabic:boolean):string{
  const value=String(raw??'').trim();
  if(!value)return '';
  const preset=UNIT_CHOICES.find(choice=>choice.value===value);
  return preset?(arabic?preset.ar:preset.en):value;
}
