import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)})};
const ctx={React};
vm.runInNewContext(readFileSync('dist/src/components/AiAttachmentSourceReview.js','utf8').replace('export function','function')+';this.render=renderAttachmentSourceReview;',ctx);
function nodes(value){if(!value||typeof value!=='object')return[];return[value,...(value.children||[]).flatMap(nodes)];}
test('cached review preserves every extracted row and distinguishes absent price from explicit zero',()=>{
 const source={fileName:'source.pdf',extracted:JSON.stringify({currency:'USD',items:[{sku:'QA-A',quantity:'10',unit:'PCS',unitPrice:'0'},{sku:'QA-B',quantity:'5',unit:'PCS',unitPrice:''}]})};
 const tree=ctx.render(source,true),all=nodes(tree),rows=all.filter(n=>n.type==='tr');
 assert.equal(rows.length,3);assert.ok(JSON.stringify(tree).includes('غير مذكور'));assert.equal(rows[1].children.at(-1).children[0],'0');
 assert.equal(rows[2].children.at(-1).children[0],'غير مذكور');
 assert.ok(all.every(n=>!n.props.onClick&&!['input','button','form','a'].includes(n.type)),'Review cannot trigger re-inference, import or save');
});
test('HTML-like source data is text, not executable markup, including generic extraction evidence',()=>{
 const source={fileName:'<img src=x onerror=bad()>',extracted:'{"facts":["<script>bad()</script>"],"missing":["price"]}'};
 const tree=ctx.render(source,false),all=nodes(tree);
 assert.ok(JSON.stringify(tree).includes('<script>bad()</script>'));
 assert.ok(all.every(n=>!n.props.dangerouslySetInnerHTML&&!['script','img'].includes(n.type)));
});
