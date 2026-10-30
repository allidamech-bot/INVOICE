import {explicitSourceDecimal} from './numbers.js';
// Check only explicitly labeled codes; plain SKU column headings are not codes.
// This catches omissions in text sources without guessing product identities.
export function includesExplicitSourceCodes(text,items){
  const codes=Array.from(String(text).matchAll(/\bSKU(?:[ \t]*[:#][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9._\/-]*)/gi))
    .filter(match=>/[:#]/.test(match[0])||/[0-9._\/-]/.test(match[1]))
    .map(match=>match[1].toUpperCase());
  const extracted=new Map();for(const item of items){const code=String(item.sku||'').toUpperCase();extracted.set(code,(extracted.get(code)||0)+1);}
  if(!codes.every(code=>extracted.has(code)))return false;
  // Repeated mentions are not necessarily repeated order rows. Count only
  // distinct explicit quantity rows, so two requested lines cannot collapse.
  const required=new Map();let tableHeader=null;
  for(const line of String(text).split(/\r?\n/)){
    const fields=line.split('|').map(field=>field.trim());
    const header=quoteTableHeader(fields);if(header){tableHeader=header;continue;}
    if(tableHeader&&fields.length===tableHeader.length){const code=fields[tableHeader.indexOf('sku')];if(/^[A-Z0-9][A-Z0-9._\/-]*$/i.test(code)){const key=code.toUpperCase();required.set(key,(required.get(key)||0)+1);continue;}}
    if(!/(?:\b(?:quantity|qty)\b|الكمية)\s*:?\s*[0-9٠-٩۰-۹]/i.test(line))continue;
    const match=line.match(/^\s*SKU(?:[ \t]*[:#][ \t]*|[ \t]+)([A-Z0-9][A-Z0-9._\/-]*)/i);
    if(match){const code=match[1].toUpperCase();required.set(code,(required.get(code)||0)+1);}
  }
  return [...required].every(([code,count])=>(extracted.get(code)||0)>=count);
}

function quoteTableHeader(fields){
  const aliases={sku:'sku','item code':'sku','رمز الصنف':'sku',description:'description','product description':'description','الوصف':'description',quantity:'quantity',qty:'quantity','الكمية':'quantity',unit:'unit','الوحدة':'unit','unit price':'unitPrice',price:'unitPrice','سعر الوحدة':'unitPrice',currency:'currency','العملة':'currency'};
  const header=fields.map(field=>aliases[field.normalize('NFKC').toLowerCase()]);
  return fields.length>=4&&header.every(Boolean)&&new Set(header).size===header.length&&['sku','description','quantity','unit'].every(key=>header.includes(key))?header:null;
}

// Only a fully explicit, pipe-separated RFQ is eligible. Unknown headers,
// ambiguous fields and unparsed rows return null so the AI path can review them.
export function explicitQuoteSource(text,normalizeNumber){
  const lines=String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const draft={customerName:'',customerEmail:'',customerPhone:'',customerConfidence:0,customerNote:'',currency:'',incoterm:'',paymentTerms:'',deliveryTime:'',validity:'',remarks:'',notes:'',items:[]};
  const currencies=new Set();let tableHeader=null,declaredCurrency='';
  const number=value=>explicitSourceDecimal(value);
  for(const line of lines){
    const fields=line.split('|').map(field=>field.trim());
    const header=quoteTableHeader(fields);if(header){if(tableHeader)return null;tableHeader=header;continue;}
    if(tableHeader){
      if(fields.length!==tableHeader.length)return null;
      const row=Object.fromEntries(tableHeader.map((key,index)=>[key,fields[index]]));
      const quantity=number(row.quantity),unitPrice=row.unitPrice?number(row.unitPrice):'',description=row.description;
      if(!/^[A-Z0-9][A-Z0-9._\/-]{0,59}$/i.test(row.sku)||!description||description.length>180||!quantity||!/[1-9]/.test(quantity)||!row.unit||row.unit.length>40||row.unitPrice&&!unitPrice)return null;
      if(row.currency){if(!/^[A-Z]{3}$/i.test(row.currency))return null;currencies.add(row.currency.toUpperCase());}
      if(unitPrice&&!row.currency&&!declaredCurrency)return null;
      const arabic=/[\u0600-\u06ff]/.test(description);
      draft.items.push({sku:row.sku,descriptionEn:arabic?'':description,descriptionAr:arabic?description:'',quantity,unit:row.unit,unitPrice,quantityConfidence:1,quantityAmbiguous:false,quantityNote:'Quantity and order unit explicitly stated in the source table.',productConfidence:1,productNote:'SKU and description explicitly stated in the source table.'});
      if(draft.items.length>80)return null;
      continue;
    }
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
    if((match=line.match(/^(?:Quotation request|RFQ)(?:\s*[-—:]\s*currency\s+([A-Z]{3}))?$/i))){if(match[1]){declaredCurrency=match[1].toUpperCase();currencies.add(declaredCurrency);}}
    else if((match=line.match(/^Currency\s*:\s*([A-Z]{3})$/i))){declaredCurrency=match[1].toUpperCase();currencies.add(declaredCurrency);}
    else if((match=line.match(/^Customer\s*:\s*(.{1,180})$/i))){if(draft.customerName)return null;draft.customerName=match[1];draft.customerConfidence=1;}
    else return null;
  }
  if(!draft.items.length||currencies.size>1)return null;
  draft.currency=[...currencies][0]||'';
  return draft;
}


/**
 * Fail closed when a text RFQ explicitly labels SKU + quantity/price facts.
 * A model may not swap prices between rows, collapse two products in one
 * segment or apply a later correction without identifying exactly one SKU.
 * This is evidence validation only; it never creates or saves documents.
 * For images and unlabeled prose, use the existing review/confidence path.
 */
export function validateExplicitQuoteTextEvidence(text,items,currency){
  const original=String(text??'').normalize('NFKC');
  if(!Array.isArray(items))return false;
  const skuPattern=/\bSKU(?:\s*[:#]\s*|\s+)([A-Z0-9][A-Z0-9._/-]{0,59})/gi;
  const qtyPattern=/(?:\b(?:qty|quantity)\b|الكمية)\s*[:=]?\s*([0-9٠-٩۰-۹.,٫٬]+)/iu;
  const pricePattern=/(?:\b(?:unit\s+price|price)\b|سعر\s*الوحدة)\s*[:=]?\s*([0-9٠-٩۰-۹.,٫٬]+)(?:\s+([A-Z]{3})\b)?/iu;
  const normalize=value=>{
    const parsed=explicitSourceDecimal(value,18);
    if(!parsed)return '';
    const [integer,fraction='']=parsed.split('.');
    const whole=integer.replace(/^0+(?=\d)/,'');
    const tail=fraction.replace(/0+$/,'');
    return whole+(tail?'.'+tail:'');
  };
  const canonicalUnit=value=>{
    const raw=String(value??'').normalize('NFKC').trim().toLowerCase().replace(/[.]/g,'');
    const groups=[
      ['CTN','ctn','carton','cartons','كرتون','كرتونة','كراتين'],
      ['PCS','pc','pcs','piece','pieces','قطعة','قطع'],
      ['BOX','box','boxes','علبة','علب'],
      ['KG','kg','kilogram','kilograms','كيلو','كيلوغرام','كغ'],
      ['UNIT','unit','units','وحدة','وحدات']
    ];
    return groups.find(group=>group.slice(1).includes(raw))?.[0]||raw;
  };
  const sourceUnit=(line,match)=>{
    if(!match)return null;
    const tail=line.slice(match.index+match[0].length);
    const named=/^\s*[|;,،؛]?\s*(?:Unit|الوحدة)\s*[:=]\s*([\p{L}]{1,40})/iu.exec(tail);
    const inline=/^\s+([\p{L}]{1,40})(?=\s|$|[|;,،؛])/u.exec(tail);
    const token=named?.[1]||inline?.[1]||'';
    if(!token||/^(?:price|cost|amount|each|per|سعر|التكلفة|المبلغ)$/iu.test(token)||/^[A-Z]{3}$/i.test(token)&&/^(?:USD|EUR|SAR|GBP|AED|TRY)$/i.test(token))return null;
    return canonicalUnit(token);
  };
  const rowFacts=[],corrections=[],currencies=new Set();
  for(const line of original.split(/\r?\n/)){
    const keys=[...line.matchAll(skuPattern)].map(match=>match[1].toUpperCase());
    const correction=/(?:^|[\s:،,;؛-])(?:Correction|Corrected|Updated|Update|Revise|تصحيح|تعديل|المصحح|التصحيح)(?=$|[\s:،,;؛-])/iu.test(line);
    const qtyMatch=qtyPattern.exec(line),priceMatch=pricePattern.exec(line);
    // Competing labeled amounts in one segment are ambiguous, not a choice.
    if([...line.matchAll(new RegExp(qtyPattern.source,'giu'))].length>1||
       [...line.matchAll(new RegExp(pricePattern.source,'giu'))].length>1)return false;
    const qty=qtyMatch?normalize(qtyMatch[1]):null,price=priceMatch?normalize(priceMatch[1]):null;
    const unit=sourceUnit(line,qtyMatch);
    if((qtyMatch&&!qty)||(priceMatch&&!price))return false;
    const explicitCurrency=/(?:\bCurrency\b|العملة)\s*[:=]?\s*([A-Z]{3})\b/iu.exec(line);
    if(explicitCurrency)currencies.add(explicitCurrency[1].toUpperCase());
    if(priceMatch?.[2])currencies.add(priceMatch[2].toUpperCase());
    if(correction){
      if(keys.length!==1||(qty===null&&price===null))return false;
      corrections.push({sku:keys[0],quantity:qty,unitPrice:price,unit});
      continue;
    }
    if(qtyMatch){
      // A line containing multiple SKU identities is not one safe source row.
      if(keys.length!==1)return false;
      rowFacts.push({sku:keys[0],quantity:qty,unitPrice:price,unit});
      if(rowFacts.length>120)return false;
    }
  }
  if(currencies.size>1)return false;
  const sourceCurrency=[...currencies][0]||'';
  if(sourceCurrency&&sourceCurrency!==String(currency??'').trim().toUpperCase())return false;
  if(!rowFacts.length)return corrections.length===0;
  if(rowFacts.length!==items.length)return false;
  const occurrences=new Map();
  for(const row of rowFacts)occurrences.set(row.sku,(occurrences.get(row.sku)||0)+1);
  for(const correction of corrections){
    if(occurrences.get(correction.sku)!==1)return false;
    const target=rowFacts.find(row=>row.sku===correction.sku);
    if(!target)return false;
    if(correction.unit!==null&&correction.unit!==target.unit)return false;
    if(correction.quantity!==null)target.quantity=correction.quantity;
    if(correction.unitPrice!==null)target.unitPrice=correction.unitPrice;
  }
  if(rowFacts.some(row=>row.unitPrice!==null)&&!sourceCurrency)return false;
  return rowFacts.every((row,index)=>{
    const actual=items[index];
    if(!actual||String(actual.sku??'').trim().toUpperCase()!==row.sku)return false;
    const quantity=normalize(String(actual.quantity??''));
    if(!quantity||quantity!==row.quantity)return false;
    if(canonicalUnit(actual.unit??'')!==(row.unit??''))return false;
    const unitPrice=String(actual.unitPrice??'').trim();
    return row.unitPrice===null?!unitPrice:normalize(unitPrice)===row.unitPrice;
  });
}
