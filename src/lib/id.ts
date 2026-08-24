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

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function displayDate(iso: string, language: 'en' | 'ar' | 'bilingual'): string {
  if (!iso) return '';
  const locale = language === 'ar' ? 'ar-SA' : 'en-GB';
  try { return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`)); }
  catch { return iso; }
}

export function safeFilename(value: string): string {
  return value.normalize('NFKD').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'Document';
}
