from pathlib import Path

p=Path('src/styles/tailadmin-utilities-v320.css')
s=p.read_text()
marker='v327 — hard mobile editor viewport chain'
css=r'''

/* v327 — hard mobile editor viewport chain.
   Legacy mobile styles may allow the document tree to grow with content; the
   Document Studio instead owns exactly one viewport and one vertical scroller. */
@media screen and (max-width:900px){
  .app-ui .ta-shell.is-editor .editor-screen{
    width:100%!important;
    height:100dvh!important;
    max-height:100dvh!important;
    min-height:0!important;
    display:flex!important;
    flex-direction:column!important;
    overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-screen>.editor-layout{
    flex:1 1 0!important;
    width:100%!important;
    height:0!important;
    max-height:none!important;
    min-height:0!important;
    display:block!important;
    overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-layout>.editor-pane{
    width:100%!important;
    height:100%!important;
    max-height:100%!important;
    min-height:0!important;
    overflow:hidden!important;
  }
  .app-ui .ta-shell.is-editor .editor-pane>.editor-scroll{
    width:100%!important;
    height:100%!important;
    max-height:100%!important;
    min-height:0!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;
    touch-action:pan-y!important;
    overscroll-behavior-x:none!important;
    overscroll-behavior-y:contain!important;
    -webkit-overflow-scrolling:touch!important;
  }
}
'''
if marker not in s:
    p.write_text(s+css)
    print('hard editor viewport chain applied')
else:
    print('hard editor viewport chain already applied')
