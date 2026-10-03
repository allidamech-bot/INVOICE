// Check only explicitly labeled codes; plain SKU column headings are not codes.
// This catches omissions in text sources without guessing product identities.
export function includesExplicitSourceCodes(text,items){
  const codes=Array.from(String(text).matchAll(/\bSKU(?:[ \t]*[:#][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9._\/-]*)/gi))
    .filter(match=>/[:#]/.test(match[0])||/[0-9._\/-]/.test(match[1]))
    .map(match=>match[1].toUpperCase());
  const extracted=new Set(items.map(item=>String(item.sku||'').toUpperCase()));
  return codes.every(code=>extracted.has(code));
}
