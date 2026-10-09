import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('v114 manual save stays in the editor while Back remains the save-and-close path',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/private save=async\(auto=false\)/);
  assert.match(core,/private saveAndClose=async\(\)=>/);
  const closeFlow=core.slice(core.indexOf('private saveAndClose=async()=>'),core.indexOf('private openReview='));
  assert.match(closeFlow,/await this\.props\.onSave\(snapshot,true\)/);
  assert.match(closeFlow,/if\(this\.editRevision!==revisionAtStart\)continue/);
  const retryAt=closeFlow.indexOf('if(this.editRevision!==revisionAtStart)continue');
  const stableCloseAt=closeFlow.lastIndexOf('this.props.onClose()');
  assert.ok(retryAt>=0&&stableCloseAt>retryAt,'Back must only close from the save loop after the latest edit revision is saved');
  assert.doesNotMatch(core,/if\(!auto&&!hasNewerChanges\)\{this\.props\.onClose\(\);return;\}/);
});

test('v114 mobile workflow exposes the correct primary action plus preview PDF and share',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/mobile-editor-actionbar mobile-workflow-\$\{workflow\}/);
  assert.match(core,/readiness\.ready\?<Button icon="check" variant="primary" onClick=\{\(\)=>this\.openReview\('issue'\)\}/);
  assert.match(core,/mobile-action-buttons/);
  assert.match(core,/onClick=\{\(\)=>void this\.output\('pdf'\)\}>PDF/);
  assert.match(core,/onClick=\{\(\)=>void this\.output\('share'\)\}>\{t\('Share','مشاركة'\)\}/);
  assert.match(core,/mobile-preview-overlay[\s\S]*output\('share'\)/);
});

test('v114 carries typed customer search into the quick-create form',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  assert.match(core,/blankCustomer\(this\.state\.customerQuery\)/);
});

test('v114 desktop and mobile navigation preserve current-page semantics and retire manual lock controls',async()=>{
  const [shell,cloudCss]=await Promise.all([read('src/components/AppShell.tsx'),read('src/styles/cloud.css')]);
  assert.match(shell,/private navItem=\(screen:NavTarget,icon:NavIcon,label:string\)=>/);
  assert.match(shell,/aria-current=\{this\.props\.screen===screen\?'page':undefined\}/);
  assert.match(shell,/aria-current=\{this\.props\.screen==='documents'\?'page':undefined\}/);
  assert.match(shell,/aria-current=\{this\.props\.screen==='customers'\?'page':undefined\}/);
  assert.match(shell,/this\.navItem\('home','home'/);
  assert.match(shell,/this\.navItem\('items','items'/);
  assert.match(shell,/this\.navItem\('operations','backup'/);
  assert.match(shell,/this\.navItem\('receivables','invoice'/);
  assert.match(shell,/this\.navItem\('reports','chart'/);
  assert.match(shell,/className="ta-mobile-nav" aria-label=\{t\('Mobile navigation','تنقل الجوال'\)\}/);
  assert.match(cloudCss,/\.auth-cloud-launcher,\.cloud-header-button,\.header-lock-button,[^\{]*\{display:none!important\}/);
});

test('v114 responsive layer keeps four actions usable and does not leak into printed invoices',async()=>{
  const css=await read('src/styles/customer-ux-closeout-v114.css');
  assert.match(css,/\.app-ui \.mobile-action-buttons/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media\(max-width:430px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media print/);
  assert.match(css,/\.app-ui \.mobile-editor-actionbar/);
  assert.doesNotMatch(css,/\.invoice-page|\.items-table|\.doc-header|\.totals-block/);
});

test('v114 customer/editor mobile controls remain in screen-only production cascade and offline shell',async()=>{
  const [index,sw,build,core,css]=await Promise.all([
    read('index.html'),read('public/sw.js'),read('scripts/build.mjs'),
    read('src/components/EditorPageCore.tsx'),read('src/styles/tailadmin-shell-v320.css')
  ]);
  const tailadmin='./styles/tailadmin-shell-v320.css';
  const finalBridge='./styles/tailadmin-reliability-bridge-v320.css';
  assert.ok(index.includes(tailadmin),'the active responsive shell stylesheet is linked');
  assert.ok(index.indexOf(tailadmin)<index.indexOf(finalBridge),'the final reliability owner follows the shell');
  assert.doesNotMatch(index,/href="\.\/styles\/customer-ux-closeout-v114\.css/,'the retired visual owner cannot override the new shell');
  assert.match(build,/const appBundleCss=styleParts\.join/);
  assert.match(build,/await writeFile\('dist\/styles\/app\.bundle\.css',appBundleCss\)/);
  assert.match(build,/sourceStyleNames\.at\(-1\)!=='tailadmin-reliability-bridge-v320\.css'/);
  assert.match(sw,/\.\/index\.html/,'the offline service worker caches the shell entrypoint');
  assert.match(css,/@media screen/);
  assert.match(css,/\.app-ui \.ta-nav-item/);
  assert.match(css,/min-height:44px!important/);
  assert.doesNotMatch(css,/@media print|\.invoice-page\s*\{/,'the active shell does not style printed invoices');
  assert.match(core,/mobile-action-buttons/);
  assert.match(core,/mobile-editor-actionbar/);
});
