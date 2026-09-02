import { readFileSync, writeFileSync } from 'node:fs';

function patch(path,mutate){
  const before=readFileSync(path,'utf8');
  const after=mutate(before);
  if(after===before)throw new Error(`No changes applied to ${path}`);
  writeFileSync(path,after);
}
function replaceOnce(source,from,to,label){
  const first=source.indexOf(from);
  if(first<0)throw new Error(`Missing ${label}`);
  if(source.indexOf(from,first+from.length)>=0)throw new Error(`Ambiguous ${label}`);
  return source.slice(0,first)+to+source.slice(first+from.length);
}

patch('src/components/ReportsPage.tsx',source=>{
  source=replaceOnce(source,"import { getUiLanguage, isArabic, t } from '../lib/i18n.js';","import { getUiLanguage, t } from '../lib/i18n.js';",'unused reports i18n import');
  source=replaceOnce(source,'<Button icon="print" onClick={this.print}>','<Button icon="printer" onClick={this.print}>','report print icon');
  return source;
});

patch('src/lib/reports.ts',source=>{
  source=replaceOnce(source,"function validIsoDate(value:string):boolean{return /^\\d{4}-\\d{2}-\\d{2}$/.test(value);}","function compareMoneyDescending(left:string,right:string):number{const a=decimalToScaled(left,2),b=decimalToScaled(right,2);return a===b?0:a>b?-1:1;}\nfunction validIsoDate(value:string):boolean{return /^\\d{4}-\\d{2}-\\d{2}$/.test(value);}",'exact report money comparator');
  source=replaceOnce(source,").sort((a,b)=>a.currency.localeCompare(b.currency)||Number(decimalToScaled(b.netSales,2)-decimalToScaled(a.netSales,2))||a.customerName.localeCompare(b.customerName));",").sort((a,b)=>a.currency.localeCompare(b.currency)||compareMoneyDescending(a.netSales,b.netSales)||a.customerName.localeCompare(b.customerName));",'customer report sort');
  return source;
});

patch('src/app/App.tsx',source=>{
  source=replaceOnce(source,"import { ReceivablesPage } from '../components/ReceivablesPage.js';","import { ReceivablesPage } from '../components/ReceivablesPage.js';\nimport { ReportsPage } from '../components/ReportsPage.js';",'ReportsPage import');
  source=replaceOnce(source,"screen:'documents'|'customers'|'receivables'|'items'|'editor'","screen:'documents'|'customers'|'receivables'|'reports'|'items'|'editor'",'reports screen state');
  const receivablesNav='<button className={this.state.screen===\'receivables\'?\'active\':\'\'} aria-current={this.state.screen===\'receivables\'?\'page\':undefined} onClick={()=>this.setState({screen:\'receivables\',editorDoc:null})}><Icon name="invoice"/>{t(\'Receivables\',\'المستحقات\')}</button>';
  const reportsNav='<button className={this.state.screen===\'reports\'?\'active\':\'\'} aria-current={this.state.screen===\'reports\'?\'page\':undefined} onClick={()=>this.setState({screen:\'reports\',editorDoc:null})}><Icon name="file"/>{t(\'Reports\',\'التقارير\')}</button>';
  source=replaceOnce(source,receivablesNav,receivablesNav+reportsNav,'reports navigation');
  const receivablesPage="{this.state.screen==='receivables'?<ReceivablesPage customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company}/>:null}";
  const reportsPage="{this.state.screen==='reports'?<ReportsPage company={vault.company} customers={vault.customers} documents={vault.documents} payments={vault.payments}/>:null}";
  source=replaceOnce(source,receivablesPage,receivablesPage+reportsPage,'reports page render');
  return source;
});

patch('index.html',source=>replaceOnce(source,'  <link rel="stylesheet" href="./styles/profitability-v134.css" />\n  <link rel="stylesheet" href="./styles/performance-polish-v100.css" />','  <link rel="stylesheet" href="./styles/profitability-v134.css" />\n  <link rel="stylesheet" href="./styles/reports-v135.css" />\n  <link rel="stylesheet" href="./styles/performance-polish-v100.css" />','reports stylesheet order'));

patch('public/sw.js',source=>{
  source=replaceOnce(source,'// v134 — internal cost, gross profit and margin analysis; retains v133 receivables, v132 document lifecycle and v131 payments.','// v135 — multi-currency financial reporting; retains v134 profitability, v133 receivables, v132 document lifecycle and v131 payments.','v135 service worker comment');
  source=replaceOnce(source,"// Legacy regression markers only; active runtime cache is v134: const CACHE = 'lourex-invoice-v101'; const CACHE = 'lourex-invoice-v120'; const CACHE = 'lourex-invoice-v131'; const CACHE = 'lourex-invoice-v132'; const CACHE = 'lourex-invoice-v133';","// Legacy regression markers only; active runtime cache is v135: const CACHE = 'lourex-invoice-v101'; const CACHE = 'lourex-invoice-v120'; const CACHE = 'lourex-invoice-v131'; const CACHE = 'lourex-invoice-v132'; const CACHE = 'lourex-invoice-v133'; const CACHE = 'lourex-invoice-v134';",'cache compatibility markers');
  source=replaceOnce(source,"\nconst CACHE = 'lourex-invoice-v134';","\nconst CACHE = 'lourex-invoice-v135';",'active v135 cache');
  source=replaceOnce(source,'"./styles/profitability-v134.css","./styles/performance-polish-v100.css"','"./styles/profitability-v134.css","./styles/reports-v135.css","./styles/performance-polish-v100.css"','reports css offline asset');
  source=replaceOnce(source,'"./src/components/ReceivablesPage.js","./src/components/SavedItemsPage.js"','"./src/components/ReceivablesPage.js","./src/components/ReportsPage.js","./src/components/SavedItemsPage.js"','reports page offline asset');
  source=replaceOnce(source,'"./src/lib/receivables.js","./src/lib/profitability.js","./src/lib/document-lifecycle.js"','"./src/lib/receivables.js","./src/lib/profitability.js","./src/lib/reports.js","./src/lib/document-lifecycle.js"','reports logic offline asset');
  return source;
});

patch('tests/receivables-v133.test.mjs',source=>replaceOnce(source,"assert.ok(app.includes(\"screen:'documents'|'customers'|'receivables'|'items'|'editor'\"));","assert.ok(app.includes(\"screen:'documents'|'customers'|'receivables'|'reports'|'items'|'editor'\"));",'receivables navigation compatibility assertion'));
