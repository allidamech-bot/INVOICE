/**
 * Batch 6 ownership closeout: Tax / VAT styles are canonical inputs to
 * app.bundle.css. Keep this hook for component compatibility; it must not add
 * a late runtime stylesheet or create a second cascade owner.
 */
export function ensureTaxVatStyles():void{}
