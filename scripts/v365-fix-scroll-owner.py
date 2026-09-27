from pathlib import Path

# Fix the active, runtime-promoted scroll owner itself. The shell already owns the
# viewport/grid geometry; .ta-main must fill that grid area instead of expanding
# to the editor's full content height.
p=Path('src/styles/v331-draft-scroll-recovery.css')
text=p.read_text()
old="""    height:auto!important;
    min-height:0!important;
    max-height:none!important;
    align-self:stretch!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;"""
new="""    height:100%!important;
    min-height:0!important;
    max-height:100%!important;
    align-self:stretch!important;
    overflow-x:hidden!important;
    overflow-y:auto!important;"""
count=text.count(old)
if count < 2:
    raise SystemExit(f'Expected at least commercial + Draft outer scroll-owner blocks, found {count}')
# Only the first two are the <=900 commercial and <=1180 Draft owner blocks.
text=text.replace(old,new,2)
p.write_text(text)

# The synthetic live fixture must query the active document tree, not the hidden
# sibling fixture when Draft mode is selected.
p=Path('tests/visual/run-v365-mobile-editor-scroll.cjs')
text=p.read_text()
text=text.replace("const end=document.querySelector('[data-scroll-end]');","const end=document.querySelector(kind==='draft'?'#draft [data-scroll-end]':'#commercial [data-scroll-end]');")
if text.count("#draft [data-scroll-end]") != 2:
    raise SystemExit('Expected scoped end sentinel in both before/after measurements')
p.write_text(text)

# Update the pre-v365 regression contract: bounded percentage height is deliberate
# because it follows the shell grid row (including tablet header geometry) rather
# than claiming a second 100dvh viewport.
p=Path('tests/v337-template-layout-site-pass.test.mjs')
text=p.read_text()
old="""  for(const block of [commercial,draft]){
    assert.match(block,/\\.ta-main[\\s\\S]*height:auto!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*max-height:none!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);
    assert.doesNotMatch(block,/\\.ta-main[\\s\\S]{0,260}height:100dvh!important/);
  }"""
new="""  for(const block of [commercial,draft]){
    assert.match(block,/\\.ta-main[\\s\\S]*height:100%!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*max-height:100%!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);
    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);
    assert.doesNotMatch(block,/\\.ta-main[\\s\\S]{0,260}height:(?:auto|100dvh)!important/);
  }"""
if text.count(old)!=1:
    raise SystemExit('v337 scroll-owner contract target changed unexpectedly')
p.write_text(text.replace(old,new,1))
