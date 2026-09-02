import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce=(source,needle,replacement,label)=>{
  const at=source.indexOf(needle);
  if(at<0)throw new Error(`Patch target not found: ${label}`);
  if(source.indexOf(needle,at+needle.length)>=0)throw new Error(`Patch target ambiguous: ${label}`);
  return source.slice(0,at)+replacement+source.slice(at+needle.length);
};

{
  const path='src/app/App.tsx';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,"import { CustomersPage } from '../components/CustomersPage.js';","import { CustomersPage } from '../components/CustomersPage.js';\nimport { ReceivablesPage } from '../components/ReceivablesPage.js';",'receivables import');
  s=replaceOnce(s,"screen:'documents'|'customers'|'items'|'editor';","screen:'documents'|'customers'|'receivables'|'items'|'editor';",'screen union');
  s=replaceOnce(s,"assertInvoicePaymentInvariant(updated,vault.payments);","assertInvoicePaymentInvariant(updated,vault.payments,vault.documents);",'payment invariant documents');
  s=replaceOnce(s,"normalizePaymentRecord(invoice,vault.payments,payment)","normalizePaymentRecord(invoice,vault.payments,payment,vault.documents)",'payment normalization documents');
  s=replaceOnce(s,
    "<button className={this.state.screen==='customers'?'active':''} aria-current={this.state.screen==='customers'?'page':undefined} onClick={()=>this.setState({screen:'customers',editorDoc:null})}><Icon name=\"users\"/>{t('Customers','العملاء')}</button><button className={this.state.screen==='items'?'active':''}",
    "<button className={this.state.screen==='customers'?'active':''} aria-current={this.state.screen==='customers'?'page':undefined} onClick={()=>this.setState({screen:'customers',editorDoc:null})}><Icon name=\"users\"/>{t('Customers','العملاء')}</button><button className={this.state.screen==='receivables'?'active':''} aria-current={this.state.screen==='receivables'?'page':undefined} onClick={()=>this.setState({screen:'receivables',editorDoc:null})}><Icon name=\"invoice\"/>{t('Receivables','المستحقات')}</button><button className={this.state.screen==='items'?'active':''}",
    'receivables nav');
  s=replaceOnce(s,
    "{this.state.screen==='customers'?<CustomersPage customers={vault.customers} onSave={this.saveCustomer} onDelete={this.deleteCustomer} onNewDocument={this.newDocumentForCustomer}/>:null}{this.state.screen==='items'?",
    "{this.state.screen==='customers'?<CustomersPage customers={vault.customers} onSave={this.saveCustomer} onDelete={this.deleteCustomer} onNewDocument={this.newDocumentForCustomer}/>:null}{this.state.screen==='receivables'?<ReceivablesPage customers={vault.customers} documents={vault.documents} payments={vault.payments} company={vault.company}/>:null}{this.state.screen==='items'?",
    'receivables render');
  await writeFile(path,s);
}

{
  const path='src/components/EditorPage.tsx';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,"<InvoicePaymentsPanel document={props.document} payments={props.payments}","<InvoicePaymentsPanel document={props.document} documents={props.documents} payments={props.payments}",'editor payment documents');
  await writeFile(path,s);
}

{
  const path='src/components/DocumentsPage.tsx';
  let s=await readFile(path,'utf8');
  s=replaceOnce(s,"invoicePaymentSummary(doc,this.props.payments)","invoicePaymentSummary(doc,this.props.payments,undefined,this.props.documents)",'documents credit-aware summary');
  await writeFile(path,s);
}

{
  const path='public/sw.js';
  let s=await readFile(path,'utf8');
  s=s.replace(/^\/\/ v132[^\n]*/,"// v133 — receivables aging, customer statements and credit-aware collection; retains v132 document lifecycle and v131 payments.");
  s=s.replace(/^\/\/ Legacy regression markers only;[^\n]*/m,"// Legacy regression markers only; active runtime cache is v133: const CACHE = 'lourex-invoice-v101'; const CACHE = 'lourex-invoice-v120'; const CACHE = 'lourex-invoice-v131'; const CACHE = 'lourex-invoice-v132';");
  s=s.replace(/^const CACHE = 'lourex-invoice-v\d+';/m,"const CACHE = 'lourex-invoice-v133';");
  s=replaceOnce(s,'"./styles/document-lifecycle-v132.css","./styles/performance-polish-v100.css"','"./styles/document-lifecycle-v132.css","./styles/receivables-v133.css","./styles/performance-polish-v100.css"','receivables css cache');
  s=replaceOnce(s,'"./src/components/CustomersPage.js","./src/components/SavedItemsPage.js"','"./src/components/CustomersPage.js","./src/components/ReceivablesPage.js","./src/components/SavedItemsPage.js"','receivables component cache');
  s=replaceOnce(s,'"./src/lib/payments.js","./src/lib/document-lifecycle.js"','"./src/lib/payments.js","./src/lib/receivables.js","./src/lib/document-lifecycle.js"','receivables lib cache');
  await writeFile(path,s);
}

{
  const path='tests/payments-v131.test.mjs';
  let s=await readFile(path,'utf8');
  s=s.replace("assert.ok(payments.includes('Invoice total cannot be reduced below the amount already paid.'));","assert.ok(payments.includes('Invoice balance after credit notes cannot fall below the amount already paid.'));");
  s=s.replace("assert.ok(app.includes('assertInvoicePaymentInvariant(updated,vault.payments)'));","assert.ok(app.includes('assertInvoicePaymentInvariant(updated,vault.payments,vault.documents)'));");
  await writeFile(path,s);
}

console.log('Receivables batch 4 integration applied.');
