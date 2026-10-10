import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat()})};
function harness(path,names,language='en'){
 const source=read(path),ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const cls=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.members.some(m=>names.includes(m.name?.getText(ast))));
 const members=cls.members.filter(m=>names.includes(m.name?.getText(ast)));assert.equal(members.length,names.length);
 const code=ts.transpileModule('class Harness{'+members.map(m=>m.getText(ast)).join('\n')+'}\nexports.Harness=Harness;',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
 const context={exports:{},React,Icon:'Icon',Button:'Button',t:(en,ar)=>language==='ar'?ar:en};vm.runInNewContext(code,context);
 const h=new context.exports.Harness();h.setState=change=>{h.state={...h.state,...change};};return h;
}
function descendants(node){return [node,...(node?.children||[]).filter(n=>n&&typeof n==='object').flatMap(descendants)];}
const kinds=['proforma','invoice','proforma-invoice','delivery-note','rfq','purchase-order','payment-receipt','credit-note','statement-account','draft'];
for(const language of ['en','ar'])for(const id of ['ta-desktop-create-menu','ta-mobile-create-menu'])test(`${language} ${id}: all ten stable identities invoke their own route once`,()=>{
 const h=harness('src/components/AppShell.tsx',['createMenu'],language),calls=[];h.props={newMenu:true};h.createDocument=k=>calls.push(k);h.openCreditNote=()=>calls.push('credit-note');h.openStatementAccount=()=>calls.push('statement-account');
 const tree=h.createMenu(id,'fixture'),nodes=descendants(tree);assert.deepEqual(calls,[],'rendering must not create a document');
 assert.equal(tree.props.id,id);assert.equal(nodes.filter(n=>n.props?.className==='ta-create-group-label').length,3);
 const buttons=nodes.filter(n=>n.type==='button');assert.deepEqual(buttons.map(n=>n.props['data-kind']),kinds);
 for(const [i,button] of buttons.entries()){assert.equal(button.props.role,'menuitem');button.props.onClick();assert.equal(calls[i],kinds[i]);}
 assert.equal(calls.length,10);h.props.newMenu=false;assert.equal(h.createMenu(id,'fixture'),null);
});
function resolver(){
 const source=read('public/document-entry-v302.js'),ast=ts.createSourceFile('runtime.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),parts=[];
 function visit(n){if(ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['menuKinds','menuLabelKinds'].includes(d.name.getText(ast))))parts.push(n.getText(ast));if(ts.isFunctionDeclaration(n)&&n.name?.text==='kindFromMenuButton')parts.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
 assert.equal(parts.length,3);const ctx={};vm.runInNewContext(parts.join('\n')+'\nthis.resolve=kindFromMenuButton;',ctx);return ctx.resolve;
}
test('runtime kind resolution ignores positions and rejects unknown explicit identities',()=>{
 const resolve=resolver();for(const kind of [...kinds].reverse())assert.equal(resolve({dataset:{kind},querySelector:()=>({textContent:'Unknown'})},0),kind);
 assert.equal(resolve({dataset:{},querySelector:()=>({textContent:'Unknown'})},5),'');
 assert.equal(resolve({dataset:{kind:'invalid'},querySelector:()=>({textContent:'Quotation'})},0),'');
 for(const [label,kind] of [['عرض سعر','proforma'],['Commercial Invoice','invoice'],['مسودة','draft']])assert.equal(resolve({dataset:{},querySelector:()=>({textContent:label})},9),kind);
});
test('badge and accent contracts follow stable kinds rather than menu positions',()=>{
 const badges=read('src/styles/v330-template-contrast-guard.css'),accents=read('src/styles/tailadmin-mobile-header-v322.css');
 const codes={draft:'DR',rfq:'RFQ',proforma:'QT','proforma-invoice':'PI','purchase-order':'PO',invoice:'INV','delivery-note':'DN','payment-receipt':'RC','credit-note':'CN','statement-account':'SOA'};
 for(const [kind,code] of Object.entries(codes)){const rule=badges.match(new RegExp('button\\[data-kind="'+kind+'"\\]\\{([^}]+)\\}'));assert.ok(rule);assert.ok(rule[1].includes('--v333-code:"'+code+'"'));assert.ok(accents.includes('button[data-kind="'+kind+'"]{--create-accent:'));}
 assert.doesNotMatch(badges+accents,/ta-create-menu-grid>button:nth-child/);
});
test('switching Account and Settings preserves drafts, dirty snapshots, selected tab and close confirmation',()=>{
 const h=harness('src/components/SettingsModal.tsx',['switchScope','hasUnsavedSettings','requestClose']);let closes=0,scrolls=0;h.props={onClose:()=>closes++};h.settingsContent={scrollTo:()=>scrolls++};
 const company={nameEn:'Edited'},appSettings={autoLock:20};h.state={scope:'settings',tab:'documents',company,appSettings,companyInitial:'{}',documentsInitial:'{}',busy:false,cleaningAssets:false};
 h.switchScope('account');h.switchScope('settings');assert.equal(h.state.scope,'settings');assert.equal(h.state.company,company);assert.equal(h.state.appSettings,appSettings);assert.equal(h.state.tab,'documents');assert.equal(scrolls,2);assert.equal(h.hasUnsavedSettings(),true);
 h.requestClose();assert.equal(closes,0);assert.equal(h.state.confirmClose,true);
 h.state.busy=true;h.switchScope('account');assert.equal(h.state.scope,'settings');h.state.busy=false;h.state.cleaningAssets=true;h.switchScope('account');assert.equal(h.state.scope,'settings');
});
for(const language of ['en','ar'])test(`${language}: save controls name the persisted scope and preserve callbacks and busy state`,()=>{
 const h=harness('src/components/SettingsModal.tsx',['saveButton'],language);let company=0,preferences=0;h.saveCompany=()=>company++;h.saveDocuments=()=>preferences++;h.state={savedSection:null,busy:false,cleaningAssets:false};
 const c=h.saveButton('company'),d=h.saveButton('documents');assert.notEqual(c.props['aria-label'],d.props['aria-label']);assert.equal(c.children[0],c.props['aria-label']);assert.equal(d.children[0],d.props['aria-label']);c.props.onClick();d.props.onClick();assert.equal(company,1);assert.equal(preferences,1);
 h.state.cleaningAssets=true;assert.equal(h.saveButton('company').props.disabled,true);assert.equal(h.saveButton('documents').props.disabled,false);h.state.busy=true;assert.equal(h.saveButton('documents').props.disabled,true);
});
