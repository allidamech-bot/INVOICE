import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.React={createElement:(tag,props,...children)=>({tag,props,children}),Component:class{constructor(props){this.props=props;}setState(patch,callback){this.state={...this.state,...(typeof patch==='function'?patch(this.state,this.props):patch)};callback?.();}}};
const {AiCopilot}=await import('../dist/src/components/AiCopilot.js');
const {AiWorkflowTools}=await import('../dist/src/components/AiWorkflowTools.js');
const {buildProductPricingContext}=await import('../dist/src/lib/product-pricing-intelligence.js');
const {emptyVault}=await import('../dist/src/lib/defaults.js');
const {contextualReportQuestion}=await import('../dist/src/lib/contextual-report-question.js');

test('context opens a bounded reviewable question without making a request',()=>{
 globalThis.document={querySelector:()=>null};const copilot=new AiCopilot({screen:'customers',language:'en'});copilot.mounted=true;
 copilot.openContext({detail:{screen:'items',question:'wrong workspace'}});assert.equal(copilot.state.open,false);
 copilot.openContext({detail:{screen:'customers',question:'Explain Northstar'}});assert.equal(copilot.state.input,'Explain Northstar');assert.equal(copilot.state.open,true);assert.equal(copilot.state.busy,false);assert.deepEqual(copilot.state.messages,[]);assert.equal(copilot.state.proposal,null);
 copilot.pending=true;copilot.openContext({detail:{screen:'customers',question:'replace active'}});assert.equal(copilot.state.input,'Explain Northstar');copilot.pending=false;
 copilot.openContext({detail:{screen:'customers',question:'x'.repeat(1200)}});assert.equal(copilot.state.input.length,1000);
 copilot.mounted=false;copilot.openContext({detail:{screen:'customers',question:'after unmount'}});assert.equal(copilot.state.input.length,1000);
});
test('compact file entry reuses the existing typed inbox and makes no proposal',()=>{
 for(const route of ['quote_request','product_list']){const tool=new AiWorkflowTools({compact:true,defaultRoute:route});const button=tool.render().children[0];button.props.onClick();assert.equal(tool.state.forcedRoute,route);assert.equal(tool.state.view,'inbox');assert.equal(tool.state.stage,'idle');assert.equal(tool.state.quote,null);assert.equal(tool.state.supplier,null);}
});
test('focused saved product survives the thirty-row context limit without changing calculations',()=>{
 const vault=emptyVault();vault.savedItems=Array.from({length:40},(_,i)=>({id:`p${i}`,sku:`SKU-${i}`,descriptionEn:`Valve ${i}`,descriptionAr:'صمام',createdAt:'2026-01-01',updatedAt:'2026-01-01',hsCode:'',origin:'',packing:'',unit:'PCS',lastUnitCost:'8',lastCostCurrency:'USD',lastUnitPrice:'12',lastCurrency:'USD',usageCount:0,lastUsedAt:'',tags:[]}));const before=structuredClone(vault);
 const row=buildProductPricingContext(vault,'','2026-10-03','p39').rows[0];assert.equal(row.id,'p39');assert.equal(row.currentMarginPercent,'33.33');assert.deepEqual(vault,before);
 vault.savedItems[39].lastCurrency='EUR';assert.equal(buildProductPricingContext(vault,'','2026-10-03','p39').rows[0].currentMarginPercent,'');
});
test('selected report question retains actual dates, complete rows and separated currencies',()=>{
 const rows=Array.from({length:12},(_,i)=>({currency:`C${i}`,netSales:'100.01',collected:'20',outstanding:'80.01',overdue:'4',grossProfit:'30',profitComplete:false}));const text=contextualReportQuestion('2026-02-01','2026-02-28',rows);assert.ok(text.length<=1000);assert.match(text,/2026-02-01 through 2026-02-28/);const data=JSON.parse(text.split('DATA ONLY: ')[1].split(']. ')[0]+']');assert.ok(data.length>0&&data.length<12);assert.equal(data[0].netSales,'100.01');assert.equal(data[0].profitComplete,false);assert.match(text,/Other currencies omitted/);
});
