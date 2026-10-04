import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.React={Component:class{},createElement:()=>null};
const {GlobalSearch}=await import('../dist/src/components/GlobalSearch.js');

test('search follows actual keyboard height and offset without subtracting chrome twice',()=>{
  const values=new Map();let mobile=true;
  globalThis.window={innerHeight:844,visualViewport:{height:190,offsetTop:20},matchMedia:()=>({matches:mobile})};
  const search=new GlobalSearch();
  const panel={dataset:{},style:{setProperty:(key,value,priority)=>values.set(key,{value,priority}),removeProperty:key=>values.delete(key)}};
  search.setPanelRef(panel);
  assert.equal(panel.dataset.visualViewportConstrained,'true');
  assert.deepEqual(values.get('top'),{value:'28px',priority:'important'});
  assert.equal(values.get('max-height').value,'174px');
  assert.equal(values.get('bottom').value,'auto');
  window.visualViewport.offsetTop=32;search.syncVisualViewport();
  assert.equal(values.get('top').value,'40px','Safari viewport scrolling updates origin');
  window.visualViewport.height=844;window.visualViewport.offsetTop=0;search.syncVisualViewport();
  assert.equal(values.size,0,'keyboard dismissal restores approved CSS geometry');
  assert.equal(panel.dataset.visualViewportConstrained,undefined);
  window.visualViewport.height=300;search.syncVisualViewport();mobile=false;search.syncVisualViewport();
  assert.equal(values.size,0,'desktop rotation removes phone inline geometry');
  mobile=true;window.visualViewport=null;search.syncVisualViewport();
  assert.equal(values.size,0,'without visualViewport preserve existing layout');
  window.visualViewport={height:NaN,offsetTop:20};search.syncVisualViewport();
  assert.equal(values.size,0,'invalid viewport cannot create invalid CSS');
  search.setPanelRef(null);search.syncVisualViewport();
});

test('search removes all viewport listeners on unmount',()=>{
  const listeners=new Map();
  const target=name=>({addEventListener:(event,handler)=>listeners.set(`${name}:${event}`,handler),removeEventListener:(event,handler)=>{assert.equal(listeners.get(`${name}:${event}`),handler);listeners.delete(`${name}:${event}`);}});
  globalThis.document=target('document');globalThis.window={...target('window'),visualViewport:target('viewport')};
  const search=new GlobalSearch();search.componentDidMount();
  assert.equal(listeners.size,6);
  search.componentWillUnmount();assert.equal(listeners.size,0);
});
