import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
function buttons(node){
  if(!node||typeof node!=='object')return [];
  const content=Array.isArray(node)?node:[node];
  return content.flatMap(child=>child?.type==='button'?[child]:buttons(child?.props?.children));
}
test('workspace navigation offers four meaningful task sections instead of twelve crowded top-level tabs',async()=>{
  globalThis.React={createElement:(type,props,...children)=>({type,props:{...props,children:children.length===1?children[0]:children}})};
  const {WorkspaceNavigation}=await import('../dist/src/components/AiConversationWorkspace.js');
  const selections=[];
  const nav=WorkspaceNavigation({tab:'product',ar:true,choose:value=>selections.push(value)});
  const [top,detail]=nav.props.children;
  assert.equal(top.type,'nav');assert.equal(detail.type,'nav');
  const sections=buttons(top),views=buttons(detail);
  assert.equal(sections.length,4);
  assert.deepEqual(sections.map(item=>item.props['aria-pressed']),[true,false,false,false]);
  assert.deepEqual(views.map(item=>item.props.children),['المعاينة','تعديل','العميل','الأصناف','الملفات','السجل']);
  assert.equal(views.filter(item=>item.props['aria-pressed']===true).length,1);
  assert.equal(views[3].props['aria-pressed'],true);
  sections[1].props.onClick();
  assert.equal(selections[0],'commercial');
  views[2].props.onClick();
  assert.equal(selections[1],'customer');
  const screens=['preview','edit','customer','product','files','revisions','commercial','missions','evidence','knowledge','reliability','diagnostics'];
  for(const tab of screens){
    const rendered=WorkspaceNavigation({tab,ar:false,choose:()=>{}});
    const current=buttons(rendered.props.children[1]);
    assert.equal(current.filter(item=>item.props['aria-pressed']===true).length,1,tab);
  }
});
test('mobile document rows are labelled and rendered as accessible product cards',async()=>{
  const [ui,css]=await Promise.all([read('src/components/AiConversationWorkspace.tsx'),read('src/styles/ai-conversation-workspace.css')]);
  assert.match(ui,/data-field-label=\{names\[j\]\}/);
  assert.match(ui,/<table><caption>/);
  assert.match(ui,/scope="row"/);
  assert.match(css,/AI workspace design v1/);
  assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/content:attr\(data-field-label\)/);
  assert.match(css,/\.lxw-grid td input,/);
  assert.match(css,/min-width:0!important/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
