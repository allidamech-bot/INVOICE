from pathlib import Path

CSS=Path('src/styles/v331-draft-scroll-recovery.css')
TEST=Path('tests/v337-template-layout-site-pass.test.mjs')
css=CSS.read_text()

old_comment=''' * Important: .ta-main must stretch to whichever grid track the active shell owns,\n * never claim an independent 100dvh. At <=900px v327 hides the AppShell top bar\n * and gives Document Studio the single full-viewport grid row. At wider tablet\n * widths Draft Studio keeps the normal top-bar row and .ta-main occupies row 2.\n * In both cases grid stretch defines the usable height without double-counting\n * browser/header geometry or clipping the true Safari scroll end.\n'''
new_comment=''' * Important: .ta-main must remain explicitly bounded or Safari expands it to the\n * full document height and removes its usable scroll range. At <=900px v327 hides\n * the AppShell top bar, so the commercial editor owner is exactly 100dvh. Draft\n * Studio keeps its fixed command dock clear with a 64px viewport reserve through\n * tablet/iPadOS Desktop Website widths. Descendants remain in normal document flow\n * so there is still exactly one vertical scroll owner.\n'''
if old_comment not in css:
    raise SystemExit('v331 explanatory comment no longer matches expected source')
css=css.replace(old_comment,new_comment,1)

commercial_old='''  html body .app-ui .ta-shell.is-editor>.ta-main,\n  html body .app-ui .ta-shell.screen-editor>.ta-main,\n  html body .app-ui .screen-editor .ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
commercial_new='''  html body .app-ui .ta-shell.is-editor>.ta-main,\n  html body .app-ui .ta-shell.screen-editor>.ta-main,\n  html body .app-ui .screen-editor .ta-main{\n    height:100dvh!important;\n    min-height:0!important;\n    max-height:100dvh!important;'''
if css.count(commercial_old)!=1:
    raise SystemExit(f'commercial owner target count={css.count(commercial_old)}')
css=css.replace(commercial_old,commercial_new,1)

draft_old='''  html body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
draft_new='''  html body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;'''
if css.count(draft_old)!=1:
    raise SystemExit(f'Draft <=1180 owner target count={css.count(draft_old)}')
css=css.replace(draft_old,draft_new,1)

ipad_old='''  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
ipad_new='''  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;'''
if css.count(ipad_old)!=1:
    raise SystemExit(f'iPad desktop owner target count={css.count(ipad_old)}')
css=css.replace(ipad_old,ipad_new,1)
CSS.write_text(css)

test=TEST.read_text()
old_test='''test('mobile editor scroll owner stays inside the shell grid row instead of claiming a second full viewport',async()=>{\n  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');\n  const commercial=recovery.slice(recovery.indexOf('@media screen and (max-width:900px)'),recovery.indexOf('/* Draft Studio uses'));\n  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));\n  for(const block of [commercial,draft]){\n    assert.match(block,/\\.ta-main[\\s\\S]*height:auto!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*max-height:none!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);\n    assert.doesNotMatch(block,/\\.ta-main[\\s\\S]{0,260}height:100dvh!important/);\n  }\n});'''
new_test='''test('mobile editor scroll owner stays explicitly viewport-bounded so Safari retains a real scroll range',async()=>{\n  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');\n  const commercial=recovery.slice(recovery.indexOf('@media screen and (max-width:900px)'),recovery.indexOf('/* Draft Studio uses'));\n  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));\n  const ipad=recovery.slice(recovery.indexOf('/* LOUREX v339 — iPadOS Desktop Website landscape closeout.'),recovery.indexOf('/* LOUREX v339 — Product Import Safari visual-viewport closeout.'));\n  assert.match(commercial,/\\.ta-main[\\s\\S]*height:100dvh!important/);\n  assert.match(commercial,/\\.ta-main[\\s\\S]*max-height:100dvh!important/);\n  assert.match(draft,/\\.ta-main[\\s\\S]*height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(draft,/\\.ta-main[\\s\\S]*max-height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(ipad,/\\.ta-main[\\s\\S]*height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(ipad,/\\.ta-main[\\s\\S]*max-height:calc\\(100dvh - 64px\\)!important/);\n  for(const block of [commercial,draft,ipad]){\n    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);\n  }\n});'''
if test.count(old_test)!=1:
    raise SystemExit(f'v337 regression test target count={test.count(old_test)}')
TEST.write_text(test.replace(old_test,new_test,1))
