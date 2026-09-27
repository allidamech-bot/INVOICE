from pathlib import Path

CSS=Path('src/styles/v365-mobile-editor-scroll-draft-templates.css')
TEST=Path('tests/v365-mobile-editor-scroll-draft-templates.test.mjs')

css=CSS.read_text()
mobile='''    height:100%!important;\n    min-height:0!important;\n    max-height:100%!important;'''
if css.count(mobile)!=3:
    raise SystemExit(f'Expected exactly 3 legacy percentage-height scroll-owner blocks, found {css.count(mobile)}')
css=css.replace(mobile,'''    height:100dvh!important;\n    min-height:0!important;\n    max-height:100dvh!important;''',1)
for _ in range(2):
    css=css.replace(mobile,'''    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;''',1)
CSS.write_text(css)

test=TEST.read_text()
old="assert.match(css,/\\.ta-shell\\.ta-shell\\.is-editor>\\.ta-main,[\\s\\S]*?height:100%!important;[\\s\\S]*?max-height:100%!important;[\\s\\S]*?overflow-y:auto!important;/);"
new="assert.match(css,/\\.ta-shell\\.ta-shell\\.is-editor>\\.ta-main,[\\s\\S]*?height:100dvh!important;[\\s\\S]*?max-height:100dvh!important;[\\s\\S]*?overflow-y:auto!important;/);\n  assert.match(css,/height:calc\\(100dvh - 64px\\)!important;[\\s\\S]*?max-height:calc\\(100dvh - 64px\\)!important;/);"
if test.count(old)!=1:
    raise SystemExit(f'Expected one static scroll-owner assertion, found {test.count(old)}')
TEST.write_text(test.replace(old,new,1))
