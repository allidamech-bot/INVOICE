/**
 * Canonical printable commercial fields for AI document proposals.
 * A catalog identifier is not a printable product description, and the
 * commercial unit must be explicit or actually stored on the selected item.
 * Review, working PDF and final guarded save must resolve the same values.
 */
export interface AiCommercialLineCandidate {
  descriptionEn?:string;
  descriptionAr?:string;
  unit?:string;
  unitPrice?:string;
}
export interface AiCommercialCatalogSource extends AiCommercialLineCandidate {
  lastUnitPrice?:string;
  lastCurrency?:string;
}
const field=(value:unknown)=>typeof value==='string'?value.trim():'';
export function resolveAiCommercialLine<T extends AiCommercialLineCandidate>(
  line:T, source:AiCommercialCatalogSource|undefined, currency:string
):T&{descriptionEn:string;descriptionAr:string;unit:string;unitPrice:string}{
  return{
    ...line,
    descriptionEn:field(line.descriptionEn)||field(source?.descriptionEn),
    descriptionAr:field(line.descriptionAr)||field(source?.descriptionAr),
    unit:field(line.unit)||field(source?.unit),
    unitPrice:field(line.unitPrice)||
      (source?.lastCurrency===currency?field(source?.lastUnitPrice):'')
  };
}
export function printableAiCommercialLine(line:AiCommercialLineCandidate):boolean{
  return Boolean(field(line.descriptionEn)||field(line.descriptionAr))&&Boolean(field(line.unit));
}
