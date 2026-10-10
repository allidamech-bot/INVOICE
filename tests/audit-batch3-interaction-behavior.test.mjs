import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function environment(){
  const timers=[],frames=[];let document;
  class Element{
    constructor(tag='div',attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.parentElement=null;this.style={overflow:'',zIndex:'auto',direction:'ltr'};this.disabled=false;this.hidden=false;this.scrolled=0;}
    get isConnected(){return this===document.body||Boolean(this.parentElement?.isConnected);}
    get tabIndex(){return this.attrs.tabindex!==undefined?Number(this.attrs.tabindex):['button','input','a'].includes(this.tag)?0:-1;}
    getClientRects(){return this.isConnected&&!this.closest('[hidden],[inert],[aria-hidden="true"]')?[{}]:[];}
    getAttribute(name){return this.attrs[name]??null;}
    hasAttribute(name){return name==='hidden'?this.hidden:Object.hasOwn(this.attrs,name);}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null;}
    contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
    closest(){for(let node=this;node;node=node.parentElement)if(node.hidden||node.attrs.inert!==undefined||node.attrs['aria-hidden']==='true')return node;return null;}
    focus(){document.activeElement=this;}
    click(){if(!this.disabled)this.onClick?.();}
    scrollIntoView(){this.scrolled++;}
    descendants(){return this.children.flatMap(node=>[node,...node.descendants()]);}
    querySelectorAll(selector){return this.descendants().filter(node=>{
      if(selector.includes('[aria-selected="true"]'))return node.attrs['aria-selected']==='true';
      if(selector.includes('button[role="menuitem"]'))return node.tag==='button'&&node.attrs.role==='menuitem'&&!node.disabled;
      if(selector.includes('button[role="tab"]'))return node.tag==='button'&&node.attrs.role==='tab'&&!node.disabled;
      if(selector.includes('[role="menu"]'))return node.attrs.role==='menu'&&!node.hidden;
      return !node.disabled&&(['button','input','a','textarea','select'].includes(node.tag)||node.attrs.tabindex!==undefined);
    });}
    querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
  }
  class Input extends Element{constructor(){super('input');}}
  document={body:new Element('body'),activeElement:null,querySelectorAll:()=>document.body.descendants().filter(node=>node.attrs.role==='dialog'&&node.attrs['aria-modal']==='true'||node.attrs.role==='menu'&&node.attrs.class==='ta-create-menu'),
    getElementById:id=>document.body.descendants().find(node=>node.attrs.id===id)??null,querySelector:()=>null};
  const window={getComputedStyle:node=>node.style,matchMedia:()=>({matches:false}),setTimeout:fn=>{timers.push(fn);return timers.length;},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;}};
  const context={exports:{},document,window,HTMLElement:Element,HTMLButtonElement:Element,HTMLInputElement:Input,Element,Node:Element,Error,Number};
  const load=path=>{const module={...context,exports:{}};vm.runInNewContext(ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);return module.exports;};
  const overlay=load('src/lib/overlay-focus.ts'),tabs=load('src/lib/tab-navigation.ts');
  const node=(tag,attrs)=>new Element(tag,attrs);
  const dialog=(id,z)=>{const d=node('section',{id,role:'dialog','aria-modal':'true',tabindex:'-1'});d.style.zIndex=String(z);return d;};
  const key=(name,shiftKey=false,currentTarget=null)=>({key:name,shiftKey,currentTarget,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}});
  return {context,document,window,Element,Input,overlay,tabs,node,dialog,key,timers,frames};
}
function methods(path,names,e,globals={}){
  const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const cls=ast.statements.find(node=>ts.isClassDeclaration(node)&&node.members.some(member=>names.includes(member.name?.getText(ast))));
  assert.ok(cls,'actual component class exists');
  const members=cls.members.filter(member=>names.includes(member.name?.getText(ast))).map(member=>member.getText(ast)).join('\n');
  assert.equal(cls.members.filter(member=>names.includes(member.name?.getText(ast))).length,names.length);
  const code=ts.transpileModule('class Harness { '+members+' }\nexports.Harness=Harness;',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  const context={...e.context,...e.overlay,...globals,exports:{}};vm.runInNewContext(code,context);const h=new context.exports.Harness();
  h.setState=(change,callback)=>{h.state={...h.state,...(typeof change==='function'?change(h.state):change)};callback?.();};return h;
}
function searchFixture(){
  const e=environment(),opener=e.node('button'),launcher=e.node('button');e.document.body.append(opener,launcher);opener.focus();
  const panel=e.dialog('search',1220),input=new e.Input(),close=e.node('button'),last=e.node('button');panel.append(input,close,last);
  const h=methods('src/components/GlobalSearch.tsx',['beginOpen','open','close','handleKeyDown'],e);
  h.mounted=true;h.focusRequest=0;h.previousFocus=null;h.panelRef=panel;h.inputRef=input;h.state={open:false,query:'',paymentPicker:false};
  const set=h.setState;h.setState=(change,callback)=>set(change,()=>{if(h.state.open&&!panel.isConnected)e.document.body.append(panel);if(!h.state.open)panel.remove();callback?.();});
  return {e,h,panel,input,close,last,opener,launcher};
}
test('Search Shift+Tab wraps inside the dialog and Escape restores the opener and scroll',()=>{
  const f=searchFixture();f.e.document.body.style.overflow='auto';f.h.open();f.e.timers.shift()();
  assert.equal(f.e.document.activeElement,f.input);const tab=f.e.key('Tab',true);f.h.handleKeyDown(tab);
  assert.equal(tab.defaultPrevented,true);assert.equal(f.e.document.activeElement,f.last);
  const escape=f.e.key('Escape');f.h.handleKeyDown(escape);assert.equal(f.h.state.open,false);
  assert.equal(f.e.document.activeElement,f.opener);assert.equal(f.e.document.body.style.overflow,'auto');
});
test('Search redirects stray programmatic focus and AI cannot open behind it',()=>{
  const f=searchFixture();f.h.open();f.launcher.focus();f.e.overlay.containOverlayFocus(f.panel);assert.equal(f.e.document.activeElement,f.input);
  const ai=methods('src/components/AiCopilot.tsx',['toggle'],f.e);ai.applying=false;ai.state={open:false};ai.cancelRequest=()=>{throw new Error('must not cancel');};ai.toggle();
  assert.equal(ai.state.open,false);f.h.close();
});
test('Search refuses to open over an existing Settings/confirmation dialog',()=>{
  const f=searchFixture(),settings=f.e.dialog('settings',1400);f.e.document.body.append(settings);f.h.open();assert.equal(f.h.state.open,false);
});
test('late Search focus callback cannot steal focus after close',()=>{
  const f=searchFixture();f.h.open();f.h.close();f.e.timers.shift()();assert.equal(f.e.document.activeElement,f.opener);
});
test('Escape with Search above AI closes only Search regardless of lower handler order',()=>{
  const f=searchFixture(),panel=f.e.dialog('lourex-ai-panel',1201);f.e.document.body.append(panel);
  // Reproduce an existing overlap to verify recovery, even though new overlaps are blocked.
  f.h.state.open=true;f.e.document.body.append(f.panel);
  const ai=methods('src/components/AiCopilot.tsx',['panel','onKeyDown','toggle'],f.e);ai.state={open:true};ai.applying=false;let cancels=0;ai.cancelRequest=()=>{cancels++;};
  const escape=f.e.key('Escape');ai.onKeyDown(escape);f.h.handleKeyDown(escape);ai.onKeyDown(escape);
  assert.equal(f.h.state.open,false);assert.equal(ai.state.open,true);assert.equal(cancels,0);
});
test('shared scroll lock survives either close order and repeated cleanup',()=>{
  for(const reverse of [false,true]){
    const e=environment(),one={},two={};e.document.body.style.overflow='scroll';e.overlay.lockOverlayScroll(one);e.overlay.lockOverlayScroll(two);
    e.overlay.unlockOverlayScroll(reverse?two:one);assert.equal(e.document.body.style.overflow,'hidden');
    e.overlay.unlockOverlayScroll(reverse?one:two);e.overlay.unlockOverlayScroll(one);assert.equal(e.document.body.style.overflow,'scroll');
  }
});
test('overlay ownership follows visible layer and excludes hidden/inert dialogs',()=>{
  const e=environment(),ai=e.dialog('ai',1201),search=e.dialog('search',1220),settings=e.dialog('settings',1400);e.document.body.append(settings,search,ai);
  assert.equal(e.overlay.topOverlay(),settings);settings.hidden=true;assert.equal(e.overlay.topOverlay(),search);search.attrs.inert='';assert.equal(e.overlay.topOverlay(),ai);
});
test('a high local AI tool layer cannot outrank Search in a higher ancestor stacking layer',()=>{
  const e=environment(),ai=e.dialog('ai',1201),nested=e.dialog('tool',5000),search=e.dialog('search',1220);ai.append(nested);e.document.body.append(search,ai);
  assert.equal(e.overlay.topOverlay(),search);search.remove();assert.equal(e.overlay.topOverlay(),nested);
});
test('closing a nested dialog restores its opener inside the surviving parent',()=>{
  const e=environment(),parent=e.dialog('parent',1400),child=e.dialog('child',1500),opener=e.node('button');parent.append(opener);e.document.body.append(parent,child);
  child.remove();e.overlay.restoreOverlayFocus(opener);assert.equal(e.document.activeElement,opener);
});
test('an empty top dialog contains Tab on its focusable root',()=>{
  const e=environment(),dialog=e.dialog('empty',1400);e.document.body.append(dialog);e.document.body.focus();const key=e.key('Tab');e.overlay.trapOverlayTab(key,dialog);
  assert.equal(key.defaultPrevented,true);assert.equal(e.document.activeElement,dialog);
});
for(const rtl of [false,true])test('workspace arrows and Home/End select canonical tabs in '+(rtl?'RTL':'LTR'),()=>{
  const e=environment(),list=e.node('div'),selected=[];list.style.direction=rtl?'rtl':'ltr';const tabs=['first','middle','last'].map(id=>{const tab=e.node('button',{role:'tab'});tab.onClick=()=>selected.push(id);return tab;});list.append(...tabs);e.document.body.append(list);tabs[0].focus();
  e.tabs.handleTabKeyDown(e.key(rtl?'ArrowLeft':'ArrowRight',false,list));assert.equal(e.document.activeElement,tabs[1]);assert.deepEqual(selected,['middle']);
  e.tabs.handleTabKeyDown(e.key('End',false,list));assert.equal(e.document.activeElement,tabs[2]);
  e.tabs.handleTabKeyDown(e.key('Home',false,list));assert.equal(e.document.activeElement,tabs[0]);assert.equal(tabs[0].scrolled,1);
});
test('tab navigation skips disabled tabs and retains the canonical dirty guard',()=>{
  const e=environment(),list=e.node('div'),first=e.node('button',{role:'tab'}),disabled=e.node('button',{role:'tab'}),last=e.node('button',{role:'tab'});disabled.disabled=true;let changes=0,guardCalls=0;
  last.onClick=()=>{guardCalls++;/* declined confirmation */};list.append(first,disabled,last);e.document.body.append(list);first.focus();e.tabs.handleTabKeyDown(e.key('ArrowRight',false,list));
  assert.equal(e.document.activeElement,last);assert.equal(guardCalls,1);assert.equal(changes,0);
});
test('vertical Settings navigation uses Up/Down independently of RTL',()=>{
  const e=environment(),list=e.node('nav'),first=e.node('button',{role:'tab'}),last=e.node('button',{role:'tab'});list.style.direction='rtl';list.append(first,last);e.document.body.append(list);first.focus();
  e.tabs.handleTabKeyDown(e.key('ArrowDown',false,list),true);assert.equal(e.document.activeElement,last);
});
for(const mobile of [false,true])test('Create arrow navigation wraps at '+(mobile?'900':'901')+' breakpoint and does not run under a higher dialog',()=>{
  const e=environment();e.window.matchMedia=()=>({matches:mobile});const id=mobile?'ta-mobile-create-menu':'ta-desktop-create-menu',menu=e.node('div',{id,role:'menu',class:'ta-create-menu'});menu.style.zIndex='1200';
  const items=[0,1,2].map(()=>e.node('button',{role:'menuitem'}));menu.append(...items);e.document.body.append(menu);items[0].focus();
  const shell=methods('src/components/AppShell.tsx',['isMobileShell','activeCreateMenuId','handleKeyDown','trapOverlayFocus'],e);shell.state={moreOpen:false};shell.props={newMenu:true};
  shell.handleKeyDown(e.key('ArrowDown'));assert.equal(e.document.activeElement,items[1]);shell.handleKeyDown(e.key('End'));shell.handleKeyDown(e.key('ArrowDown'));assert.equal(e.document.activeElement,items[0]);
  items[2].focus();const tab=e.key('Tab');shell.handleKeyDown(tab);assert.equal(tab.defaultPrevented,true);assert.equal(e.document.activeElement,items[0],'Tab wraps in both rendered Create menus');
  const higher=e.dialog('higher',1400);e.document.body.append(higher);shell.handleKeyDown(e.key('ArrowDown'));assert.equal(e.document.activeElement,items[0]);
});
test('attachment preview contains focus and returns to its exact opener without saving',()=>{
  const e=environment(),opener=e.node('button'),overlay=e.dialog('preview',1500),close=e.node('button');overlay.append(close);e.document.body.append(opener);opener.focus();
  const h=methods('src/components/DocumentAttachmentsSection.tsx',['openPreview','closePreview','handleKeyDown'],e);h.mounted=true;h.state={preview:null};h.previewOverlay=overlay;
  const set=h.setState;h.setState=(change,callback)=>set(change,()=>{if(h.state.preview)e.document.body.append(overlay);else overlay.remove();callback?.();});
  h.openPreview({id:'synthetic'});assert.equal(e.document.activeElement,close);h.handleKeyDown(e.key('Escape'));assert.equal(h.state.preview,null);assert.equal(e.document.activeElement,opener);assert.equal(e.document.body.style.overflow,'');
});
test('shared ModalFrame ignores Escape owned by a higher dialog and handles its own Escape once',()=>{
  const e=environment(),parent=e.dialog('parent',1400),child=e.dialog('child',1500);e.document.body.append(parent,child);let closed=0;
  const h=methods('src/components/UI.tsx',['isTopModal','focusable','handleKeyDown'],e);h.dialog=parent;h.backdrop=parent;h.props={onClose:()=>{closed++;}};
  const escape=e.key('Escape');h.handleKeyDown(escape);assert.equal(closed,0);child.remove();h.handleKeyDown(escape);h.handleKeyDown(escape);assert.equal(closed,1);
});
test('workspace tabs render one Tab stop, linked IDs and scroll the selected finance tab into view',()=>{
  const e=environment(),effects=[],changes=[];
  const React={createElement:(type,props,...children)=>({type,props:props||{},children}),useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useEffect:fn=>effects.push(fn)};
  const context={...e.context,exports:{},React,require:()=>({t:en=>en,handleTabKeyDown:e.tabs.handleTabKeyDown})};
  vm.runInNewContext(ts.transpileModule(read('src/components/DomainWorkspaceTabs.tsx'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React}}).outputText,context);
  const tree=context.exports.DomainWorkspaceTabs({idPrefix:'finance',value:'expenses',onChange:id=>changes.push(id),options:[{id:'treasury',label:'Cash & Bank'},{id:'expenses',label:'Expenses'}]});
  const buttons=tree.children.flat(Infinity).filter(node=>node?.type==='button');
  assert.deepEqual(buttons.map(node=>node.props.tabIndex),[-1,0]);
  assert.equal(buttons[1].props.id,'finance-tab-expenses');assert.equal(buttons[1].props['aria-controls'],'finance-panel');
  const list=e.node('div');const rendered=buttons.map(node=>{const button=e.node('button',{role:node.props.role,'aria-selected':String(node.props['aria-selected'])});button.onClick=node.props.onClick;return button;});
  list.append(...rendered);e.document.body.append(list);tree.props.ref.current=list;effects.forEach(fn=>fn());assert.equal(rendered[1].scrolled,1);assert.equal(rendered[0].scrolled,0);
  rendered[1].focus();tree.props.onKeyDown(e.key('Home',false,list));assert.deepEqual(changes,['treasury']);
});
test('mobile quick-create waits for the More sheet to commit closed before opening Search',()=>{
  const e=environment(),events=[];e.window.dispatchEvent=event=>events.push(event.type);e.context.Event=Event;
  const h=methods('src/components/AppShell.tsx',['openMobileQuickCreate'],e);h.state={moreOpen:true};h.closeCreateMenu=()=>{};
  h.openMobileQuickCreate();assert.equal(h.state.moreOpen,false);assert.equal(events.length,0);e.frames.shift()();assert.deepEqual(events,['lourex-global-search-open']);
});
test('AI lifecycle keeps the original opener across message updates and releases its scroll lock',()=>{
  const e=environment(),opener=e.node('button'),panel=e.dialog('lourex-ai-panel',1201),composer=e.node('textarea');panel.append(composer);e.document.body.append(opener,panel);opener.focus();
  const h=methods('src/components/AiCopilot.tsx',['componentDidUpdate','panel'],e);const props={screen:'home',language:'ar'};h.props=props;h.state={open:true};h.overlayWasOpen=false;h.mounted=true;
  h.componentDidUpdate(props);assert.equal(e.document.body.style.overflow,'hidden');composer.focus();h.componentDidUpdate(props);
  panel.remove();h.state.open=false;h.componentDidUpdate(props);assert.equal(e.document.activeElement,opener);assert.equal(e.document.body.style.overflow,'');
});
for(const [path,marker] of [['dist/ai-composer-v449.js','lourex-ai-plus-menu'],['dist/ai-composer-v449.js','closeScopeMenu(root,true)'],['dist/lourex-ai-workflows.js','closeHub();panel.querySelector']])test('compiled '+marker+' Escape belongs to the AI dialog, not Search or a nested confirmation',()=>{
  const e=environment(),ai=e.dialog('lourex-ai-panel',1201),root=e.node('div'),menu=e.node('div',{role:'menu'}),trigger=e.node('button');ai.append(root,menu,trigger);e.document.body.append(ai);
  ai.querySelector=selector=>selector.includes('hub-trigger')?trigger:root;root.querySelector=()=>menu;
  e.document.querySelector=selector=>selector==='#lourex-ai-panel'?ai:menu;
  const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let handler;
  const visit=node=>{
    if(ts.isCallExpression(node)&&node.expression.getText(ast)==='document.addEventListener'&&node.arguments[0]?.text==='keydown'&&node.arguments[1]?.getText(ast).includes(marker))handler=node.arguments[1].getText(ast);
    ts.forEachChild(node,visit);
  };visit(ast);assert.ok(handler,'capture owner exists in the actual final output');
  let closes=0;const context={...e.context,PANEL:'#lourex-ai-panel',panel:()=>ai,openMenu:menu,closeMenu:()=>{closes++;},closeScopeMenu:()=>{closes++;},closeHub:()=>{closes++;}};
  vm.runInNewContext('globalThis.auditHandler='+handler,context);
  const target=e.node('button');target.closest=()=>e.dialog('search',1220);const event=e.key('Escape');event.target=target;event.stopImmediatePropagation=()=>{event.stopped=true;};
  context.auditHandler(event);assert.equal(closes,0);assert.equal(event.defaultPrevented,false);
  target.closest=()=>e.dialog('nested-confirmation',1400);context.auditHandler(event);assert.equal(closes,0);
  target.closest=()=>ai;context.auditHandler(event);assert.equal(closes,1);assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);
});
