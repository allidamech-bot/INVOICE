/**
 * Versioned, tax-exclusive arithmetic foundation. This is not yet a full
 * statutory invoice engine: inclusive pricing, prepayments, FX, legal reason
 * validation and signed fiscal artifacts are deliberately outside this module.
 * All monetary outputs are exact decimal strings; no legacy totals are changed.
 */
export type FiscalVatCategory = 'S' | 'Z' | 'E' | 'O';
export interface FiscalVatClass {
  category: FiscalVatCategory;
  rate: string;
  reasonCode?: string;
}
export interface FiscalTaxLine extends FiscalVatClass {
  id: string;
  quantity: string;
  unitNetPrice: string;
  allowance?: string;
}
export interface FiscalTaxAdjustment extends FiscalVatClass {
  kind: 'allowance' | 'charge';
  amount: string;
}
export interface FiscalTaxInput {
  lines: readonly FiscalTaxLine[];
  adjustments?: readonly FiscalTaxAdjustment[];
}
const VERSION = 'tax-exclusive-v1' as const;
function exact(value: string, scale: number): bigint {
  if (typeof value !== 'string' || value.length > 26
    || !/^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]+)?$/.test(value)) throw new Error('Invalid canonical decimal.');
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > scale) throw new Error('Unsupported decimal precision.');
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale,'0') || '0');
}
function rounded(value: bigint, divisor: bigint): bigint {
  if (value < 0n) throw new Error('Negative amount is not supported.');
  return (value + divisor / 2n) / divisor;
}
function money(cents: bigint): string {
  if (cents < 0n) throw new Error('Negative taxable base.');
  return String(cents / 100n) + '.' + String(cents % 100n).padStart(2,'0');
}
function classification(value: FiscalVatClass) {
  const rate = exact(value.rate, 4);
  if (!['S','Z','E','O'].includes(value.category) || rate > 1_000_000n
    || (value.category === 'S' ? rate === 0n : rate !== 0n)) throw new Error('Invalid VAT classification.');
  const reason = value.reasonCode ?? '';
  if (value.category === 'S' ? reason !== '' : !/^[A-Z0-9-]{1,64}$/.test(reason)) {
    throw new Error('VAT reason is missing or invalid.');
  }
  return {key: value.category + ':' + rate, category: value.category, rate, reason};
}
export function calculateFiscalTax(input: FiscalTaxInput) {
  if (!input || !Array.isArray(input.lines) || !input.lines.length || input.lines.length > 2000
    || (input.adjustments !== undefined && (!Array.isArray(input.adjustments) || input.adjustments.length > 2000))) {
    throw new Error('Invalid fiscal document size.');
  }
  type Group = ReturnType<typeof classification> & {base: bigint};
  const groups = new Map<string,Group>();
  const ids = new Set<string>();
  function groupFor(value: FiscalVatClass): Group {
    const cls = classification(value);
    const previous = groups.get(cls.key);
    if (previous) {
      if (previous.reason !== cls.reason) throw new Error('Conflicting reasons in VAT category.');
      return previous;
    }
    const group = {...cls, base:0n};
    groups.set(cls.key,group);
    return group;
  }
  let lineTotal = 0n, allowances = 0n, charges = 0n;
  const lines = input.lines.map(line => {
    if (!line || typeof line.id !== 'string' || !line.id.trim() || line.id.length > 128 || ids.has(line.id)) {
      throw new Error('Invalid or duplicate line identity.');
    }
    ids.add(line.id);
    const quantity = exact(line.quantity,6), price = exact(line.unitNetPrice,6);
    if (quantity === 0n) throw new Error('Quantity must be positive.');
    const gross = rounded(quantity * price, 10_000_000_000n);
    const allowance = exact(line.allowance ?? '0',2);
    if (allowance > gross) throw new Error('Line allowance exceeds amount.');
    const net = gross - allowance;
    const group = groupFor(line);
    group.base += net;
    lineTotal += net;
    return {id:line.id, category:group.category, net:money(net), vat:money(rounded(net * group.rate,1_000_000n))};
  });
  for (const adjustment of input.adjustments ?? []) {
    if (!adjustment || (adjustment.kind !== 'allowance' && adjustment.kind !== 'charge')) throw new Error('Invalid adjustment.');
    const amount = exact(adjustment.amount,2), group = groupFor(adjustment);
    if (adjustment.kind === 'allowance') {group.base -= amount; allowances += amount;}
    else {group.base += amount; charges += amount;}
  }
  let totalVat = 0n, taxableTotal = 0n;
  const breakdown = [...groups.values()].sort((a,b)=>a.key < b.key ? -1 : a.key > b.key ? 1 : 0).map(group=>{
    const tax = rounded(group.base * group.rate,1_000_000n);
    taxableTotal += group.base; totalVat += tax;
    const fraction = String(group.rate % 10000n).padStart(4,'0').replace(/0+$/,'');
    return {category:group.category,rate:String(group.rate/10000n)+(fraction?'.'+fraction:''),reasonCode:group.reason,
      taxableAmount:money(group.base),vat:money(tax)};
  });
  return {version:VERSION, lines, breakdown, lineNetTotal:money(lineTotal), documentAllowances:money(allowances),
    documentCharges:money(charges), taxExclusiveTotal:money(taxableTotal), vatTotal:money(totalVat),
    taxInclusiveTotal:money(taxableTotal + totalVat)};
}
