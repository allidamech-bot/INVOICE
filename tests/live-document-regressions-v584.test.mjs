import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('v584 editor final owner follows the application theme instead of fixed blue',async()=>{
  const css=await read('src/styles/v485-visible-ui-corrections.css');
  assert.match(css,/v584 live document regression closeout/);
  assert.match(css,/--lrx-editor-accent:var\(--ft-accent,var\(--boot-accent,#315DA8\)\)/);
  assert.match(css,/\.advanced-master-toggle\{[\s\S]*background:var\(--ft-surface-2\)!important;[\s\S]*border:1px solid var\(--ft-line-strong\)!important/);
  assert.match(css,/\.btn-primary\{[\s\S]*background:var\(--lrx-editor-accent\)!important;[\s\S]*background-image:none!important/);
});

test('v584 luxury identities are truly dark in renderer tokens and final printable owner',async()=>{
  const [appearance,css]=await Promise.all([
    read('src/lib/appearance.ts'),
    read('src/styles/v485-visible-ui-corrections.css')
  ]);
  assert.match(appearance,/DARK_BODY_TEMPLATES=new Set<TemplateId>\(\['obsidian','noir','midnight','blackivory','carbon'\]\)/);
  for(const [id,paper] of [['noir','#121212'],['midnight','#071824'],['blackivory','#14130f'],['carbon','#1b1d20']]){
    assert.ok(appearance.includes(`${id}:'${paper}'`),`${id} paper token`);
    assert.ok(css.includes(`.invoice-page.template-${id}{`),`${id} final template owner`);
    assert.ok(css.includes(`--paper:${paper}`),`${id} final paper`);
    assert.ok(css.includes(`.template-preview-${id}`),`${id} chooser preview`);
  }
});

test('v584 short commercial documents keep totals signature and stamp at the page foot',async()=>{
  const owner=await read('scripts/v544-pdf-a4-output-emergency.mjs');
  assert.match(owner,/\.final-details\{margin-top:auto!important;padding-top:2\.4mm;\}/);
  assert.doesNotMatch(owner,/\.final-details\{margin-top:8mm!important/);
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
