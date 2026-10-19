/** Shared decorative companion: launcher, conversation header and welcome. */
export function AiIdentityMark({compact=false}:{compact?:boolean}):any {
  return <svg className={compact?'lxw-brand-glyph is-compact':'lxw-brand-glyph'} viewBox="0 0 40 40" width="28" height="28" fill="none" aria-hidden="true" focusable="false">
    <g className="lxw-robot-head">
      <path d="M20 5v4M7 19H4v8h3m26-8h3v8h-3" stroke="#C9AC76" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="20" cy="4" r="2" fill="#E7C58D"/>
      <rect x="7" y="9" width="26" height="25" rx="9" fill="#203C50" stroke="#D3B782" strokeWidth="1.5"/>
      <path d="M12 12h16" stroke="#F5DCA8" strokeOpacity=".45" strokeLinecap="round"/>
      <rect x="10" y="15" width="20" height="14" rx="6" fill="#081B2C" stroke="#648BA3" strokeWidth=".7"/>
      <g className="lxw-robot-gaze"><g className="lxw-robot-eyes">
        <rect x="13" y="18" width="4" height="6" rx="2" fill="#9BDEEF"/>
        <rect x="23" y="18" width="4" height="6" rx="2" fill="#9BDEEF"/>
      </g></g>
      <path d="M17 27h6" stroke="#E7C58D" strokeWidth="1.4" strokeLinecap="round"/>
    </g>
  </svg>;
}
