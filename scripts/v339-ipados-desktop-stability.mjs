import {readFile,writeFile} from 'node:fs/promises';

const editorTargets=[
  'dist/src/components/EditorPageCore.js',
  'dist/src/components/DraftDocumentEditor.js'
];
const compatibilityTargets=[
  'dist/src/app/index.js',
  'dist/document-entry-v302.js'
];
const appTarget='dist/src/app/App.js';
const cssTarget='dist/styles/app.bundle.css';

const legacyIosExpression=/\/iP\(\?:hone\|ad\|od\)\/i\.test\(navigator\.userAgent\s*\|\|\s*''\)/g;
const legacyIosReplacement="(/iP(?:hone|ad|od)/i.test(navigator.userAgent||'')||(String(navigator.platform||'')==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1))";
const desktopPreviewMatch=/window\.matchMedia\('\(min-width:1181px\)'\)\.matches/g;
const previewEventMatch=/event\.matches/g;
const runtimeHelper=`\nfunction __lourexAppleMobileWebKit(){\n  try{\n    if(Boolean(window.__LOUREX_IOS_WEBKIT__))return true;\n    const ua=String(navigator.userAgent||'');\n    const platform=String(navigator.platform||'');\n    const touchPoints=Number(navigator.maxTouchPoints||0);\n    return /iP(?:hone|ad|od)/i.test(ua)||(platform==='MacIntel'&&touchPoints>1);\n  }catch{return false;}\n}\n`;

for(const path of editorTargets){
  let source=await readFile(path,'utf8');

  const iosMatches=source.match(legacyIosExpression)?.length??0;
  if(iosMatches!==1)throw new Error(`v339 expected exactly one legacy iOS detector in ${path}; found ${iosMatches}.`);
  source=source.replace(legacyIosExpression,legacyIosReplacement);

  const initialPreviewMatches=source.match(desktopPreviewMatch)?.length??0;
  if(initialPreviewMatches!==1)throw new Error(`v339 expected exactly one initial desktop-preview media match in ${path}; found ${initialPreviewMatches}.`);
  source=source.replace(desktopPreviewMatch,"(window.matchMedia('(min-width:1181px)').matches&&!__lourexAppleMobileWebKit())");

  const previewEventMatches=source.match(previewEventMatch)?.length??0;
  if(previewEventMatches!==2)throw new Error(`v339 expected exactly two preview event.matches references in ${path}; found ${previewEventMatches}.`);
  source=source.replace(previewEventMatch,'(event.matches&&!__lourexAppleMobileWebKit())');

  if(!source.includes("platform||'')==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1")){
    throw new Error(`v339 desktop-UA iPadOS detector was not installed in ${path}.`);
  }
  if(!source.includes('__lourexAppleMobileWebKit()')){
    throw new Error(`v339 iPadOS desktop-preview guard was not installed in ${path}.`);
  }

  await writeFile(path,source+runtimeHelper);
}

for(const path of compatibilityTargets){
  let source=await readFile(path,'utf8');
  const matches=source.match(legacyIosExpression)?.length??0;
  if(matches!==1)throw new Error(`v339 expected exactly one compatibility iOS detector in ${path}; found ${matches}.`);
  source=source.replace(legacyIosExpression,legacyIosReplacement);
  if(!source.includes("platform||'')==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1")){
    throw new Error(`v339 desktop-UA iPadOS compatibility detector was not installed in ${path}.`);
  }
  await writeFile(path,source);
}

// Existing-document editing and document issuing need an isolated mutable document
// graph, but they do not need a second copy of each multi-megabyte base64 attachment
// string. LOUREX already uses this exact pattern in document duplication/revision:
// deep-clone without attachments, then copy attachment metadata objects while the
// immutable dataUrl strings remain shared. A4 output needs no attachments at all.
{
  let source=await readFile(appTarget,'utf8');
  // TypeScript's emitted JavaScript intentionally preserves formatting spaces.
  // Match semantics rather than one exact whitespace layout so the production
  // hardening remains stable across compiler formatting changes.
  const editorClonePattern=/editorDoc\s*:\s*structuredClone\s*\(\s*doc\s*\)/g;
  const editorMatches=source.match(editorClonePattern)?.length??0;
  if(editorMatches!==1)throw new Error(`v339 expected exactly one existing-document editor deep clone in ${appTarget}; found ${editorMatches}.`);
  source=source.replace(editorClonePattern,'editorDoc:__lourexCloneDocumentWithAttachmentRefs(doc)');

  const requestStartMatch=/requestPrint\s*=\s*async/.exec(source);
  const requestStart=requestStartMatch?.index??-1;
  const requestTail=requestStart<0?'':source.slice(requestStart);
  const requestEndMatch=/afterPrint\s*=/.exec(requestTail);
  const requestEnd=requestStart<0||!requestEndMatch?-1:requestStart+requestEndMatch.index;
  if(requestStart<0||requestEnd<=requestStart)throw new Error('v339 could not isolate App.requestPrint for output memory hardening.');
  let request=source.slice(requestStart,requestEnd);

  const directOutputPattern=/target\s*=\s*structuredClone\s*\(\s*doc\s*\)/g;
  const directOutputMatches=request.match(directOutputPattern)?.length??0;
  if(directOutputMatches!==2)throw new Error(`v339 expected two direct print snapshot clones; found ${directOutputMatches}.`);
  request=request.replace(directOutputPattern,'target=__lourexOutputDocument(doc)');

  const issueClonePattern=/target\s*=\s*\{\s*\.\.\.\s*structuredClone\s*\(\s*doc\s*\)\s*,\s*status\s*:\s*'final'/g;
  const issueCloneMatches=request.match(issueClonePattern)?.length??0;
  if(issueCloneMatches!==1)throw new Error(`v339 expected one issue/save document clone; found ${issueCloneMatches}.`);
  request=request.replace(issueClonePattern,"target={...__lourexCloneDocumentWithAttachmentRefs(doc),status:'final'");

  const savedOutputPattern=/target\s*=\s*structuredClone\s*\(\s*this\.requireVault\(\)\.documents\.find\s*\(\s*saved\s*=>\s*saved\.id\s*===\s*target\.id\s*\)\s*\?\?\s*target\s*\)/g;
  const savedOutputMatches=request.match(savedOutputPattern)?.length??0;
  if(savedOutputMatches!==1)throw new Error(`v339 expected one post-issue print snapshot clone; found ${savedOutputMatches}.`);
  request=request.replace(savedOutputPattern,'target=__lourexOutputDocument(this.requireVault().documents.find(saved=>saved.id===target.id)??target)');

  source=source.slice(0,requestStart)+request+source.slice(requestEnd);
  const appMemoryHelpers=`\nfunction __lourexCloneDocumentWithAttachmentRefs(doc){\n  const attachments=(doc.attachments??[]).map(attachment=>({...attachment}));\n  return {...structuredClone({...doc,attachments:[]}),attachments};\n}\nfunction __lourexOutputDocument(doc){\n  return {...structuredClone({...doc,attachments:[]}),attachments:[]};\n}\n`;
  source+=appMemoryHelpers;

  if(/editorDoc\s*:\s*structuredClone\s*\(\s*doc\s*\)/.test(source))throw new Error('v339 editor attachment memory hardening did not replace the full-payload deep clone.');
  if(!source.includes('editorDoc:__lourexCloneDocumentWithAttachmentRefs(doc)'))throw new Error('v339 editor attachment payload-sharing clone is missing.');
  if(!source.includes('target=__lourexOutputDocument(doc)'))throw new Error('v339 A4 output attachment stripping is missing.');
  await writeFile(appTarget,source);
}

// Several historical compact layers still land before/inside the final TailAdmin
// bundle and can override the established 44px coarse-pointer target floor. Patch
// only the confirmed current regressions in the generated production cascade.
{
  let css=await readFile(cssTarget,'utf8');
  const favoritePattern=/(\.app-ui\s+\.template-favorite-button\s*\{[^}]*?)width\s*:\s*38px!important;\s*height\s*:\s*38px!important;\s*min-height\s*:\s*38px!important;/g;
  const favoriteMatches=css.match(favoritePattern)?.length??0;
  if(favoriteMatches!==1)throw new Error(`v339 expected one late 38px template favorite override; found ${favoriteMatches}.`);
  css=css.replace(favoritePattern,'$1width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;');

  const advisorPattern=/(\.app-ui\s+\.lourex-advisor-compose\s+form>button\s*\{)width\s*:\s*42px!important;\s*min-width\s*:\s*42px!important;\s*height\s*:\s*42px!important;/g;
  const advisorMatches=css.match(advisorPattern)?.length??0;
  if(advisorMatches!==1)throw new Error(`v339 expected one late 42px advisor send override; found ${advisorMatches}.`);
  css=css.replace(advisorPattern,'$1width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;');

  // iPadOS Desktop Website is wider than the phone breakpoint but is still a
  // coarse-pointer surface. Keep document actions at the same 44px floor there.
  const coarsePointerActions=`\n@media (pointer:coarse),(any-pointer:coarse){\n.app-ui .ta-doc-actions .icon-btn{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important}\n.app-ui .ta-doc-action-popover button[role="menuitem"]{min-height:44px!important}\n}\n`;

  // Safari's visual viewport can be much shorter than the layout viewport while
  // browser chrome is expanded. The import dialog owns its own body scroller, so
  // the outer flex item must be allowed to shrink and anchor to the visible top
  // instead of being vertically centered outside the visual viewport.
  const safariImportViewport=`\n@media screen and (max-width:760px),screen and (max-height:520px){\n.app-ui .modal-backdrop:has(.product-import-shell),.app-ui .modal-backdrop:has(.supplier-import-shell){align-items:flex-start!important;justify-content:center!important;overflow:hidden!important}\n.app-ui .modal:has(.product-import-shell),.app-ui .modal:has(.supplier-import-shell){min-height:0!important;align-self:flex-start!important}\n}\n`;
  css+=coarsePointerActions+safariImportViewport;

  if(/\.app-ui\s+\.template-favorite-button\s*\{[^}]*min-height\s*:\s*38px!important/.test(css))throw new Error('v339 template favorite 38px override remains in production CSS.');
  if(/\.app-ui\s+\.lourex-advisor-compose\s+form>button\s*\{[^}]*width\s*:\s*42px!important/.test(css))throw new Error('v339 advisor send 42px override remains in production CSS.');
  if(!css.includes('.app-ui .ta-doc-action-popover button[role="menuitem"]{min-height:44px!important}'))throw new Error('v339 coarse-pointer document action hardening is missing.');
  if(!css.includes('.app-ui .modal:has(.product-import-shell),.app-ui .modal:has(.supplier-import-shell){min-height:0!important;align-self:flex-start!important}'))throw new Error('v339 Safari import visual-viewport hardening is missing.');
  await writeFile(cssTarget,css);
}

console.log('v339 iPadOS Desktop Website runtime, editor timing, attachment-memory, A4-output, Safari viewport, touch-target and live-preview safeguards installed.');
