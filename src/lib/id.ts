export function makeId(prefix: string): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function todayIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function parseIsoParts(iso:string):{year:number;month:number;day:number}|null{
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
  return {year,month,day};
}

export function isIsoDate(iso:string):boolean{return Boolean(parseIsoParts(iso));}

export function normalizeValidityDays(value:number,max=3650):number{
  if(!Number.isFinite(value))return 0;
  return Math.max(0,Math.min(max,Math.trunc(value)));
}

export function addDaysIso(iso: string, days: number): string {
  const parts=parseIsoParts(iso);
  if(!parts)throw new Error('Invalid date.');
  const safeDays=normalizeValidityDays(days);
  const d=new Date(Date.UTC(parts.year,parts.month-1,parts.day+safeDays));
  return d.toISOString().slice(0,10);
}

export function compareIsoDates(left:string,right:string):number{
  if(!isIsoDate(left)||!isIsoDate(right))return 0;
  return left===right?0:left>right?1:-1;
}

export function displayDate(iso: string, language: 'en' | 'ar' | 'bilingual'): string {
  if (!iso) return '';
  const parts=parseIsoParts(iso);
  if(!parts)return iso;
  // ar-SA defaults to the Umm al-Qura calendar in Safari/Intl. Documents are
  // stored as Gregorian ISO dates, so force Gregorian while keeping Arabic
  // month names and digits to avoid silently changing the legal date shown.
  const locale = language === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB';
  try {
    return new Intl.DateTimeFormat(locale, { calendar:'gregory', day: '2-digit', month: 'short', year: 'numeric', timeZone:'UTC' }).format(new Date(Date.UTC(parts.year,parts.month-1,parts.day)));
  }
  catch { return iso; }
}

export function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'Document';
}
