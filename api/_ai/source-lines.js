// Check only explicitly labeled codes; plain SKU column headings are not codes.
// This catches omissions in text sources without guessing product identities.
export function includesExplicitSourceCodes(text,items){
  const codes=Array.from(String(text).matchAll(/\bSKU(?:[ \t]*[:#][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9._\/-]*)/gi))
    .filter(match=>/[:#]/.test(match[0])||/[0-9._\/-]/.test(match[1]))
    .map(match=>match[1].toUpperCase());
  const extracted=new Set(items.map(item=>String(item.sku||'').toUpperCase()));
  return codes.every(code=>extracted.has(code));
}

// Only a fully explicit, pipe-separated RFQ is eligible. Unknown headers,
// ambiguous fields and unparsed rows return null so the AI path can review them.
export function explicitQuoteSource(text,normalizeNumber){
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const draft={customerName:'',customerEmail:'',customerPhone:'',customerConfidence:0,customerNote:'',currency:'',incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',items:[]};
  const currencies=new Set();
  const number=value=>{const normalized=normalizeNumber(value).replace(/,/g,'');return /^\d{1,12}(?:\.\d{1,4})?$/.test(normalized)?normalized:'';};
  for(const line of lines){
    const fields=line.split('|').map(field=>field.trim());
    const code=fields[0]?.match(/^SKU\s*[:#]?\s+([A-Z0-9][A-Z0-9._\/-]*)$/i);
    if(code){
      let description='',quantity='',unit='',unitPrice='',priceSeen=false;
      for(const field of fields.slice(1)){
        let match;
        if((match=field.match(/^(?:Quantity|Qty|الكمية)\s*:?\s*([0-9٠-٩۰-۹.,٫٬]+)(?:\s+(.+))?$/i))){if(quantity)return null;quantity=number(match[1]);if(!quantity||Number(quantity)<=0)return null;if(match[2]){if(unit)return null;unit=match[2].trim();}}
        else if((match=field.match(/^(?:Unit(?!\s+price\b)|الوحدة)\s*:?\s+(.+)$/i))){if(unit)return null;unit=match[1].trim();}
        else if((match=field.match(/^(?:Unit price|Price|سعر الوحدة)\s*:?\s*([0-9٠-٩۰-۹.,٫٬]+)(?:\s+([A-Z]{3}))?$/i))){if(priceSeen)return null;priceSeen=true;unitPrice=number(match[1]);if(!unitPrice)return null;if(match[2])currencies.add(match[2].toUpperCase());}
        else {if(description||!field||field.length>180||/[:=]/.test(field))return null;description=field;}
      }
      if(!description||!quantity||!unit||unit.length>40)return null;
      const arabic=/[\u0600-\u06ff]/.test(description);
      draft.items.push({sku:code[1],descriptionEn:arabic?'':description,descriptionAr:arabic?description:'',quantity,unit,unitPrice,quantityConfidence:1,quantityAmbiguous:false,quantityNote:'Quantity and order unit explicitly stated in the source.',productConfidence:1,productNote:'SKU and description explicitly stated in the source.'});
      if(draft.items.length>80)return null;
      continue;
    }
    if(/^Page\s+\d{1,3}$/i.test(line))continue;
    let match;
    if((match=line.match(/^(?:Quotation request|RFQ)(?:\s*[-—:]\s*currency\s+([A-Z]{3}))?$/i))){if(match[1])currencies.add(match[1].toUpperCase());}
    else if((match=line.match(/^Currency\s*:\s*([A-Z]{3})$/i)))currencies.add(match[1].toUpperCase());
    else if((match=line.match(/^Customer\s*:\s*(.{1,180})$/i))){if(draft.customerName)return null;draft.customerName=match[1];draft.customerConfidence=1;}
    else return null;
  }
  if(!draft.items.length||currencies.size>1)return null;
  draft.currency=[...currencies][0]||'';
  return draft;
}
