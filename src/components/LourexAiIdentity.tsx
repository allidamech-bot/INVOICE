/** Shared visual identity only; no assistant state or business behavior. */
export function LourexAiIdentity():any {
  return <svg className="lx-ai-identity" width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path className="lx-ai-identity-frame" d="M16 3 28 10v12L16 29 4 22V10L16 3Z" stroke="currentColor" strokeWidth="1.35"/>
    <path d="m16 8 7 4v8l-7 4-7-4v-8l7-4Z" fill="currentColor" opacity=".13"/>
    <path d="m9 12 7 4 7-4M16 16v8M16 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    <circle className="lx-ai-identity-core" cx="16" cy="16" r="2.2" fill="currentColor"/>
  </svg>;
}
