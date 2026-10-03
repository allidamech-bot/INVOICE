// Normalize explicit Arabic numeric characters without converting units or prices.
export function normalizeSourceNumber(value){
  return String(value??'').replace(/[٠-٩]/g,char=>String(char.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,char=>String(char.charCodeAt(0)-0x6f0)).replace(/٬/g,'').replace(/٫/g,'.');
}

// Explicit decimal syntax only. A comma must be a complete thousands group,
// never an ambiguous decimal separator silently multiplied by ten/hundred.
export function explicitSourceDecimal(value,maxDigits=12){
  let text=normalizeSourceNumber(String(value??'').replace(/٬/g,',')).trim();
  if(text.includes(',')){if(!/^\d{1,3}(?:,\d{3})+(?:\.\d{1,4})?$/.test(text))return '';text=text.replace(/,/g,'');}
  return new RegExp(`^\\d{1,${maxDigits}}(?:\\.\\d{1,4})?$`).test(text)?text:'';
}
