import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');

test('historical contrast and art-direction layers no longer participate in runtime',async()=>{
  const html=await read('index.html');
  assert.equal(html.indexOf('document-art-direction-v120.css'),-1);
  assert.equal(html.indexOf('document-palette-v121.css'),-1);
  assert.ok(html.indexOf('document-premium-redesign-v141.css')>=0);
});

test('document renderer applies calculated accent ink from appearance tokens',async()=>{
  const renderer=await read('src/templates/TemplateRenderer.tsx');
  const appearance=await read('src/lib/appearance.ts');
  assert.match(renderer,/const tokens=resolvedAppearanceTokens\(/);
  assert.match(renderer,/'--accent':tokens\.accent/);
  assert.match(renderer,/'--accent-ink':tokens\.accentInk/);
  assert.match(appearance,/accent,accentInk:resolvedAccentInk\(accent\)/);
  const {resolvedAppearanceTokens,resolvedAccentInk}=await import('../dist/src/lib/appearance.js');
  for(const templateId of ['aurora','prism','split','executive']){
    const tokens=resolvedAppearanceTokens({templateId,paletteMode:'auto'});
    assert.match(tokens.accent,/^#[0-9a-f]{6}$/i);
    assert.equal(tokens.accentInk,resolvedAccentInk(tokens.accent),'runtime rendering must use the exact computed ink');
    assert.ok(tokens.accentInk==='#ffffff'||tokens.accentInk==='#101010');
  }
});

test('v121 uses calculated accent ink where copy sits directly on accent',async()=>{
  const css=await read('src/styles/document-palette-v121.css');
  assert.match(css,/template-split[\s\S]*var\(--accent-ink\)/);
  assert.match(css,/money-cell\.strong[\s\S]*contrast-ink/);
  assert.match(css,/grand-total[\s\S]*contrast-navy/);
});

test('automatic palettes retain distinct template identities and choose readable ink for custom accents',async()=>{
  const {resolvedAccent,resolvedAppearanceTokens,resolvedAccentInk}=await import('../dist/src/lib/appearance.js');
  const aurora=resolvedAccent({templateId:'aurora',paletteMode:'auto'});
  const prism=resolvedAccent({templateId:'prism',paletteMode:'auto'});
  assert.match(aurora,/^#[0-9a-f]{6}$/i);
  assert.match(prism,/^#[0-9a-f]{6}$/i);
  assert.notEqual(aurora,prism,'distinct document identities must not be collapsed');
  const custom=resolvedAppearanceTokens({templateId:'aurora',paletteMode:'custom',accentColor:'#eeeeee'});
  assert.equal(custom.accent,'#eeeeee','explicit customer palette must remain selectable');
  assert.equal(custom.accentInk,'#101010','light accents require dark lettering');
  const dark=resolvedAppearanceTokens({templateId:'aurora',paletteMode:'custom',accentColor:'#101010'});
  assert.equal(dark.accentInk,'#ffffff','dark accents require white lettering');
  assert.equal(resolvedAccentInk('invalid-color'),'#101010','invalid legacy accents must fail to safe ink');
});

test('aurora masthead is fixed navy and no longer mixes purple into its background',async()=>{
  const css=await read('src/styles/document-palette-v121.css');
  const start=css.indexOf('.template-aurora .header-modern');
  const block=css.slice(start,start+260);
  assert.match(block,/#0a2638/);
  assert.doesNotMatch(block,/6f64ce|6b5bb4/i);
});
