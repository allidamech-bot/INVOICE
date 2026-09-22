from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing patch target: {path}: {old[:90]!r}")
    p.write_text(text.replace(old, new, 1))


# Settings: expose sign out immediately in Settings, not only the Account scope.
p = Path('src/components/SettingsModal.tsx')
text = p.read_text()
anchor = "      <div className={`settings-layout settings-workspace-v2 ${accountScope?'account-profile-workspace':'settings-preferences-workspace'} ${this.state.accountAction==='restore'?'cloud-account-panel':''}`}>"
insert = anchor + "\n        {!accountScope&&account?<div className=\"settings-direct-account-bar\"><div className=\"settings-direct-account-copy\"><span className=\"settings-account-dot connected\"/><span><small>{t('Signed in','تم تسجيل الدخول')}</small><strong dir=\"ltr\">{account.email||'LOUREX'}</strong></span></div><Button className=\"settings-direct-signout-button\" variant=\"secondary\" disabled={this.state.busy} onClick={()=>void this.signOutFromCloud()}>{this.state.accountAction==='signout'?t('Signing out…','جارٍ تسجيل الخروج…'):t('Sign Out','تسجيل الخروج')}</Button></div>:null}"
if anchor not in text:
    raise SystemExit('Settings layout anchor missing')
text = text.replace(anchor, insert, 1)
text = text.replace(
    "Session locking, device PIN and encrypted cloud recovery. Account identity and sign out stay under Account.",
    "Session locking, device PIN and encrypted cloud recovery. Sign out is available directly from Settings.",
)
text = text.replace(
    "قفل الجلسة ورمز PIN والاستعادة السحابية المشفّرة. تبقى هوية الحساب وتسجيل الخروج ضمن الحساب.",
    "قفل الجلسة ورمز PIN والاستعادة السحابية المشفّرة. تسجيل الخروج متاح مباشرة من الإعدادات.",
)
p.write_text(text)

# Document creation: make it single-flight so repeated mobile taps cannot reserve/write twice.
p = Path('src/app/App.tsx')
text = p.read_text()
if 'private documentCreateBusy=false;' not in text:
    field = '  private vaultReplacing=false;'
    if field not in text:
        raise SystemExit('App create guard field anchor missing')
    text = text.replace(field, field + '\n  private documentCreateBusy=false;', 1)
old = "  private newDocument=async(kind:DocumentKind)=>{try{const {doc}=await this.reserveDocument(kind);this.setState({screen:'editor',editorDoc:doc,newMenu:false});}catch(e){this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}};"
new = "  private newDocument=async(kind:DocumentKind)=>{if(this.documentCreateBusy)return;this.documentCreateBusy=true;this.setState({newMenu:false});try{const {doc}=await this.reserveDocument(kind);await new Promise<void>(resolve=>this.setState({screen:'editor',editorDoc:doc,newMenu:false},resolve));}catch(e){this.showToast(e instanceof Error?e.message:t('Unable to create document.','تعذر إنشاء المستند.'),'error');}finally{this.documentCreateBusy=false;}};"
if old not in text:
    raise SystemExit('App newDocument anchor missing')
text = text.replace(old, new, 1)
p.write_text(text)

# Avoid dynamically adding a duplicate Home stylesheet every time the advisor mounts.
p = Path('src/components/LourexAdvisorCard.tsx')
text = p.read_text()
old = '    return <>\n      <link rel="stylesheet" href="./styles/home-review-polish-v285.css"/>\n      <section className="dashboard-panel lourex-advisor-card"'
new = '    return <section className="dashboard-panel lourex-advisor-card"'
if old in text:
    text = text.replace(old, new, 1)
    text = text.replace('      </section>\n    </>;\n', '      </section>;\n', 1)
p.write_text(text)

# Dark first paint / Safari chrome continuity and force fresh v301 visual bytes.
p = Path('index.html')
text = p.read_text()
text = text.replace('<meta name="theme-color" content="#080808" />', '<meta name="theme-color" content="#061820" />\n  <meta name="color-scheme" content="dark light" />', 1)
text = text.replace('#080808', '#061820')
text = text.replace('./styles/visual-features-v300.css?v=300', './styles/visual-features-v300.css?v=301', 1)
p.write_text(text)

# Fresh immutable cache generation so iPhone/Safari cannot keep serving the v284 runtime.
p = Path('public/sw.js')
text = p.read_text()
old_cache = "const CACHE = 'lourex-invoice-v284';"
if old_cache not in text:
    raise SystemExit('service worker cache anchor missing')
text = text.replace(old_cache, "const CACHE = 'lourex-invoice-v301';", 1)
if not text.startswith('// v301 mobile UX closeout'):
    text = '// v301 mobile UX closeout — preview, settings, document-create stability and dark first paint.\n' + text
# Cache the newest last-loaded visual layer explicitly.
needle = "LOCAL_CORE.push('./styles/home-premium-command-center-v283.css');"
if needle in text and "LOCAL_CORE.push('./styles/visual-features-v300.css');" not in text:
    text = text.replace(needle, needle + "\nLOCAL_CORE.push('./styles/visual-features-v300.css');", 1)
p.write_text(text)
