const SCALE = 10_000n;
const MONEY_SCALE = 100n;

function pow10(n: number): bigint { let v = 1n; for (let i = 0; i < n; i += 1) v *= 10n; return v; }

export function decimalToScaled(input: string, decimals = 4): bigint {
  const cleaned = (input || '0').trim().replace(/,/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return 0n;
  const negative = cleaned.startsWith('-');
  const raw = negative ? cleaned.slice(1) : cleaned;
  const [wholeRaw = '0', fracRaw = ''] = raw.split('.');
  const whole = BigInt(wholeRaw || '0');
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
  const result = whole * pow10(decimals) + BigInt(frac || '0');
  return negative ? -result : result;
}

function scaled4ToMoney2(value: bigint): bigint {
  const sign = value < 0n ? -1n : 1n;
  const abs = value < 0n ? -value : value;
  const rounded = (abs + 50n) / 100n;
  return rounded * sign;
}

function money2ToString(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  return `${sign}${abs / MONEY_SCALE}.${(abs % MONEY_SCALE).toString().padStart(2, '0')}`;
}

export function lineTotal(quantity: string, unitPrice: string): string {
  const q = decimalToScaled(quantity);
  const p = decimalToScaled(unitPrice);
  const scaled4 = (q * p + SCALE / 2n) / SCALE;
  return money2ToString(scaled4ToMoney2(scaled4));
}

export interface TotalsInputItem { quantity: string; unitPrice: string }
export interface TotalsInputAdjustments {
  discountEnabled: boolean; discountMode: 'fixed' | 'percent'; discountValue: string;
  shippingEnabled: boolean; shipping: string; otherChargesEnabled: boolean; otherCharges: string;
  taxEnabled: boolean; taxPercent: string;
}
export interface CalculatedTotals { subtotal: string; discount: string; shipping: string; otherCharges: string; tax: string; grandTotal: string }

export function calculateTotals(items: TotalsInputItem[], a: TotalsInputAdjustments): CalculatedTotals {
  let subtotal = 0n;
  for (const item of items) subtotal += decimalToScaled(lineTotal(item.quantity, item.unitPrice), 2);
  let discount = 0n;
  if (a.discountEnabled) {
    if (a.discountMode === 'fixed') discount = decimalToScaled(a.discountValue, 2);
    else {
      const percent4 = decimalToScaled(a.discountValue, 4);
      discount = (subtotal * percent4 + 500_000n) / 1_000_000n;
    }
    if (discount < 0n) discount = 0n;
    if (discount > subtotal) discount = subtotal;
  }
  const shipping = a.shippingEnabled ? decimalToScaled(a.shipping, 2) : 0n;
  const otherCharges = a.otherChargesEnabled ? decimalToScaled(a.otherCharges, 2) : 0n;
  const taxable = subtotal - discount + shipping + otherCharges;
  let tax = 0n;
  if (a.taxEnabled) {
    const percent4 = decimalToScaled(a.taxPercent, 4);
    tax = (taxable * percent4 + 500_000n) / 1_000_000n;
  }
  const grand = taxable + tax;
  return {
    subtotal: money2ToString(subtotal), discount: money2ToString(discount), shipping: money2ToString(shipping),
    otherCharges: money2ToString(otherCharges), tax: money2ToString(tax), grandTotal: money2ToString(grand)
  };
}

export function formatMoney(value: string, currency: string): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  try { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ` ${currency}`; }
  catch { return `${n.toFixed(2)} ${currency}`; }
}
