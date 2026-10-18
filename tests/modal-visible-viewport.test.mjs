import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

test('modal follows keyboard viewport and clears mobile geometry after rotation',()=>{
  const source=readFileSync('src/components/UI.tsx','utf8')+'\nexport { ModalFrame };';
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const values=new Map();
  let mobile=true;
  const window={innerHeight:800,visualViewport:{height:190,offsetTop:32},matchMedia:()=>({matches:mobile})};
  const exports={};
  runInNewContext(code,{exports,require:()=>({}),React:{Component:class{},createElement:()=>null},window});
  const frame=new exports.ModalFrame();
  frame.backdrop={dataset:{},style:{setProperty:(key,value)=>values.set(key,value),removeProperty:key=>values.delete(key)}};
  frame.syncVisualViewport();
  assert.equal(values.get('height'),'190px');
  assert.equal(values.get('max-height'),'190px');
  assert.equal(values.get('top'),'32px');
  window.visualViewport.height=740;
  window.visualViewport.offsetTop=0;
  frame.syncVisualViewport();
  assert.equal(values.get('height'),'740px');
  window.visualViewport.height=800;
  mobile=false;
  frame.syncVisualViewport();
  for(const key of ['height','min-height','max-height','top','bottom','align-items','padding'])assert.equal(values.has(key),false,key);
  mobile=true;
  window.visualViewport=null;
  frame.syncVisualViewport();
  assert.equal(values.get('height'),'800px');
});

test('tablet keyboard bounds backdrop and dialog while normal desktop geometry restores',()=>{
  const source=readFileSync('src/components/UI.tsx','utf8')+'\nexport { ModalFrame };';
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const values=new Map(),dialogValues=new Map();
  const window={innerHeight:844,visualViewport:{height:360,offsetTop:20},matchMedia:()=>({matches:false})};
  const exports={};runInNewContext(code,{exports,require:()=>({}),React:{Component:class{},createElement:()=>null},window});
  const frame=new exports.ModalFrame();
  const style=map=>({setProperty:(key,value)=>map.set(key,value),removeProperty:key=>map.delete(key)});
  frame.backdrop={dataset:{},style:style(values)};frame.dialog={style:style(dialogValues)};
  frame.syncVisualViewport();
  assert.equal(values.get('height'),'360px');assert.equal(values.get('top'),'20px');
  assert.equal(values.get('align-items'),'center');assert.equal(dialogValues.get('max-height'),'344px');
  assert.equal(values.get('--modal-browser-bottom-reserve'),'0px','actual viewport is not double-reserved');
  window.visualViewport.height=190;frame.syncVisualViewport();assert.equal(frame.backdrop.dataset.viewportCompact,'true');
  window.visualViewport.height=844;window.visualViewport.offsetTop=0;frame.syncVisualViewport();
  assert.equal(values.has('height'),false);assert.equal(dialogValues.size,0);
  assert.equal(frame.backdrop.dataset.viewportCompact,undefined,'dismissal restores normal density');
  window.visualViewport.height=NaN;window.visualViewport.offsetTop=Infinity;frame.syncVisualViewport();
  assert.equal(values.get('--modal-visual-height'),'844px');assert.equal(values.get('--modal-visual-offset-top'),'0px');
  assert.equal(values.has('height'),false,'invalid viewport cannot leave stale keyboard geometry');
});

test('phone dialog is bounded even before the keyboard opens, and shrinks again after viewport changes',()=>{
  const source=readFileSync('src/components/UI.tsx','utf8')+'\nexport { ModalFrame };';
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const backdropValues=new Map(),dialogValues=new Map();
  const window={innerHeight:800,visualViewport:{height:800,offsetTop:0},matchMedia:()=>({matches:true})};
  const exports={};runInNewContext(code,{exports,require:()=>({}),React:{Component:class{},createElement:()=>null},window});
  const frame=new exports.ModalFrame(),style=values=>({setProperty:(key,value)=>values.set(key,value),removeProperty:key=>values.delete(key)});
  frame.backdrop={dataset:{},style:style(backdropValues)};frame.dialog={style:style(dialogValues)};
  frame.syncVisualViewport();
  assert.equal(dialogValues.get('max-height'),'784px','layout vh cannot place the header/footer outside the visible phone viewport');
  window.visualViewport.height=340;window.visualViewport.offsetTop=24;frame.syncVisualViewport();
  assert.equal(dialogValues.get('max-height'),'324px');assert.equal(backdropValues.get('top'),'24px');
  window.visualViewport.height=800;window.visualViewport.offsetTop=0;frame.syncVisualViewport();
  assert.equal(dialogValues.get('max-height'),'784px');assert.equal(backdropValues.get('top'),'0px');
});

test('ordinary and nested confirmation dialogs default to the shared app layer and retain their callbacks',()=>{
  const source=readFileSync('src/components/UI.tsx','utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText;
  const app={name:'app-theme-and-locale-root'},exports={};let queries=0,closes=0;
  const createElement=(type,props,...children)=>({type,props:{...props,children}});
  runInNewContext(code,{exports,require:()=>({t:en=>en}),React:{Component:class{},createElement},ReactDOM:{createPortal:(frame,target)=>({frame,target})},document:{querySelector:selector=>{assert.equal(selector,'#root .app-ui');queries++;return app;}}});
  const onClose=()=>closes++,props={open:true,title:'Edit customer',children:'Fields',onClose};
  const modal=exports.Modal(props);
  assert.equal(modal.target,app);assert.equal(modal.frame.props.onClose,onClose);modal.frame.props.onClose();assert.equal(closes,1);
  const confirmation=exports.ConfirmDialog({open:true,title:'Discard?',message:'QA unsaved form',onCancel:onClose,onConfirm:()=>{}});
  const nested=confirmation.type(confirmation.props);
  assert.equal(nested.target,app);assert.equal(nested.frame.props.onClose,onClose);
  const inline=exports.Modal({...props,portal:false});assert.equal(inline.type,modal.frame.type,'explicit inline opt-out is retained');
  const before=queries;assert.equal(exports.Modal({...props,open:false}),null);assert.equal(queries,before,'closed dialogs do not resolve a portal target');
});
