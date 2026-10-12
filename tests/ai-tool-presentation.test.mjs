import test from 'node:test';
import assert from 'node:assert/strict';
import {setUiLanguage,getUiLanguage} from '../dist/src/lib/i18n.js';
import {assistantToolText,assistantToolLanguage} from '../dist/src/lib/ai-tool-presentation.js';

test('tool portals follow assistant UI language while site locale is unchanged',()=>{
  const previous=globalThis.document;
  let aiLanguage='ar';
  globalThis.document={documentElement:{},getElementById:()=>({getAttribute:()=>aiLanguage})};
  try{
    setUiLanguage('en');
    assert.equal(assistantToolText('Product','الصنف'),'الصنف');
    assert.equal(assistantToolLanguage(),'ar');
    assert.equal(getUiLanguage(),'en');
    aiLanguage='en';setUiLanguage('ar');
    assert.equal(assistantToolText('Product','الصنف'),'Product');
    assert.equal(getUiLanguage(),'ar');
  }finally{globalThis.document=previous;setUiLanguage('en');}
});
test('tools used outside an open assistant retain the normal site locale',()=>{
  const previous=globalThis.document;
  globalThis.document={documentElement:{},getElementById:()=>null};
  try{setUiLanguage('ar');assert.equal(assistantToolText('Product','الصنف'),'الصنف');setUiLanguage('en');assert.equal(assistantToolText('Product','الصنف'),'Product');}
  finally{globalThis.document=previous;setUiLanguage('en');}
});
