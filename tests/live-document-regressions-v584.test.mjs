import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('final editor controls use active semantic theme accents and accessible contrast',async()=>{
 const css=await read('src/styles/v485-visible-ui-corrections.css');
 assert.ok(css.includes('v584 live document regression closeout'));
 assert.ok(css.includes('--lrx-editor-accent:var(--ft-accent'),'editor retains an active theme accent source');
 assert.ok(css.includes('--lrx-editor-accent:var(--lx-ui-action,#315fad)'),'approved final editor palette must not be replaced by a different blue');
 assert.ok(css.includes('.advanced-master-toggle'),'advanced settings toggle must remain accessible');
 assert.ok(css.includes('min-height:44px!important'),'mobile editor touch floor');
 assert.ok(css.includes('background:var(--lrx-editor-accent)!important'),'primary action follows semantic accent');
 assert.ok(css.includes('background-image:none!important'),'solid action contrast prevents ambiguous gradient');
});

test('v584 luxury identities are truly dark in renderer tokens and final printable owner',async()=>{
const [appearance,css]=await Promise.all([read('src/lib/appearance.ts'),read('src/styles/document-premium-redesign-v141.css')]);
 assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian','noir','midnight','blackivory','carbon'\]\)/);
 for(const [id,paper] of [['noir','#121212'],['midnight','#071824'],['blackivory','#14130f'],['carbon','#1b1d20']]){
  assert.ok(appearance.includes(id+":'"+paper+"'"),id+' token');
  assert.ok(css.includes('.invoice-page.template-'+id+'{--paper:'+paper),id+' canonical paper');
 }
 assert.match(css,/\.document-tone-dark \.signature-media\{background:transparent/);
});

test('v584 short commercial documents keep totals signature and stamp at the page foot',async()=>{
const [canonical,renderer]=await Promise.all([read('src/styles/document-premium-redesign-v141.css'),read('src/templates/TemplateRenderer.tsx')]);
 assert.match(canonical,/\.final-details\{[^}]*flex:0 0 auto[^}]*margin-top:0;padding-top:7mm/);
 assert.match(canonical,/\.doc-footer\{[^}]*min-height:20mm/);
 assert.match(canonical,/\.signature-media\{[^}]*min-height:22mm/);
 assert.match(renderer,/footer\.getBoundingClientRect\(\)\.top/);
 assert.match(renderer,/this\.setState\(\{pages,ready:false\}/);
});

test('v584 removes review layer before PDF preparation starts',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  const start=core.indexOf('private issueAndContinue=async()=>');
  const end=core.indexOf('private unlockFinal=async()=>',start);
  assert.ok(start>=0&&end>start);
  const flow=core.slice(start,end);
  const closeAt=flow.indexOf('this.setState({reviewMode:null},resolve)');
  const prepareAt=flow.indexOf('__LOUREX_PREPARE_PDF__?.(mode)');
  const printAt=flow.indexOf('await this.props.onPrint(finalDoc,mode)');
  assert.ok(closeAt>=0&&prepareAt>closeAt&&printAt>prepareAt,'review modal must close before preparation and output');
});


test('v584 reopens review on output failure so retry stays available without stacked live layers',async()=>{
  const core=await read('src/components/EditorPageCore.tsx');
  const start=core.indexOf('private issueAndContinue=async()=>');
  const end=core.indexOf('private unlockFinal=async()=>',start);
  const flow=core.slice(start,end);
  assert.match(flow,/await new Promise<void>\(resolve=>this\.setState\(\{reviewMode:null\},resolve\)\)/);
  assert.match(flow,/catch\(e\)\{this\.setState\(\{issuing:false,reviewMode:mode==='issue'\?null:mode/);
});
