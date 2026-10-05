import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {resolvedAccent,resolvedAppearanceTokens,resolvedArabicFont,resolvedLatinFont} from '../dist/src/lib/appearance.js';

test('renderer appearance boundary survives malformed legacy template and font ids',()=>{
  const appearance={...createBlankDocument('invoice','INV-LEGACY-APPEARANCE',defaultCompany()).appearance};
  Object.assign(appearance,{
    templateId:'removed-template',
    paletteMode:'custom',
    accentColor:'javascript:bad',
    latinFont:'removed-font',
    arabicFont:'removed-font',
    primaryTextColor:'#ffffff',
    secondaryTextColor:'#ffffff',
    headingTextColor:'#ffffff',
    documentTitleScale:'999px',
    sectionHeadingScale:'huge',
    bodyTextScale:'tiny',
    tableTextScale:'giant'
  });

  const tokens=resolvedAppearanceTokens(appearance);
  assert.equal(resolvedAccent(appearance),'#bd9659');
  assert.equal(tokens.page,'#ffffff');
  assert.equal(tokens.primary,'#17212b');
  assert.equal(tokens.secondary,'#4d5b68');
  assert.equal(tokens.titleScale,1);
  assert.equal(tokens.headingScale,.7);
  assert.equal(tokens.bodyScale,8.2/9.2);
  assert.equal(tokens.tableScale,7.25/9.1);
  assert.match(resolvedLatinFont(appearance),/^Inter,/);
  assert.match(resolvedArabicFont(appearance),/^Cairo,/);
});

test('valid legacy appearance still resolves its authored template identity',()=>{
  const appearance={...createBlankDocument('invoice','INV-LEGACY-VALID',defaultCompany()).appearance,templateId:'obsidian',paletteMode:'auto',latinFont:'auto',arabicFont:'auto'};
  const tokens=resolvedAppearanceTokens(appearance);
  assert.equal(tokens.page,'#15191c');
  assert.equal(tokens.primary,'#f5f1e9');
  assert.match(resolvedLatinFont(appearance),/^Montserrat,/);
  assert.match(resolvedArabicFont(appearance),/^"Noto Kufi Arabic"/);
});
