const SCALE = 10_000n;
const MONEY_SCALE = 100n;

function pow10(n: number): bigint { let v = 1n; for (let i = 0; i < n; i += 1) v *= 10n; return v; }

function normalizeDecimalSeparators(input: string): string {
  const raw=(input||'').trim().replace(/[\s\u00a0\u202f]/g,'');
  if(!raw)return '';
  const sign=raw.startsWith('-')?'-':'';
  const unsigned=sign?raw.slice(1):raw;
  if(!unsigned)return raw;
  const commaCount=(unsigned.match(/,/g)||[]).length;
  const dotCount=(unsigned.match(/\./g)||[]).length;

  if(commaCount&&dotCount){
    const decimalSeparator=unsigned.lastIndexOf(',')>unsigned.lastIndexOf('.')?',':'.';
    const groupingSeparator=decimalSeparator===','?'.':',';
    const parts=unsigned.split(decimalSeparator);
    if(parts.length!==2)return raw;
    const [wholeRaw='',fraction='']=parts;
    const whole=wholeRaw.split(groupingSeparator).join('');
    if(!/^\d+$/.test(whole)||!/^\d*$/.test(fraction))return raw;
    return `${sign}${whole}.${fraction}`;
  }

  if(commaCount){
    const parts=unsigned.split(',');
    if(parts.some(part=>!/^[0-9]*$/.test(part)))return raw;
    if(commaCount===1){
      const [whole='',fraction='']=parts;
      // A single 3-digit suffix is treated as a thousands group for backwards
      // compatibility (1,234). Other suffix lengths are interpreted as a
      // decimal comma, so common mobile input such as 12,5 means 12.5.
      if(fraction.length===3&&whole.length>0)return `${sign}${whole}${fraction}`;
      return `${sign}${whole}.${fraction}`;
    }
    if(parts[0]&&parts.slice(1).every(part=>part.length===3))return `${sign}${parts.join('')}`;
    return raw;
  }

  return raw;
}

export function normalizeDecimalInput(input:string):string{
  return normalizeDecimalSeparators(input);
}

export function isDecimalInput(input: string): boolean {
  const cleaned = normalizeDecimalSeparators(input);
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return false;
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned);
}

export function decimalToScaled(input: string, decimals = 4): bigint {
  const cleaned = normalizeDecimalSeparators(input || '0') || '0';
  if (!isDecimalInput(cleaned)) return 0n;
  const negative = cleaned.startsWith('-');
  const raw = negative ? cleaned.slice(1) : cleaned;
  const [wholeRaw = '0', fracRaw = ''] = raw.split('.');
  const whole = BigInt(wholeRaw || '0');
  const scale = pow10(decimals);
  const frac = (fracRaw + '0'.repeat(decimals)).slice(0, decimals);
  let result = whole * scale + BigInt(frac || '0');
  if (fracRaw.length > decimals && Number(fracRaw[decimals] ?? '0') >= 5) result += 1n;
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
  const product=q*p;
  const sign=product<0n?-1n:1n;
  const roundedScaled4=(product<0n?-product:product)+SCALE/2n;
  return money2ToString(scaled4ToMoney2((roundedScaled4/SCALE)*sign));
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

export function compareMoneyStrings(left:string,right:string):number{
  const a=decimalToScaled(left,2),b=decimalToScaled(right,2);
  return a===b?0:a>b?1:-1;
}

export function formatMoney(value: string, currency: string): string {
  if (!isDecimalInput(value)) return `0.00 ${currency}`;
  const cents = decimalToScaled(value, 2);
  const fixed = money2ToString(cents);
  const negative = fixed.startsWith('-');
  const raw = negative ? fixed.slice(1) : fixed;
  const [whole = '0', fraction = '00'] = raw.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}.${fraction} ${currency}`;
}
