import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const css=read('src/styles/v485-visible-ui-corrections.css');
const darkBlock=css.slice(css.indexOf(':root{'),css.indexOf('html[data-ui-theme="light"]'));
const lightBlock=css.slice(css.indexOf('html[data-ui-theme="light"]'),css.indexOf('/* Canvas'));
const hexes=block=>Object.fromEntries(Array.from(block.matchAll(/(--[\w-]+):(#[\da-f]{6});/gi),m=>[m[1],m[2]]));
const palettes={dark:hexes(darkBlock),light:{...hexes(darkBlock),...hexes(lightBlock)}};
const luminance=hex=>{const values=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
const contrast=(left,right)=>{const a=luminance(left),b=luminance(right);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
test('workspace metadata consumes the existing type scale without resizing approved text or document paper',()=>{
  assert.match(css,/--lx-ui-type-caption:12px/);assert.match(css,/--lx-ui-type-body:14px/);
  for(const selector of ['ta-doc-row-party strong','ta-doc-row-amount'])assert.ok(css.includes('.'+selector+'{'+(selector.includes('amount')?'grid-area:amount!important;':'')+'font-size:var(--lx-ui-type-body)'));
  for(const selector of ['lx-notification-summary-copy span','ta-kpi-copy>small','ta-doc-row-party small'])assert.ok(css.includes('.'+selector+'{font-size:var(--lx-ui-type-caption)'));
});
for(const mode of ['light','dark'])test(mode+' semantic text has 4.5:1 token contrast on each solid workspace surface',()=>{
  const p=palettes[mode];
  for(const ink of ['text','text-2','muted','faint'])for(const surface of ['canvas','canvas-2','surface','surface-2','surface-3','elevated']){
    const value=contrast(p['--lx485-'+ink],p['--lx485-'+surface]);
    assert.ok(value>=4.5,`${mode} ${ink}/${surface}: ${value.toFixed(3)}`);
  }
});
test('primary labels meet 4.5:1 at both semantic gradient stops and editor shares the action token',()=>{
  for(const p of Object.values(palettes))for(const bg of [p['--lx485-blue-strong'],p['--lx-ui-action-hover']])assert.ok(contrast('#ffffff',bg)>=4.5);
  assert.match(css,/background:linear-gradient\(135deg,var\(--lx-ui-action\),var\(--lx-ui-action-hover\)\)/);
  for(const owner of [css,read('scripts/v485-bundle-visible-ui.mjs')])assert.match(owner,/--lrx-editor-accent:var\(--lx-ui-action,#315fad\)/);
});
function boot(preference,systemDark=false,blocked=false){
  let observerCallback,domCallback,loading=true,disconnected=false;
  const root={dataset:{},style:{setProperty(name,value){this[name]=value;},removeProperty(name){delete this[name];}}};
  const meta={setAttribute(name,value){this[name]=value;}};
  const mount={querySelector:()=>loading?{}:null};
  const document={documentElement:root,querySelector:selector=>selector.includes('theme-color')?meta:loading?{}:null,getElementById:()=>mount,addEventListener:(_event,callback)=>{domCallback=callback;}};
  const localStorage={getItem:()=>{if(blocked)throw Error('blocked');return preference;},setItem:()=>{}};
  const matchMedia=()=>({matches:systemDark});
  const context={document,localStorage,matchMedia,MutationObserver:class{constructor(callback){observerCallback=callback;}observe(){}disconnect(){disconnected=true;}}};
  vm.runInNewContext(read('public/theme-bootstrap-v347.js'),context);
  const window={localStorage,matchMedia,dispatchEvent:()=>{}};
  const module={...context,window,exports:{},CustomEvent:class{}};
  vm.runInNewContext(ts.transpileModule(read('src/lib/ui-theme.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);
  return {root,meta,theme:module.exports,start:()=>domCallback(),settle:()=>{loading=false;observerCallback();},notify:()=>observerCallback(),disconnected:()=>disconnected};
}
for(const [saved,systemDark,expected] of [['dark',false,'dark'],['light',true,'light'],['system',true,'dark'],['system',false,'light']])test('actual boot and runtime keep '+saved+'/'+systemDark+' on the visible '+expected+' canvas',()=>{
  const fixture=boot(saved,systemDark),canvas=palettes[expected]['--lx485-canvas'];
  assert.equal(fixture.root.style.backgroundColor,canvas);assert.equal(fixture.meta.content,canvas);
  fixture.theme.applyUiTheme(saved);fixture.start();fixture.notify();assert.equal(fixture.root.dataset.lourexBooting,'true');
  fixture.settle();assert.equal(fixture.root.style.backgroundColor,canvas);assert.equal(fixture.root.style.colorScheme,expected);assert.equal(fixture.meta.content,canvas);assert.equal(fixture.disconnected(),true);
});
test('boot observer does not restore stale dark preference after a light switch during authentication',()=>{
  const f=boot('dark');f.start();f.theme.applyUiTheme('light');f.settle();
  assert.equal(f.root.dataset.uiTheme,'light');assert.equal(f.root.style.colorScheme,'light');assert.equal(f.meta.content,palettes.light['--lx485-canvas']);assert.equal(f.root.style.backgroundColor,palettes.light['--lx485-canvas']);
});
test('blocked preference storage preserves system theme without throwing or stale boot color',()=>{
  const f=boot(null,true,true);assert.equal(f.theme.getUiThemePreference(),'system');f.theme.applyUiTheme('light',true);f.start();f.settle();assert.equal(f.root.style.backgroundColor,palettes.light['--lx485-canvas']);
});
test('production artifact contracts keep canvas, Arabic font assets and canonical PDF parent',()=>{
  const output=read('dist/styles/app.bundle.css');
  for(const canvas of [palettes.dark['--lx485-canvas'],palettes.light['--lx485-canvas']]){
    for(const path of ['dist/index.html','dist/theme-bootstrap-v347.js','dist/src/lib/ui-theme.js','dist/document-entry-v302.js','dist/home-final-closeout-v286.js'])assert.ok(read(path).includes(canvas),path+' canvas drift');
  }
  for(const weight of ['Regular','Medium','Bold','ExtraBold'])assert.ok(readFileSync(new URL('../dist/fonts/Tajawal-'+weight+'.ttf',import.meta.url)).length>1000);
  assert.ok(output.includes('--lx485-muted:#526780'));assert.ok(output.includes('--lx-ui-action-hover:#244d91'));
  assert.ok(read('dist/ios-print-bridge.js').includes("stage.className = 'lourex-ios-pdf-stage invoice-pages'"));
});
// Execute the actual bridge's async PDF construction with synthetic, already
// paginated source pages. This checks snapshot/order/parent, not browser layout.
function pdfHarness(language){
  class Element{
    constructor(name){this.name=name;this.children=[];this.style={setProperty(){}};this.attrs={};this.parentElement=null;}
    appendChild(node){this.children.push(node);node.parentElement=this;}
    setAttribute(name,value){this.attrs[name]=value;}
    querySelectorAll(selector){return selector==='.invoice-page'?this.children.filter(n=>n.name==='page'):[];}
    cloneNode(){const clone=new Element(this.name);clone.textContent=this.textContent;clone.attrs={...this.attrs};return clone;}
    remove(){this.removed=true;}
  }
  const body=new Element('body'),pages=Array.from({length:3},(_,index)=>{const page=new Element('page');page.attrs.lang=language;page.textContent=`${language} item ${index*15+1} total 225.00 footer ${index+1} / 3`;return page;});
  const captured=[],context={pendingPdfFile:null,pendingPdfPromise:null,ensurePdfLibraries:async()=>{},document:{body,title:'Synthetic audit',querySelectorAll:()=>pages,createElement:()=>new Element('stage')},requestAnimationFrame:fn=>fn(),waitForCloneAssets:async()=>{},sanitizeUnsupportedColors:()=>{},stabilizeDocumentDirection:()=>{},collectSharpMedia:()=>[],addSharpMedia:async()=>{},safeFilename:s=>s,File,Date,window:{devicePixelRatio:1.5,jspdf:{jsPDF:class{addPage(){}addImage(){}output(){return new Blob(['synthetic'],{type:'application/pdf'});}}},html2canvas:async page=>{captured.push(page);return {toDataURL:()=>'',width:1,height:1};}}};
  const source=read('public/ios-print-bridge.js'),ast=ts.createSourceFile('bridge.js',source,ts.ScriptTarget.Latest,true);
  let declaration;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='buildPdfFile')declaration=node.getText(ast);ts.forEachChild(node,visit);};visit(ast);assert.ok(declaration);
  vm.runInNewContext('const '+declaration+';globalThis.runPdf=buildPdfFile;',context);
  return {context,pages,captured,body};
}
for(const language of ['en','ar','bilingual'])test('actual PDF bridge preserves '+language+' page order, canonical parent and source snapshot',async()=>{
  const f=pdfHarness(language),before=f.pages.map(p=>p.textContent),file=await f.context.runPdf();
  assert.equal(file.type,'application/pdf');assert.equal(f.captured.length,3);
  assert.deepEqual(f.captured.map(p=>p.textContent),before);assert.deepEqual(f.pages.map(p=>p.textContent),before);
  const stage=f.body.children[0];assert.equal(stage.className,'lourex-ios-pdf-stage invoice-pages');assert.equal(stage.removed,true);
  assert.ok(f.captured.every(p=>p.parentElement===stage));assert.equal(stage.children.indexOf(f.captured[0]),0);
  assert.equal(await f.context.runPdf(),file,'existing single-flight/cache remains authoritative');
});
