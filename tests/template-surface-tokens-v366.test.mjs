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
  assert.match(appearance,/const surfaceInk=darkBody&&!mixedLightCards\?'#f5f1e9':'#17212b'/);
  assert.match(appearance,/const darkSurfaceInk='#fffaf0'/);
  assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian','noir','midnight','blackivory','carbon'\]\)/);
  assert.match(appearance,/TEMPLATE_LIGHT_SURFACES/);
});

test('effective output papers match the loaded cascade and Obsidian keeps independent light-card tokens',()=>{
  const base=createBlankDocument('invoice','INV-TOKEN',defaultCompany()).appearance;
  const lightPapers={executive:'#ffffff',minimal:'#ffffff',trade:'#ffffff',signature:'#fcfaf5',cobalt:'#ffffff',editorial:'#ffffff',split:'#ffffff',prism:'#ffffff',slate:'#ffffff',horizon:'#ffffff',mono:'#ffffff',aurora:'#fdfbf6',ledger:'#ffffff'};
  for(const [templateId,paper] of Object.entries(lightPapers)){
    const tokens=resolvedAppearanceTokens({...base,templateId});
    assert.equal(tokens.page,paper,`${templateId}: effective paper`);
    assert.equal(tokens.primary,'#17212b',`${templateId}: Auto body ink`);
    assert.equal(tokens.secondary,'#4d5b68',`${templateId}: Auto label ink`);
    assert.notEqual(tokens.heading,'#ffffff',`${templateId}: Auto heading cannot become inverse ink on a light sheet`);
    assert.equal(tokens.surface,'#ffffff',`${templateId}: local light surface`);
    assert.equal(tokens.darkSurfaceInk,'#fffaf0',`${templateId}: local dark-surface ink`);
  }
  const darkPapers={noir:'#121212',midnight:'#071824',blackivory:'#14130f',carbon:'#1b1d20'};
  for(const [templateId,paper] of Object.entries(darkPapers)){
    const tokens=resolvedAppearanceTokens({...base,templateId});
    assert.equal(tokens.page,paper,`${templateId}: dark paper`);
    assert.equal(tokens.primary,'#f5f1e9',`${templateId}: dark primary ink`);
    assert.equal(tokens.secondary,'#aeb5ba',`${templateId}: dark secondary ink`);
    assert.equal(tokens.surfaceInk,'#f5f1e9',`${templateId}: dark local surface ink`);
  }
  const obsidian=resolvedAppearanceTokens({...base,templateId:'obsidian'});
  assert.equal(obsidian.page,'#15191c');
  assert.equal(obsidian.primary,'#f5f1e9');
  assert.equal(obsidian.secondary,'#aeb5ba');
  assert.equal(obsidian.heading,'#b68d4e');
  assert.equal(obsidian.surface,'#f1f2f2');
  assert.equal(obsidian.surfaceInk,'#17212b');
  assert.equal(obsidian.darkSurface,'#15191c');
});

test('custom text colors pass every actual semantic surface, not merely the page paper',()=>{
  const base=createBlankDocument('invoice','INV-CONTRAST',defaultCompany()).appearance;
  for(const templateId of ['signature','aurora']){
    const unsafe=resolvedAppearanceTokens({...base,templateId,paletteMode:'custom',primaryTextColor:'#ffffff',secondaryTextColor:'#fffdf8',headingTextColor:'#ffffff'});
    assert.equal(unsafe.primary,'#17212b',templateId);
    assert.equal(unsafe.secondary,'#4d5b68',templateId);
    assert.notEqual(unsafe.heading,'#ffffff',templateId);
  }
  for(const templateId of ['noir','midnight','blackivory','carbon']){
    const unsafe=resolvedAppearanceTokens({...base,templateId,paletteMode:'custom',primaryTextColor:'#111111',secondaryTextColor:'#222222',headingTextColor:'#111111'});
    assert.equal(unsafe.primary,'#f5f1e9',templateId);
    assert.equal(unsafe.secondary,'#aeb5ba',templateId);
    assert.notEqual(unsafe.heading,'#111111',templateId);
  }

  const safe=resolvedAppearanceTokens({...base,paletteMode:'custom',primaryTextColor:'#101820',secondaryTextColor:'#35424b',headingTextColor:'#22303a'});
  assert.equal(safe.primary,'#101820');
  assert.equal(safe.secondary,'#35424b');
  assert.equal(safe.heading,'#22303a');

  // #767676 barely clears 4.5:1 on white, but fails on Carbon's #eceeef
  // alternating rows. It must therefore fall back instead of becoming a hidden
  // low-contrast regression on every second item row.
  const softUnsafe=resolvedAppearanceTokens({...base,templateId:'carbon',paletteMode:'custom',primaryTextColor:'#767676',secondaryTextColor:'#767676',headingTextColor:'#767676'});
  assert.equal(softUnsafe.primary,'#f5f1e9');
  assert.equal(softUnsafe.secondary,'#aeb5ba');
  assert.notEqual(softUnsafe.heading,'#767676');

  const obsidianUnsafe=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'custom',primaryTextColor:'#101010',secondaryTextColor:'#222222',headingTextColor:'#111111'});
  assert.equal(obsidianUnsafe.primary,'#f5f1e9');
  assert.equal(obsidianUnsafe.secondary,'#aeb5ba');
  assert.notEqual(obsidianUnsafe.heading,'#111111');

  // #818181 clears 4.5:1 against Obsidian's #15191c paper but fails on its
  // effective #20262a soft rows/sections. The guard must validate both surfaces.
  const obsidianSoftUnsafe=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'custom',primaryTextColor:'#818181',secondaryTextColor:'#818181',headingTextColor:'#818181'});
  assert.equal(obsidianSoftUnsafe.primary,'#f5f1e9');
  assert.equal(obsidianSoftUnsafe.secondary,'#aeb5ba');
  assert.notEqual(obsidianSoftUnsafe.heading,'#818181');

  const obsidianSafe=resolvedAppearanceTokens({...base,templateId:'obsidian',paletteMode:'custom',primaryTextColor:'#ffffff',secondaryTextColor:'#d7d0c4'});
  assert.equal(obsidianSafe.primary,'#ffffff');
  assert.equal(obsidianSafe.secondary,'#d7d0c4');
});

test('Normal typography maps to the effective shipped sizes while Small and Large stay bounded',()=>{
  const base=createBlankDocument('invoice','INV-TYPE',defaultCompany()).appearance;
  const normal=resolvedAppearanceTokens({...base,textScale:'normal',documentTitleScale:'normal',sectionHeadingScale:'normal',bodyTextScale:'normal',tableTextScale:'normal'});
  assert.equal(normal.titleScale,1);
  assert.ok(Math.abs(10*normal.headingScale-7.8)<1e-9);
  assert.ok(Math.abs(9.2*normal.bodyScale-9.2)<1e-9);
  assert.ok(Math.abs(9.1*normal.tableScale-8.2)<1e-9);

  const small=resolvedAppearanceTokens({...base,documentTitleScale:'small',sectionHeadingScale:'small',bodyTextScale:'small',tableTextScale:'small'});
  const large=resolvedAppearanceTokens({...base,documentTitleScale:'large',sectionHeadingScale:'large',bodyTextScale:'large',tableTextScale:'large'});
  assert.ok(small.titleScale<normal.titleScale&&normal.titleScale<large.titleScale);
  assert.ok(small.headingScale<normal.headingScale&&normal.headingScale<large.headingScale);
  assert.ok(small.bodyScale<normal.bodyScale&&normal.bodyScale<large.bodyScale);
  assert.ok(small.tableScale<normal.tableScale&&normal.tableScale<large.tableScale);
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
