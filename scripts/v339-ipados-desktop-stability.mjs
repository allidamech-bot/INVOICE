import {readFile,writeFile} from 'node:fs/promises';

const editorTargets=[
  'dist/src/components/EditorPageCore.js',
  'dist/src/components/DraftDocumentEditor.js'
];
const compatibilityTargets=[
  'dist/src/app/index.js',
  'dist/document-entry-v302.js'
];

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

console.log('v339 iPadOS Desktop Website runtime, editor timing and live-preview safeguards installed.');
