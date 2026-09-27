from pathlib import Path

CSS=Path('src/styles/v365-mobile-editor-scroll-draft-templates.css')
TEST=Path('tests/v365-mobile-editor-scroll-draft-templates.test.mjs')

css=CSS.read_text()
legacy='''    height:100%!important;\n    min-height:0!important;\n    max-height:100%!important;'''
mobile_fixed='''    height:100dvh!important;\n    min-height:0!important;\n    max-height:100dvh!important;'''
tablet_fixed='''    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;'''

# Idempotent: apply the viewport bounds only if the legacy percentage blocks remain.
if css.count(legacy)==3:
    css=css.replace(legacy,mobile_fixed,1)
    css=css.replace(legacy,tablet_fixed,1)
    css=css.replace(legacy,tablet_fixed,1)
elif css.count(legacy)!=0 or css.count(mobile_fixed)!=1 or css.count(tablet_fixed)!=2:
    raise SystemExit('Unexpected v365 scroll-owner geometry; refusing a broad CSS rewrite')

purpose_marker='/* v365 mobile Draft purpose badge: replace generic Studio text with the actual document purpose. */'
if purpose_marker not in css:
    css += '''\n\n/* v365 mobile Draft purpose badge: replace generic Studio text with the actual document purpose. */\n@media screen and (max-width:760px){\n  html body .app-ui .screen-editor .draft-studio-identity{\n    flex:1 1 auto!important;\n    gap:7px!important;\n    min-width:0!important;\n  }\n  html body .app-ui .screen-editor .draft-studio-identity small{display:none!important;}\n  html body .app-ui .screen-editor .draft-studio-identity>div{\n    flex:0 1 auto!important;\n    min-width:0!important;\n    max-width:92px!important;\n  }\n  html body .app-ui .screen-editor .draft-studio-identity>span{\n    display:inline-flex!important;\n    align-items:center!important;\n    flex:0 1 auto!important;\n    min-width:0!important;\n    max-width:118px!important;\n    overflow:hidden!important;\n    text-overflow:ellipsis!important;\n    white-space:nowrap!important;\n  }\n}\n@media screen and (max-width:390px){\n  html body .app-ui .screen-editor .draft-studio-identity>div{max-width:78px!important;}\n  html body .app-ui .screen-editor .draft-studio-identity>span{max-width:96px!important;}\n}\n'''
CSS.write_text(css)

test=TEST.read_text()
old="assert.match(css,/\\.ta-shell\\.ta-shell\\.is-editor>\\.ta-main,[\\s\\S]*?height:100%!important;[\\s\\S]*?max-height:100%!important;[\\s\\S]*?overflow-y:auto!important;/);"
new="assert.match(css,/\\.ta-shell\\.ta-shell\\.is-editor>\\.ta-main,[\\s\\S]*?height:100dvh!important;[\\s\\S]*?max-height:100dvh!important;[\\s\\S]*?overflow-y:auto!important;/);\n  assert.match(css,/height:calc\\(100dvh - 64px\\)!important;[\\s\\S]*?max-height:calc\\(100dvh - 64px\\)!important;/);"
if old in test:
    test=test.replace(old,new,1)
elif new not in test:
    raise SystemExit('Static scroll-owner assertion is neither legacy nor current')

purpose_assert="  assert.match(css,/draft-studio-identity>span[\\s\\S]*?display:inline-flex!important/);\n"
anchor="  assert.match(css,/bottom:calc\\(8px \\+ env\\(safe-area-inset-bottom,0px\\)\\)!important/);\n"
if purpose_assert not in test:
    if anchor not in test: raise SystemExit('Missing v365 test anchor for Draft purpose visibility')
    test=test.replace(anchor,anchor+purpose_assert,1)
TEST.write_text(test)
