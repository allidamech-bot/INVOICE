import { readFile, writeFile } from 'node:fs/promises';

const sourcePath='src/styles/v485-visible-ui-corrections.css';
const themePath='src/styles/v485-theme-color-closeout.css';
const bundlePath='dist/styles/app.bundle.css';
const standalonePath='dist/styles/v482-mobile-ux-repair.css';
const marker='/* --- v485-visible-ui-corrections.css --- */';
const themeMarker='/* --- v485-theme-color-closeout.css --- */';

const baseCss=(await readFile(sourcePath,'utf8')).trim();
const themeCss=(await readFile(themePath,'utf8')).trim();
if(!baseCss)throw new Error('v485 visible UI: source stylesheet is empty.');
if(!themeCss)throw new Error('v485 visible UI: theme closeout stylesheet is empty.');
if(!baseCss.includes('.ta-doc-type-tabs')||!baseCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'))throw new Error('v485 visible UI: centered mobile document tile grid is missing.');
if(!baseCss.includes('-webkit-mask-image:none!important')||!baseCss.includes('overflow:visible!important'))throw new Error('v485 visible UI: clipped document-tab recovery is missing.');
if(!baseCss.includes('@media screen and (min-width:901px)')||!baseCss.includes('.ta-finance-dashboard'))throw new Error('v485 visible UI: iPad/desktop premium activation is missing.');
if(!baseCss.includes('--lx485-canvas:#0a1826')||!baseCss.includes('--lx485-surface-3:#1d3651'))throw new Error('v485 visible UI: dark hierarchy tokens are missing.');
for(const token of ['--ft-canvas:var(--lx485-canvas)!important','--ft-shell:var(--lx485-canvas-2)!important','--lx485-success:#49b98d','--lx485-warning:#e3ab52','--lx485-danger:#f06d7c'])if(!themeCss.includes(token))throw new Error(`v485 visible UI: theme closeout is missing ${token}.`);
if(/#0d0d0d|#101010|#161616|#191919|#202020|#282828/i.test(themeCss))throw new Error('v485 visible UI: theme closeout must not reintroduce matte-black surface literals.');
if(/\.invoice-page|@media\s+print|@page/.test(themeCss))throw new Error('v485 visible UI: theme closeout must remain screen-only.');
const css=`${baseCss}\n\n${themeMarker}\n${themeCss}`;

for(const path of [bundlePath,standalonePath]){
  let content=await readFile(path,'utf8');
  if(content.includes(marker))throw new Error(`v485 visible UI: duplicate owner marker in ${path}.`);
  content=`${content.trimEnd()}\n\n${marker}\n${css}\n`;
  await writeFile(path,content);
  const emitted=await readFile(path,'utf8');
  const v484Index=emitted.lastIndexOf('/* --- v484-responsive-visual-hierarchy.css --- */');
  const v485Index=emitted.lastIndexOf(marker);
  const themeIndex=emitted.lastIndexOf(themeMarker);
  if(v485Index<0||v485Index<=v484Index)throw new Error(`v485 visible UI: final owner order is invalid in ${path}.`);
  if(themeIndex<=v485Index)throw new Error(`v485 visible UI: theme closeout must finish the canonical v485 owner in ${path}.`);
  if((emitted.match(/\/\* --- v485-visible-ui-corrections\.css --- \*\//g)||[]).length!==1)throw new Error(`v485 visible UI: canonical owner marker must be emitted exactly once in ${path}.`);
}

console.log('LOUREX v485 visible UI owner + canonical theme closeout appended after v484 in bundle + standalone production cascade.');
