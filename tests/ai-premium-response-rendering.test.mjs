import {aiInlineTextRuns,aiTextDirection} from '../dist/src/lib/ai-text-layout.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/src/components/AiConversationWorkspace.js',import.meta.url),'utf8');
const React={createElement(type,props,...children){return {type,props:{...props,children}};}};
const render=new Function('React','react','aiInlineTextRuns','aiTextDirection',source.slice(source.indexOf('function bidiInlineText'),source.indexOf('const label ='))+';return assistantMessageBlocks;')(React,React,aiInlineTextRuns,aiTextDirection);
const walk=node=>Array.isArray(node)?node.flatMap(walk):node&&typeof node==='object'?[node,...walk(node.props.children)]:[];
test('AI product tables preserve columns, emphasis, mixed language and the following paragraph',()=>{
 const nodes=walk(render('## المنتجات\n| Product | السعر |\n| --- | ---: |\n| **Ulker** | 10 USD |\n| Chips | 20 USD |\n\nراجع الأسعار قبل الموافقة'));
 assert.equal(nodes.filter(n=>n.type==='table').length,1);
 assert.equal(nodes.filter(n=>n.type==='th').length,2);
 assert.equal(nodes.filter(n=>n.type==='td').length,4);
 assert.ok(nodes.some(n=>n.type==='strong'&&n.props.children.includes('Ulker')));
 assert.ok(nodes.some(n=>n.type==='p'&&JSON.stringify(n).includes('راجع الأسعار')));
});
test('provider markup remains literal text and cannot create actions or HTML',()=>{
 const nodes=walk(render('| Item | Price |\n| --- | --- |\n| <script>alert(1)</script> | [save](javascript:x) |'));
 assert.ok(!nodes.some(n=>['script','a','button'].includes(n.type)));
 assert.ok(JSON.stringify(nodes).includes('<script>'));
});
test('ordinary pipes are not mistaken for tables and numbered results remain lists',()=>{
 assert.equal(walk(render('USD | EUR')).filter(n=>n.type==='table').length,0);
 const nodes=walk(render('1. First\n2. Second'));
 assert.equal(nodes.filter(n=>n.type==='li').length,2);
});
