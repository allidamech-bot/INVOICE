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
  const editorClonePattern=/editorDoc:structuredClone\(doc\)/g;
  const editorMatches=source.match(editorClonePattern)?.length??0;
  if(editorMatches!==1)throw new Error(`v339 expected exactly one existing-document editor deep clone in ${appTarget}; found ${editorMatches}.`);
  source=source.replace(editorClonePattern,'editorDoc:__lourexCloneDocumentWithAttachmentRefs(doc)');

  const requestStart=source.indexOf('requestPrint=async');
  const requestEnd=requestStart<0?-1:source.indexOf('afterPrint=',requestStart);
  if(requestStart<0||requestEnd<=requestStart)throw new Error('v339 could not isolate App.requestPrint for output memory hardening.');
  let request=source.slice(requestStart,requestEnd);

  const directOutputPattern=/target=structuredClone\(doc\)/g;
  const directOutputMatches=request.match(directOutputPattern)?.length??0;
  if(directOutputMatches!==2)throw new Error(`v339 expected two direct print snapshot clones; found ${directOutputMatches}.`);
  request=request.replace(directOutputPattern,'target=__lourexOutputDocument(doc)');

  const issueClonePattern=/target=\{\.\.\.structuredClone\(doc\),status:'final'/g;
  const issueCloneMatches=request.match(issueClonePattern)?.length??0;
  if(issueCloneMatches!==1)throw new Error(`v339 expected one issue/save document clone; found ${issueCloneMatches}.`);
  request=request.replace(issueClonePattern,"target={...__lourexCloneDocumentWithAttachmentRefs(doc),status:'final'");

  const savedOutputPattern=/target=structuredClone\(this\.requireVault\(\)\.documents\.find\(saved=>saved\.id===target\.id\)\?\?target\)/g;
  const savedOutputMatches=request.match(savedOutputPattern)?.length??0;
  if(savedOutputMatches!==1)throw new Error(`v339 expected one post-issue print snapshot clone; found ${savedOutputMatches}.`);
  request=request.replace(savedOutputPattern,'target=__lourexOutputDocument(this.requireVault().documents.find(saved=>saved.id===target.id)??target)');

  source=source.slice(0,requestStart)+request+source.slice(requestEnd);
  const appMemoryHelpers=`\nfunction __lourexCloneDocumentWithAttachmentRefs(doc){\n  const attachments=(doc.attachments??[]).map(attachment=>({...attachment}));\n  return {...structuredClone({...doc,attachments:[]}),attachments};\n}\nfunction __lourexOutputDocument(doc){\n  return {...structuredClone({...doc,attachments:[]}),attachments:[]};\n}\n`;
  source+=appMemoryHelpers;

  if(source.includes('editorDoc:structuredClone(doc)'))throw new Error('v339 editor attachment memory hardening did not replace the full-payload deep clone.');
  if(!source.includes('editorDoc:__lourexCloneDocumentWithAttachmentRefs(doc)'))throw new Error('v339 editor attachment payload-sharing clone is missing.');
  if(!source.includes('target=__lourexOutputDocument(doc)'))throw new Error('v339 A4 output attachment stripping is missing.');
  await writeFile(appTarget,source);
}

console.log('v339 iPadOS Desktop Website runtime, editor timing, attachment-memory, A4-output and live-preview safeguards installed.');
