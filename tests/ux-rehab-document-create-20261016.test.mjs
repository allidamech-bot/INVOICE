import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(p,'utf8');

test('Documents home groups standard new document types in one accessible chooser',async()=>{
 const source=await read('src/components/DocumentsPage.tsx');
 const shell=await read('src/components/AppShell.tsx');
 assert.match(source,/className="ta-documents-create-entry" aria-haspopup="dialog"/);
 assert.match(source,/<Modal portal open=\{this.state.createOpen\}/);
 assert.match(source,/className="ta-documents-create-choices" role="group"/);
 const kinds=['proforma','invoice','proforma-invoice','delivery-note','rfq','purchase-order','draft','payment-receipt'];
 for(const kind of kinds){
   assert.ok(source.includes("this.props.onNew('"+kind+"')"),'Documents route missing '+kind);
   assert.ok(shell.includes("this.createDocument('"+kind+"')"),'AppShell route missing '+kind);
 }
 assert.match(source,/AiWorkflowTools compact defaultRoute="quote_request"/);
 assert.match(source,/this\.props\.onOpenRecurring/);
});

test('guarded credit notes and statements remain in the master launcher',async()=>{
 const shell=await read('src/components/AppShell.tsx');
 const app=await read('src/app/App.tsx');
 assert.match(shell,/data-kind="credit-note" onClick=\{this\.openCreditNote\}/);
 assert.match(shell,/data-kind="statement-account" onClick=\{this\.openStatementAccount\}/);
 assert.match(app,/onCreditNote=\{this\.openCreditNoteLauncher\}/);
 assert.match(app,/onStatementAccount=\{this\.openStatementLauncher\}/);
 assert.match(app,/this\.newDocument\(kind\)/);
 assert.match(app,/onNewDocument=\{\(\)=>this\.setState\(\{newMenu:true\}\)\}/);
});

test('mobile document chooser avoids sideways clipping with scrollable grouped choices',async()=>{
 const css=await read('src/styles/tailadmin-documents-v320.css');
 const block=css.split('/* UX rehab C — grouped document creator')[1];
 assert.ok(block);
 assert.match(block,/\.ta-documents-header-actions\{[\s\S]*?overflow:visible!important/);
 assert.match(block,/\.ta-documents-create-choices\{[\s\S]*?max-height:min\(70dvh,620px\);overflow-y:auto/);
 assert.match(block,/\.ta-documents-create-entry>summary\{[\s\S]*?min-height:44px/);
 assert.match(block,/\.ta-documents-create-choices>button\{[\s\S]*?min-height:48px/);
 assert.match(block,/@media screen and \(max-width:720px\)/);
});
