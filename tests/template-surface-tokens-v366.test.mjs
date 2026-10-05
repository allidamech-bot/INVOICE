import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {defaultCompany} from '../dist/src/lib/defaults.js';
import {createBlankDocument} from '../dist/src/lib/documents.js';
import {resolvedAppearanceTokens} from '../dist/src/lib/appearance.js';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('appearance engine exposes independent surface and semantic ink tokens',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/surfaceInk:string/);
  assert.match(appearance,/surfaceMuted:string/);
  assert.match(appearance,/darkSurfaceInk:string/);
  assert.match(appearance,/darkSurfaceMuted:string/);
  assert.match(appearance,/heading:string;primary:string;secondary:string/);
  assert.match(appearance,/const surfaceInk='#17212b'/);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
});

test('all current commercial identities resolve their canonical light paper and dark local-surface tokens',()=>{
  const base=createBlankDocument('invoice','INV-TOKEN',defaultCompany()).appearance;
  const papers={executive:'#ffffff',minimal:'#ffffff',trade:'#ffffff',signature:'#fcfaf5',obsidian:'#ffffff',cobalt:'#ffffff',editorial:'#ffffff',split:'#ffffff',prism:'#ffffff',slate:'#ffffff',horizon:'#ffffff',mono:'#ffffff',aurora:'#fdfbf6',ledger:'#ffffff',noir:'#fffdf8',midnight:'#fcfaf4',blackivory:'#fbf6eb',carbon:'#fafafa'};
  for(const [templateId,paper] of Object.entries(papers)){
    const tokens=resolvedAppearanceTokens({...base,templateId});
    assert.equal(tokens.page,paper,`${templateId}: canonical paper`);
    assert.equal(tokens.primary,'#17212b',`${templateId}: body ink`);
    assert.equal(tokens.surface,'#ffffff',`${templateId}: card surface`);
    assert.equal(tokens.darkSurfaceInk,'#fffaf0',`${templateId}: local dark-surface ink`);
  }
});

test('custom text colors pass contrast guards and unsafe choices fall back on every light paper',()=>{
  const base=createBlankDocument('invoice','INV-CONTRAST',defaultCompany()).appearance;
  for(const templateId of ['signature','aurora','noir','midnight','blackivory','carbon']){
    const unsafe=resolvedAppearanceTokens({...base,templateId,paletteMode:'custom',primaryTextColor:'#ffffff',secondaryTextColor:'#fffdf8',headingTextColor:'#ffffff'});
    assert.equal(unsafe.primary,'#17212b',templateId);
    assert.equal(unsafe.secondary,'#4d5b68',templateId);
    assert.notEqual(unsafe.heading,'#ffffff',templateId);
  }
  const safe=resolvedAppearanceTokens({...base,paletteMode:'custom',primaryTextColor:'#101820',secondaryTextColor:'#35424b',headingTextColor:'#22303a'});
  assert.equal(safe.primary,'#101820');
  assert.equal(safe.secondary,'#35424b');
  assert.equal(safe.heading,'#22303a');
});

test('document typography remains bounded rather than free-form pixels',async()=>{
  const appearance=await read('src/lib/appearance.ts');
  assert.match(appearance,/type TextScale='small'\|'normal'\|'large'/);
  assert.match(appearance,/documentTitleScale/);
  assert.match(appearance,/sectionHeadingScale/);
  assert.match(appearance,/bodyTextScale/);
  assert.match(appearance,/tableTextScale/);
  assert.match(appearance,/scaleValue/);
});
