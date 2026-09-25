import {readFile,writeFile} from 'node:fs/promises';

const targets=[
  'dist/src/components/EditorPageCore.js',
  'dist/src/components/DraftDocumentEditor.js'
];

const legacyIosExpression=/\/iP\(\?:hone\|ad\|od\)\/i\.test\(navigator\.userAgent\s*\|\|\s*''\)/g;
const replacement="(/iP(?:hone|ad|od)/i.test(navigator.userAgent||'')||(String(navigator.platform||'')==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1))";

for(const path of targets){
  const source=await readFile(path,'utf8');
  const matches=source.match(legacyIosExpression)?.length??0;
  if(matches!==1)throw new Error(`v339 expected exactly one legacy iOS detector in ${path}; found ${matches}.`);
  const patched=source.replace(legacyIosExpression,replacement);
  if(!patched.includes("platform||'')==='MacIntel'&&Number(navigator.maxTouchPoints||0)>1")){
    throw new Error(`v339 desktop-UA iPadOS detector was not installed in ${path}.`);
  }
  await writeFile(path,patched);
}

console.log('v339 iPadOS Desktop Website editor timing safeguards installed.');
