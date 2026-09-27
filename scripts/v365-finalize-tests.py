from pathlib import Path

# Update the existing live Draft workflow expectation from the retired 4-design fork
# to the shared 18-template selector introduced by v365.
p=Path('tests/visual/run-v364-core-workflows.cjs')
text=p.read_text()
replacements={
    "const templates=page.locator('.draft-pdf-template-grid>button');":"const templates=page.locator('.draft-pdf-design-section .template-card');",
    "assert.equal(await templates.count(),4,'Draft offers four visual PDF designs');":"assert.equal(await templates.count(),18,'Draft offers the same 18 visual templates as commercial documents');",
    "assert.ok(await templates.first().isVisible(),'PDF designs are visible in the first mobile viewport');":"assert.ok(await templates.first().isVisible(),'Document templates are visible in the mobile editor');",
    "assert.match(classes,/header-minimal/);\n          assert.match(classes,/footer-minimal/);\n          assert.match(classes,/width-wide/);":"assert.match(classes,/template-minimal/);"
}
for old,new in replacements.items():
    if text.count(old)!=1:
        raise SystemExit(f'Expected one v364 test target, got {text.count(old)}: {old[:80]}')
    text=text.replace(old,new,1)
p.write_text(text)

# Make the new Chromium+WebKit scroll-owner test a blocking mobile-current gate.
p=Path('.github/workflows/ci.yml')
text=p.read_text()
old='''            mobile-current)\n              run_qa 180 node tests/visual/run-mobile-final-quote-stack.cjs\n              run_qa 180 node tests/visual/run-mobile-modal-overlap-v176.cjs'''
new='''            mobile-current)\n              run_qa 180 node tests/visual/run-mobile-final-quote-stack.cjs\n              run_qa 180 node tests/visual/run-v365-mobile-editor-scroll.cjs\n              run_qa 180 node tests/visual/run-mobile-modal-overlap-v176.cjs'''
if text.count(old)!=1:
    raise SystemExit(f'Expected one CI mobile-current target, got {text.count(old)}')
p.write_text(text.replace(old,new,1))
