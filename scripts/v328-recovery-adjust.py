from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def patch(path,old,new,label):
    file=ROOT/path
    text=file.read_text(encoding='utf-8')
    if old not in text: raise SystemExit(f'missing adjust target: {label}')
    if text.count(old)!=1: raise SystemExit(f'ambiguous adjust target {label}: {text.count(old)}')
    file.write_text(text.replace(old,new,1),encoding='utf-8')

# Match the actual centerline of the 44px search action in the mobile topbar.
patch('src/styles/tailadmin-mobile-header-v322.css',
      'top:calc(13px + env(safe-area-inset-top,0px))!important;',
      'top:calc(10px + env(safe-area-inset-top,0px))!important;',
      'AI header centerline')

# The editor screen must be viewport-bounded so editor-scroll can actually scroll.
# Unlike v327, the inner layout stays flex:auto and never uses height:0.
patch('src/styles/tailadmin-utilities-v320.css',
      'width:100%!important;height:100%!important;max-height:100%!important;min-height:0!important;\n    display:flex!important;flex-direction:column!important;overflow:hidden!important;',
      'width:100%!important;height:100dvh!important;max-height:100dvh!important;min-height:0!important;\n    display:flex!important;flex-direction:column!important;overflow:hidden!important;',
      'editor viewport bound')

# Width/height do not apply to an inline span. Make the robot mark a real 40/42px control.
patch('src/styles/tailadmin-ai-finish-v320.css',
      '.app-ui .lourex-advisor-mark{width:42px!important;height:42px!important;min-width:42px!important;',
      '.app-ui .lourex-advisor-mark{display:grid!important;place-items:center!important;width:42px!important;height:42px!important;min-width:42px!important;',
      'advisor mark display')

print('v328 browser-proof adjustments staged')
