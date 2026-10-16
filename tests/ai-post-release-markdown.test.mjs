import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const compiled=readFileSync('dist/src/components/AiConversationWorkspace.js','utf8');
const React={
  createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}),
  isValidElement:value=>Boolean(value&&typeof value==='object'&&'type' in value),
  Children:{toArray:value=>[value].flat(Infinity).filter(v=>v!==null&&v!==undefined)},
};
const context=vm.createContext({React,react:React});
vm.runInContext(compiled.slice(compiled.indexOf('function markdownInline('),compiled.indexOf('const label =')),context);
const p=text=>React.createElement('p',null,text);
const tags=nodes=>nodes.flatMap(node=>typeof node==='object'?[node.type,...tags(node.props.children)]:[]);

test('actual compiled renderer formats provider headings, emphasis and consecutive lists',()=>{
  const nodes=context.markdownParagraphs([p('## Summary'),p('**Healthy** and *clear*'),p('- First'),p('- Second'),p('1. Review'),p('2. Confirm')]);
  assert.deepEqual(Array.from(nodes,n=>n.type),['h3','p','ul','ol']);
  assert.ok(tags(nodes).includes('strong'));
  assert.ok(tags(nodes).includes('em'));
  assert.equal(nodes[2].props.children.length,2);
});
test('flattened provider headings recover paragraph structure without executing HTML',()=>{
  const nodes=context.markdownParagraphs([p('## Summary **Safe** ## Risks <script>alert(1)</script>')]);
  assert.equal(nodes.length,2);
  assert.equal(nodes[0].type,'h3');
  assert.ok(JSON.stringify(nodes).includes('<script>alert(1)</script>'));
  assert.ok(!tags(nodes).includes('script'));
  assert.ok(!JSON.stringify(nodes).includes('dangerouslySetInnerHTML'));
});
test('scoped evidence buttons and their original callbacks survive formatting',()=>{
  const callback=()=>{};
  const evidence=React.createElement('button',{onClick:callback},'source');
  const nodes=context.markdownParagraphs([React.createElement('p',null,'**Verified** ',evidence)]);
  assert.equal(nodes[0].props.children.find(n=>n?.type==='button'),evidence);
  assert.equal(evidence.props.onClick,callback);
});
test('table fragments split across provider paragraphs become one table, followed by an ordinary reply',()=>{
  const nodes=context.markdownParagraphs([p('| الصنف | Price |'),p('| --- | --- |'),p('| Ulker | 10 USD |'),p('جاهز للمراجعة')]);
  assert.equal(nodes[0].props.className,'lxw-response-table');
  assert.ok(tags(nodes).includes('table'));
  assert.equal(nodes[1].type,'p');
  assert.ok(JSON.stringify(nodes[1]).includes('جاهز للمراجعة'));
});
test('legacy Fragment/br response keeps products in a vertical list and preserves evidence',()=>{
  React.Fragment=Symbol.for('react.fragment');
  const source=React.createElement('button',{onClick:()=>{}},'source');
  const nodes=context.markdownParagraphs([
    React.createElement(React.Fragment,null,'الأصناف المتوفرة:',React.createElement('br')),
    React.createElement(React.Fragment,null,'* Potato Chips - Cheese',React.createElement('br')),
    React.createElement(React.Fragment,null,'* Potato Chips - Salt',React.createElement('br')),
    React.createElement(React.Fragment,null,'مراجعة ',source)
  ]);
  assert.deepEqual(Array.from(nodes,n=>n.type),['p','ul','p']);
  assert.equal(nodes[1].props.children.length,2);
  assert.equal(nodes[2].props.children.find(n=>n?.type==='button'),source);
  assert.ok(!tags(nodes).includes('em'));
});
test('explicit flattened star bullets are separated without breaking product-name hyphens',()=>{
 const nodes=context.markdownParagraphs([p('المتاح: * Potato Chips - Cheese * Potato Chips - Salt')]);
 assert.deepEqual(Array.from(nodes,n=>n.type),['p','ul']);
 assert.equal(nodes[1].props.children.length,2);
});
