/** Decorative AI mark. Kept distinct from the official LOUREX brand logo. */
export function AiIdentityMark({compact=false}:{compact?:boolean}):any {
  return <svg className={compact?'lxw-brand-glyph is-compact':'lxw-brand-glyph'} viewBox="0 0 40 40" width="28" height="28" fill="none" aria-hidden="true" focusable="false">
    <path d="M20 3.8 36.2 20 20 36.2 3.8 20 20 3.8Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" opacity=".65"/>
    <path d="M20 11.5 28.5 20 20 28.5 11.5 20 20 11.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M20 11.5V3.8M28.5 20h7.7M20 28.5v7.7M11.5 20H3.8" stroke="currentColor" strokeWidth="1.5" opacity=".58"/>
    <circle className="lxw-brand-orbit" cx="20" cy="3.8" r="2.25" fill="currentColor"/>
    <circle cx="20" cy="20" r="2.2" fill="currentColor"/>
  </svg>;
}
