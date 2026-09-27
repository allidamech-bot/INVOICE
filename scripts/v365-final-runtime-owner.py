from pathlib import Path

OLD_SCROLL='./styles/v331-draft-scroll-recovery.css?v=337-3'
NEW_SCROLL='./styles/v331-draft-scroll-recovery.css?v=365-1'


def read(path):
    return Path(path).read_text()


def write(path,text):
    Path(path).write_text(text)


def replace_once(text,old,new,label):
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{label}: expected exactly one target, found {count}')
    return text.replace(old,new,1)

# 1) Fix the actual runtime-promoted owner. WebKit must see one bounded vertical
# owner; auto-height expands to document height and removes the usable scroll range.
css_path='src/styles/v331-draft-scroll-recovery.css'
css=read(css_path)
old_comment=''' * Important: .ta-main must stretch to whichever grid track the active shell owns,\n * never claim an independent 100dvh. At <=900px v327 hides the AppShell top bar\n * and gives Document Studio the single full-viewport grid row. At wider tablet\n * widths Draft Studio keeps the normal top-bar row and .ta-main occupies row 2.\n * In both cases grid stretch defines the usable height without double-counting\n * browser/header geometry or clipping the true Safari scroll end.\n'''
new_comment=''' * Important: .ta-main must remain explicitly bounded or Safari expands it to the\n * full document height and removes its usable scroll range. At <=900px v327 hides\n * the AppShell top bar, so the commercial editor owner is exactly 100dvh. Draft\n * Studio keeps its fixed command dock clear with a 64px viewport reserve through\n * tablet/iPadOS Desktop Website widths. Descendants remain in normal document flow\n * so there is still exactly one vertical scroll owner.\n'''
css=replace_once(css,old_comment,new_comment,'v331 explanatory comment')
commercial_old='''  html body .app-ui .ta-shell.is-editor>.ta-main,\n  html body .app-ui .ta-shell.screen-editor>.ta-main,\n  html body .app-ui .screen-editor .ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
commercial_new='''  html body .app-ui .ta-shell.is-editor>.ta-main,\n  html body .app-ui .ta-shell.screen-editor>.ta-main,\n  html body .app-ui .screen-editor .ta-main{\n    height:100dvh!important;\n    min-height:0!important;\n    max-height:100dvh!important;'''
css=replace_once(css,commercial_old,commercial_new,'commercial mobile scroll owner')
draft_old='''  html body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
draft_new='''  html body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;'''
css=replace_once(css,draft_old,draft_new,'Draft tablet scroll owner')
ipad_old='''  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:auto!important;\n    min-height:0!important;\n    max-height:none!important;'''
ipad_new='''  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.is-editor:has(.draft-studio)>.ta-main,\n  html[data-lourex-ios-webkit="true"] body .app-ui .ta-shell.screen-editor:has(.draft-studio)>.ta-main{\n    height:calc(100dvh - 64px)!important;\n    min-height:0!important;\n    max-height:calc(100dvh - 64px)!important;'''
css=replace_once(css,ipad_old,ipad_new,'iPad Desktop Website Draft scroll owner')
write(css_path,css)

# 2) Bump every production/runtime source that can promote or precache v331. This
# prevents Safari/PWA from retaining the pre-fix owner under the old query key.
index_path='index.html'
index=read(index_path)
index=replace_once(index,OLD_SCROLL,NEW_SCROLL,'index v331 cache key')
write(index_path,index)

entry_path='public/document-entry-v302.js'
entry=read(entry_path)
entry=replace_once(entry,OLD_SCROLL,NEW_SCROLL,'document-entry v331 fallback')
write(entry_path,entry)

cache_path='scripts/v303-visual-cache-refresh.mjs'
cache=read(cache_path)
cache=replace_once(cache,"const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=337-3';","const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=365-1';",'v303 canonical v331 URL')
legacy_list="const legacyDraftScrollRuntimes=['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2','./styles/v331-draft-scroll-recovery.css?v=337-3'];"
anchor="const criticalDocumentsRuntime='./styles/v332-critical-documents-deep-closeout.css?v=332-1';"
cache=replace_once(cache,anchor,anchor+'\n'+legacy_list+'\nfor(const legacyStyle of legacyDraftScrollRuntimes)sw=sw.replaceAll(legacyStyle,draftScrollRuntime);','v303 SW v331 normalization')
old_html_loop="for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2'])html=html.replaceAll(legacyStyle,draftScrollRuntime);"
cache=replace_once(cache,old_html_loop,"for(const legacyStyle of legacyDraftScrollRuntimes)html=html.replaceAll(legacyStyle,draftScrollRuntime);",'v303 HTML v331 normalization')
old_remove="html=html.replace(/\\s*<link\\b[^>]*href=[\"']\\.\\/styles\\/v331-draft-scroll-recovery\\.css\\?v=337-3[\"'][^>]*\\/>/g,'');"
new_remove="html=html.replace(/\\s*<link\\b[^>]*href=[\"']\\.\\/styles\\/v331-draft-scroll-recovery\\.css\\?v=(?:331-1|336-1|337-2|337-3|365-1)[\"'][^>]*\\/>/g,'');"
cache=replace_once(cache,old_remove,new_remove,'v303 duplicate v331 link cleanup')
old_entry_loop="for(const legacyStyle of ['./styles/v331-draft-scroll-recovery.css?v=331-1','./styles/v331-draft-scroll-recovery.css?v=336-1','./styles/v331-draft-scroll-recovery.css?v=337-2'])entry=entry.replaceAll(legacyStyle,draftScrollRuntime);"
cache=replace_once(cache,old_entry_loop,"for(const legacyStyle of legacyDraftScrollRuntimes)entry=entry.replaceAll(legacyStyle,draftScrollRuntime);",'v303 entry v331 normalization')
cache=cache.replace("/v331-draft-scroll-recovery\\.css\\?v=(?:331-1|336-1|337-2)/.test(entry)","/v331-draft-scroll-recovery\\.css\\?v=(?:331-1|336-1|337-2|337-3)/.test(entry)")
cache=cache.replace('Stale pre-337-3 document scroll fallback survived production build.','Stale pre-v365 document scroll fallback survived production build.')
write(cache_path,cache)

contract_path='scripts/v321-production-runtime-contract.mjs'
contract=read(contract_path)
contract=replace_once(contract,"const recoveryUrl='./styles/v331-draft-scroll-recovery.css?v=337-3';","const recoveryUrl='./styles/v331-draft-scroll-recovery.css?v=365-1';",'v321 canonical v331 URL')
contract=replace_once(contract,"const recoveryTags=[...html.matchAll(/<link\\b[^>]*href=[\"']\\.\\/styles\\/v331-draft-scroll-recovery\\.css\\?v=337-3[\"'][^>]*>/g)];","const recoveryTags=[...html.matchAll(/<link\\b[^>]*href=[\"']\\.\\/styles\\/v331-draft-scroll-recovery\\.css\\?v=365-1[\"'][^>]*>/g)];",'v321 v331 link contract')
contract=contract.replace("/(?:331-1|336-1|337-2)/","/(?:331-1|336-1|337-2|337-3)/")
contract=contract.replace("/(?:331-1|336-1|337-2)/","/(?:331-1|336-1|337-2|337-3)/")
contract=contract.replace("v331-draft-scroll-recovery\\.css\\?v=(?:331-1|336-1|337-2)","v331-draft-scroll-recovery\\.css\\?v=(?:331-1|336-1|337-2|337-3)")
write(contract_path,contract)

finalize_path='scripts/v347-startup-finalize.mjs'
finalize=read(finalize_path)
finalize=replace_once(finalize,"const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=337-3';","const draftScrollRuntime='./styles/v331-draft-scroll-recovery.css?v=365-1';",'v347 canonical v331 URL')
write(finalize_path,finalize)

# 3) Update the historical runtime contract to current production generations and
# to the new Safari scroll-owner contract. Do not weaken any actual behavior check.
test_path='tests/v337-template-layout-site-pass.test.mjs'
test=read(test_path)
old_test='''test('mobile editor scroll owner stays inside the shell grid row instead of claiming a second full viewport',async()=>{\n  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');\n  const commercial=recovery.slice(recovery.indexOf('@media screen and (max-width:900px)'),recovery.indexOf('/* Draft Studio uses'));\n  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));\n  for(const block of [commercial,draft]){\n    assert.match(block,/\\.ta-main[\\s\\S]*height:auto!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*max-height:none!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);\n    assert.doesNotMatch(block,/\\.ta-main[\\s\\S]{0,260}height:100dvh!important/);\n  }\n});'''
new_test='''test('mobile editor scroll owner stays explicitly viewport-bounded so Safari retains a real scroll range',async()=>{\n  const recovery=await read('src/styles/v331-draft-scroll-recovery.css');\n  const commercial=recovery.slice(recovery.indexOf('@media screen and (max-width:900px)'),recovery.indexOf('/* Draft Studio uses'));\n  const draft=recovery.slice(recovery.indexOf('@media screen and (max-width:1180px)'),recovery.indexOf('@media screen and (max-width:720px)'));\n  const ipad=recovery.slice(recovery.indexOf('/* LOUREX v339 — iPadOS Desktop Website landscape closeout.'),recovery.indexOf('/* LOUREX v339 — Product Import Safari visual-viewport closeout.'));\n  assert.match(commercial,/\\.ta-main[\\s\\S]*height:100dvh!important/);\n  assert.match(commercial,/\\.ta-main[\\s\\S]*max-height:100dvh!important/);\n  assert.match(draft,/\\.ta-main[\\s\\S]*height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(draft,/\\.ta-main[\\s\\S]*max-height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(ipad,/\\.ta-main[\\s\\S]*height:calc\\(100dvh - 64px\\)!important/);\n  assert.match(ipad,/\\.ta-main[\\s\\S]*max-height:calc\\(100dvh - 64px\\)!important/);\n  for(const block of [commercial,draft,ipad]){\n    assert.match(block,/\\.ta-main[\\s\\S]*min-height:0!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*align-self:stretch!important/);\n    assert.match(block,/\\.ta-main[\\s\\S]*overflow-y:auto!important/);\n  }\n});'''
test=replace_once(test,old_test,new_test,'v337 mobile owner regression test')
test=test.replace("test('production entry restores the standalone v337 Draft owner after CSS bundling and cache-busts the document runtime'","test('production entry restores the standalone document owner after CSS bundling with current runtime cache keys'")
test=test.replace("/v331-draft-scroll-recovery\\.css\\?v=337-3/","/v331-draft-scroll-recovery\\.css\\?v=365-1/")
test=test.replace("/(?:331-1|336-1|337-2)/","/(?:331-1|336-1|337-2|337-3)/")
test=test.replace("/document-entry-v302\\.js\\?v=337-3/","/document-entry-v302\\.js\\?v=361/")
test=test.replace("/RELEASE_GENERATION=337/","/RELEASE_GENERATION=361/")
test=test.replace("'v331-draft-scroll-recovery.css\\\\?v=337-3'","'v331-draft-scroll-recovery.css\\\\?v=365-1'")
test=test.replace("'document-entry-v302.js\\\\?v=337-3'","'document-entry-v302.js\\\\?v=361'")
test=test.replace("/Stale pre-337-3 document scroll fallback survived production build/","/Stale pre-v365 document scroll fallback survived production build/")
old_runtime_assert="assert.match(cacheRefresh,/runtimeTag=`<link rel=\"stylesheet\" href=\"\\$\\{draftScrollRuntime\\}\" data-lourex-v331-draft-recovery=\"true\" \\/>`/);"
new_runtime_assert="assert.match(cacheRefresh,/draftTag=`<link rel=\"stylesheet\" href=\"\\$\\{draftScrollRuntime\\}\" data-lourex-v331-draft-recovery=\"true\" \\/>`/);\n  assert.match(cacheRefresh,/criticalTag=`<link rel=\"stylesheet\" href=\"\\$\\{criticalDocumentsRuntime\\}\" data-lourex-v332-critical-documents=\"true\" \\/>`/);"
test=replace_once(test,old_runtime_assert,new_runtime_assert,'v337 standalone owner tag assertions')
old_insert_assert="assert.match(cacheRefresh,/html=html\\.replace\\(bundleTag,`\\$\\{bundleTag\\}\\\\n  \\$\\{runtimeTag\\}`\\)/);"
new_insert_assert="assert.match(cacheRefresh,/html=html\\.replace\\(bundleTag,`\\$\\{bundleTag\\}\\\\n  \\$\\{draftTag\\}\\\\n  \\$\\{criticalTag\\}`\\)/);"
test=replace_once(test,old_insert_assert,new_insert_assert,'v337 standalone owner insertion assertion')
write(test_path,test)
