from pathlib import Path
import re


def replace_once(path: str, old: str, new: str, label: str) -> None:
    p = Path(path)
    s = p.read_text()
    if new in s:
        print(label, 'already applied')
        return
    if old not in s:
        raise SystemExit(f'{label}: expected source not found')
    p.write_text(s.replace(old, new, 1))
    print(label, 'applied')


# 1) Create Center: preserve inside pointer events through App's document-level outside-click handler.
replace_once(
    'src/app/App.tsx',
    "if(target instanceof Element&&target.closest('.new-doc-menu'))return;",
    "if(target instanceof Element&&target.closest('.ta-create-menu, .new-doc-menu'))return;",
    'create menu outside-click contract',
)
replace_once(
    'src/components/AppShell.tsx',
    '<div className={`ta-create-menu ${className}`} id={id} role="menu"',
    '<div className={`ta-create-menu new-doc-menu ${className}`} id={id} role="menu"',
    'create menu compatibility class',
)

# 2) Put all editor support content inside the canonical editor scroll owner.
p = Path('src/components/EditorPageCore.tsx')
s = p.read_text()
if 'data-editor-support-slot' not in s:
    pattern = r'</fieldset>\s*</div></aside>\s*<section className="preview-pane">'
    replacement = '</fieldset><div className="ta-editor-support-slot" data-editor-support-slot/></div></aside><section className="preview-pane">'
    s, count = re.subn(pattern, replacement, s, count=1)
    if count != 1:
        raise SystemExit('EditorPageCore support-slot insertion point not found')
    p.write_text(s)
    print('editor support slot applied')
else:
    print('editor support slot already applied')

p = Path('src/components/EditorPage.tsx')
s = p.read_text()
if "querySelector('[data-editor-support-slot]')" not in s:
    anchor = "const navSlot=typeof document==='undefined'?null:document.querySelector('[data-editor-nav-slot]');"
    if anchor not in s:
        raise SystemExit('EditorPage nav slot anchor not found')
    s = s.replace(
        anchor,
        anchor + "\n    const supportSlot=typeof document==='undefined'?null:document.querySelector('[data-editor-support-slot]');",
        1,
    )
if 'const supportPanels=' not in s:
    match = re.search(
        r'      (<div className="ta-editor-support-panels"><DocumentLifecyclePanel[\s\S]*?</div>)\n      \{sectionNavigator',
        s,
    )
    if not match:
        raise SystemExit('EditorPage support panel block not found')
    block = match.group(1).strip()
    s = s[:match.start()] + '      {supportPanels&&supportSlot?ReactDOM.createPortal(supportPanels,supportSlot):null}\n      {sectionNavigator' + s[match.end():]
    declaration_anchor = "    const finalQuoteAction=finalQuote?this.renderQuoteAction(linkedInvoice,sourceIsProformaInvoice):null;"
    if declaration_anchor not in s:
        raise SystemExit('EditorPage support declaration anchor not found')
    s = s.replace(declaration_anchor, declaration_anchor + '\n    const supportPanels=' + block + ';', 1)
p.write_text(s)
print('editor support portal applied')

# 3) Add a real robot glyph; no AI capability or mutation logic changes.
p = Path('src/components/UI.tsx')
s = p.read_text()
if "|'bot'|'star'" not in s:
    if "|'spark'|'star'" not in s:
        raise SystemExit('IconName spark/star anchor not found')
    s = s.replace("|'spark'|'star'", "|'spark'|'bot'|'star'", 1)
if 'bot:<g>' not in s:
    anchor = '  star:<g>'
    bot = '  bot:<g><path d="M9 4h6"/><path d="M12 4V2"/><rect x="4.5" y="6" width="15" height="13" rx="4"/><path d="M4.5 11H2.8v4h1.7M19.5 11h1.7v4h-1.7"/><circle cx="9" cy="12" r="1.15" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.15" fill="currentColor" stroke="none"/><path d="M9 16h6"/></g>,\n'
    if anchor not in s:
        raise SystemExit('Icon path star anchor not found')
    s = s.replace(anchor, bot + anchor, 1)
p.write_text(s)

p = Path('src/components/AiCopilot.tsx')
s = p.read_text()
if '<Icon name="spark"/>' in s:
    count = s.count('<Icon name="spark"/>')
    s = s.replace('<Icon name="spark"/>', '<Icon name="bot"/>')
    print('AI robot glyph replacements', count)
elif '<Icon name="bot"/>' not in s:
    raise SystemExit('AI visual icon anchors not found')
p.write_text(s)

# 4) Mobile Shell may own normal workspaces, never Document Studio.
p = Path('src/styles/tailadmin-mobile-header-v322.css')
s = p.read_text()
editor_guard = r'''

/* v327 — Document Studio owns its own viewport. The normal mobile shell must not
   reserve header/nav geometry inside the editor. */
@media screen and (max-width:900px){
  html body .app-ui .ta-shell.is-editor,
  html[dir="rtl"] body .app-ui .ta-shell.is-editor{
    height:100dvh!important;min-height:100dvh!important;padding:0!important;
    grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(0,1fr)!important;overflow:hidden!important;
  }
  html body .app-ui .ta-shell.is-editor>.ta-topbar,
  html[dir="rtl"] body .app-ui .ta-shell.is-editor>.ta-topbar{display:none!important;}
  html body .app-ui .ta-shell.is-editor>.ta-main,
  html[dir="rtl"] body .app-ui .ta-shell.is-editor>.ta-main{
    grid-column:1!important;grid-row:1!important;height:100dvh!important;min-height:0!important;padding:0!important;overflow:hidden!important;
  }
}
'''
if 'v327 — Document Studio owns its own viewport' not in s:
    s += editor_guard

create_polish = r'''

/* v327 — Create Center: semantic, tactile, and still the same functional actions. */
@media screen and (max-width:900px){
  html body .app-ui .ta-create-menu-mobile{
    padding:12px!important;border-radius:26px!important;
    background:color-mix(in srgb,var(--ft-surface) 96%,#fff 4%)!important;
    box-shadow:0 28px 80px rgba(8,15,28,.34)!important;
  }
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-heading{padding:6px 7px 12px!important;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-heading:before{
    content:"";display:block;width:40px;height:4px;margin:-4px auto 12px;border-radius:999px;background:var(--ft-line-strong);
  }
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid{gap:8px!important;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button{
    --create-accent:var(--ft-accent);min-height:74px!important;padding:10px!important;border-radius:16px!important;
    border-color:color-mix(in srgb,var(--create-accent) 18%,var(--ft-line))!important;
    background:linear-gradient(145deg,color-mix(in srgb,var(--create-accent) 7%,var(--ft-surface-2)),var(--ft-surface-2))!important;
    transition:transform .14s ease,border-color .14s ease,background .14s ease!important;
  }
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:active{transform:scale(.975)!important;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:focus-visible{outline:0!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--create-accent) 18%,transparent)!important;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button>.icon{
    width:20px!important;height:20px!important;padding:7px!important;border-radius:11px!important;
    background:color-mix(in srgb,var(--create-accent) 13%,var(--ft-surface))!important;color:var(--create-accent)!important;
  }
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(1){--create-accent:#7c6cf2;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(2){--create-accent:#25a7c7;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(3){--create-accent:#5b7cfa;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(4){--create-accent:#9b67e8;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(5){--create-accent:#e69a32;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(6){--create-accent:#2ba777;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(7){--create-accent:#3d91d8;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(8){--create-accent:#22a69a;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(9){--create-accent:#d16b79;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid>button:nth-child(10){--create-accent:#66758d;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid strong{font-size:12.5px!important;line-height:18px!important;}
  html body .app-ui .ta-create-menu-mobile .ta-create-menu-grid small{font-size:10px!important;line-height:14px!important;color:var(--ft-muted)!important;}
}
'''
if 'v327 — Create Center' not in s:
    s += create_polish
p.write_text(s)

# 5) Remove TailAdmin's later fixed-action regression; keep one touch scroll owner.
p = Path('src/styles/tailadmin-utilities-v320.css')
s = p.read_text()
old_scroll = '''.app-ui .ta-shell.is-editor .editor-pane .editor-scroll{
    padding:0!important;
    scroll-padding-bottom:0!important;
  }'''
new_scroll = '''.app-ui .ta-shell.is-editor .editor-pane .editor-scroll{
    padding:10px max(10px,env(safe-area-inset-right,0px)) 24px max(10px,env(safe-area-inset-left,0px))!important;
    scroll-padding-top:12px!important;scroll-padding-bottom:24px!important;touch-action:pan-y!important;-webkit-overflow-scrolling:touch!important;
  }'''
if old_scroll in s:
    s = s.replace(old_scroll, new_scroll, 1)
elif new_scroll not in s:
    raise SystemExit('TailAdmin editor-scroll override anchor not found')

action_pattern = r'''  \.app-ui \.mobile-editor-actionbar\{\n    position:fixed!important;[\s\S]*?\n  \}\n  html\[data-ui-theme="dark"\] \.app-ui \.mobile-editor-actionbar\{box-shadow:0 -8px 22px rgba\(0,0,0,\.22\)!important\}'''
action_replacement = '''  .app-ui .mobile-editor-actionbar{
    position:relative!important;inset:auto!important;left:auto!important;right:auto!important;bottom:auto!important;z-index:52!important;
    flex:0 0 auto!important;width:100%!important;min-width:0!important;
    min-height:calc(68px + env(safe-area-inset-bottom,0px))!important;margin:0!important;
    padding:8px max(10px,env(safe-area-inset-right,0px)) max(8px,env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px))!important;
    border:0!important;border-top:1px solid var(--ft-line)!important;border-radius:0!important;
    background:color-mix(in srgb,var(--ft-surface) 97%,transparent)!important;box-shadow:0 -6px 20px rgba(16,24,40,.07)!important;
    backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important;
  }
  html[data-ui-theme="dark"] .app-ui .mobile-editor-actionbar{box-shadow:0 -8px 22px rgba(0,0,0,.22)!important}'''
updated, count = re.subn(action_pattern, action_replacement, s, count=1)
if count == 1:
    s = updated
elif 'position:relative!important;inset:auto!important;left:auto!important' not in s:
    raise SystemExit('Fixed mobile actionbar regression block not found')
p.write_text(s)

# 6) Style support panels as normal scroll content.
p = Path('src/styles/editor-canonical-v314.css')
s = p.read_text()
support_css = r'''

@media screen{
  .app-ui .ta-editor-support-slot{width:100%!important;max-width:1000px!important;margin:0 auto!important;}
  .app-ui .ta-editor-support-panels{display:grid!important;gap:12px!important;width:100%!important;min-width:0!important;padding:0 0 18px!important;}
  .app-ui .ta-editor-support-panels>*{min-width:0!important;margin:0!important;}
}
@media screen and (max-width:900px){
  .app-ui .ta-editor-support-slot{max-width:740px!important;}
  .app-ui .ta-editor-support-panels{gap:10px!important;padding:4px 2px 18px!important;}
  .app-ui .editor-section-navigator{position:relative!important;inset:auto!important;}
}
'''
if '.ta-editor-support-slot{width:100%' not in s:
    s += support_css
p.write_text(s)

# 7) AI robot identity and compact mobile copilot.
p = Path('src/styles/tailadmin-ai-finish-v320.css')
s = p.read_text()
ai_css = r'''

/* v327 — robotic AI identity and compact mobile copilot. */
@media screen{
  .app-ui .lourex-ai-launcher{isolation:isolate!important;overflow:visible!important;border-radius:17px!important;
    background:linear-gradient(145deg,#6d5df5 0%,#4776ef 48%,#24b7c7 100%)!important;
    box-shadow:0 12px 34px rgba(71,118,239,.30)!important;}
  .app-ui .lourex-ai-launcher>.icon{position:relative;z-index:2;width:25px!important;height:25px!important;stroke-width:1.85!important;}
  .app-ui .lourex-ai-launcher:before{content:"";position:absolute;inset:-5px;border:1px solid rgba(91,124,250,.26);border-radius:22px;animation:lourex-ai-orbit 3.2s ease-in-out infinite;}
  .app-ui .lourex-ai-launcher:after{content:"";position:absolute;width:7px;height:7px;right:-3px;top:4px;border-radius:999px;background:#55e4d4;box-shadow:0 0 0 4px rgba(85,228,212,.13),0 0 14px rgba(85,228,212,.8);animation:lourex-ai-pulse 1.8s ease-in-out infinite;}
  .app-ui .lourex-ai-mark{background:linear-gradient(145deg,rgba(109,93,245,.13),rgba(36,183,199,.12))!important;color:#5f72f2!important;}
  .app-ui .lourex-ai-mark>.icon{width:23px!important;height:23px!important;}
  @keyframes lourex-ai-orbit{0%,100%{transform:scale(.96);opacity:.45}50%{transform:scale(1.05);opacity:.9}}
  @keyframes lourex-ai-pulse{0%,100%{transform:scale(.86);opacity:.7}50%{transform:scale(1.16);opacity:1}}
}
@media screen and (max-width:860px){
  .app-ui .lourex-ai-panel,.app-ui .lourex-ai-panel[dir="rtl"]{
    top:auto!important;left:10px!important;right:10px!important;bottom:calc(94px + env(safe-area-inset-bottom,0px))!important;
    width:auto!important;height:min(72dvh,680px)!important;max-height:72dvh!important;border-radius:26px!important;
  }
  .app-ui .lourex-ai-head{min-height:64px!important;padding:11px 13px!important;}
  .app-ui .lourex-ai-context{margin:0 13px 6px!important;}
  .app-ui .lourex-ai-messages{padding:10px 13px 12px!important;}
  .app-ui .lourex-ai-empty{padding:10px 1px 5px!important;}
  .app-ui .lourex-ai-empty strong{font-size:16.5px!important;line-height:23px!important;}
  .app-ui .lourex-ai-compose{padding:9px 11px 10px!important;}
}
@media(prefers-reduced-motion:reduce){
  .app-ui .lourex-ai-launcher:before,.app-ui .lourex-ai-launcher:after{animation:none!important;}
}
'''
if 'v327 — robotic AI identity' not in s:
    s += ai_css
p.write_text(s)

# 8) Documents rail communicates that it is swipeable.
p = Path('src/styles/tailadmin-design-mobile-priority-v323.css')
s = p.read_text()
docs_css = r'''

/* v327 — document type rail explicitly reads as swipeable on touch screens. */
@media screen and (max-width:900px){
  html body .app-ui .ta-doc-type-tabs{
    scroll-snap-type:x proximity!important;overscroll-behavior-inline:contain!important;
    padding-inline:10px 42px!important;
    -webkit-mask-image:linear-gradient(to right,transparent 0,#000 12px,#000 calc(100% - 34px),transparent 100%)!important;
    mask-image:linear-gradient(to right,transparent 0,#000 12px,#000 calc(100% - 34px),transparent 100%)!important;
  }
  html body .app-ui .ta-doc-type-tabs>button{scroll-snap-align:start!important;flex:0 0 auto!important;min-height:44px!important;}
  html body .app-ui .ta-doc-type-tabs>button.is-active,
  html body .app-ui .ta-doc-type-tabs>button[aria-selected="true"]{box-shadow:0 4px 14px color-mix(in srgb,var(--ft-accent) 13%,transparent)!important;}
}
'''
if 'v327 — document type rail' not in s:
    s += docs_css
p.write_text(s)

# 9) Browser fixture models the real pointerdown boundary and all ten Create Center actions.
p = Path('tests/visual/obsidian-shell.html')
s = p.read_text()
if 'credit:0,statement:0' not in s:
    s = s.replace(
        "window.shellQa={settings:0,account:0,newKind:'',navigations:[]};",
        "window.shellQa={settings:0,account:0,newKind:'',credit:0,statement:0,navigations:[]};",
        1,
    )
if 'componentDidMount(){this.outsideCreatePointer=' not in s:
    s = s.replace(
        "    state={newMenu:false,screen:'home'};\n    render(){",
        "    state={newMenu:false,screen:'home'};\n    componentDidMount(){this.outsideCreatePointer=event=>{if(!this.state.newMenu)return;const target=event.target;if(target instanceof Element&&target.closest('.ta-create-menu, .new-doc-menu'))return;this.setState({newMenu:false});};document.addEventListener('pointerdown',this.outsideCreatePointer);}\n    componentWillUnmount(){document.removeEventListener('pointerdown',this.outsideCreatePointer);}\n    render(){",
        1,
    )
old_actions = "onNew:kind=>{window.shellQa.newKind=kind;this.setState({newMenu:false});},onSettings:()=>{window.shellQa.settings+=1;}"
new_actions = "onNew:kind=>{window.shellQa.newKind=kind;this.setState({newMenu:false});},onCreditNote:()=>{window.shellQa.credit+=1;this.setState({newMenu:false});},onStatementAccount:()=>{window.shellQa.statement+=1;this.setState({newMenu:false});},onSettings:()=>{window.shellQa.settings+=1;}"
if old_actions in s:
    s = s.replace(old_actions, new_actions, 1)
elif 'onCreditNote:()=>{window.shellQa.credit+=1' not in s:
    raise SystemExit('obsidian-shell action fixture anchor missing')
p.write_text(s)

print('v327 deterministic source patch complete')
