(()=>{
  'use strict';
  const PENDING='__lourexAiPendingSource';
  let mount=null,procurementMount=null,memoryMount=null,searchMount=null,dailyMount=null,collectionsMount=null;
  let mounting=false,handoffBusy=false,productReviewMount=null;

  function validPending(){const value=window[PENDING];if(!value||!value.file||!value.route||Date.now()-Number(value.createdAt||0)>10*60*1000){if(value)delete window[PENDING];return null;}return value;}
  function assignFile(input,file){try{const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));return true;}catch{return false;}}
  function later(fn,attempt=0){if(attempt>30){handoffBusy=false;return;}window.setTimeout(()=>{if(fn()){handoffBusy=false;return;}later(fn,attempt+1);},80);}
  function handoffCustomer(pending){const page=document.querySelector('.ta-customers-page');if(!page)return false;const button=page.querySelector('.ta-customers-header .ta-customer-modal-actions > button');if(!button)return false;button.click();later(()=>{const input=Array.from(document.querySelectorAll('input[type="file"][multiple]')).find(node=>node instanceof HTMLInputElement);if(!(input instanceof HTMLInputElement))return false;if(!assignFile(input,pending.file))return false;delete window[PENDING];return true;});return true;}
  function spreadsheetSource(file){return /\.(xlsx|xls|csv)$/i.test(String(file?.name||''));}
  async function mountProductAiReview(pending){if(productReviewMount||!window.React||!window.ReactDOM)return false;const node=document.createElement('div');node.dataset.lourexAiProductReview='true';document.body.appendChild(node);productReviewMount=node;try{const mod=await import('./src/components/ProductAiSourceReview.js');if(!node.isConnected)return false;const onDone=()=>{try{window.ReactDOM.unmountComponentAtNode(node);}catch{}node.remove();if(productReviewMount===node)productReviewMount=null;};window.ReactDOM.render(window.React.createElement(mod.ProductAiSourceReview,{file:pending.file,onDone}),node);delete window[PENDING];handoffBusy=false;return true;}catch(error){console.warn('[LOUREX AI product review] mount skipped',error);node.remove();if(productReviewMount===node)productReviewMount=null;handoffBusy=false;return false;}}
  function handoffProducts(pending){const page=document.querySelector('.ta-product-library');if(!page)return false;if(!spreadsheetSource(pending.file)){void mountProductAiReview(pending);return true;}const button=page.querySelector('.ta-product-commandbar > button');if(!(button instanceof HTMLButtonElement))return false;button.click();later(()=>{const input=document.querySelector('.product-import-file-input');if(!(input instanceof HTMLInputElement))return false;if(!assignFile(input,pending.file))return false;delete window[PENDING];return true;});return true;}
  function syncHandoff(){const pending=validPending();if(!pending||handoffBusy)return;handoffBusy=true;const started=pending.route==='customer'?handoffCustomer(pending):pending.route==='product_list'?handoffProducts(pending):false;if(!started)handoffBusy=false;}

  function currentEntityContext(){
    const customer=document.querySelector('.ta-customer-profile .ta-customer-profile-hero h1')?.textContent?.trim();
    if(customer)return`Customer: ${customer}`;
    const product=document.querySelector('.ta-product-editor.is-open .ta-product-editor-header h2')?.textContent?.trim();
    if(product)return`Product: ${product}`;
    const purchase=document.querySelector('.ta-ops-editor .ta-ops-editor-header h2')?.textContent?.trim();
    if(purchase)return`Purchasing workspace: ${purchase}`;
    return'';
  }
  function installContextBridge(compose){
    const form=compose?.querySelector('form');if(!(form instanceof HTMLFormElement)||form.dataset.lourexContextBridge==='true')return;
    form.dataset.lourexContextBridge='true';
    form.addEventListener('submit',()=>{
      const context=currentEntityContext();if(!context)return;
      const input=form.querySelector('input');if(!(input instanceof HTMLInputElement))return;
      const original=input.value.trim();if(!original||original.startsWith('[Current LOUREX context:'))return;
      const next=`[Current LOUREX context: ${context}] ${original}`.slice(0,1000);
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(input,next);else input.value=next;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    },true);
  }

  async function syncMount(){
    if(mount&&!mount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(mount);}catch{}mount=null;}
    if(procurementMount&&!procurementMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(procurementMount);}catch{}procurementMount=null;}
    if(memoryMount&&!memoryMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(memoryMount);}catch{}memoryMount=null;}
    if(searchMount&&!searchMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(searchMount);}catch{}searchMount=null;}
    if(dailyMount&&!dailyMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(dailyMount);}catch{}dailyMount=null;}
    if(collectionsMount&&!collectionsMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(collectionsMount);}catch{}collectionsMount=null;}
    const panel=document.getElementById('lourex-ai-panel');if(!panel||mount||mounting)return;const compose=panel.querySelector('.lourex-ai-compose');const form=compose?.querySelector('form');if(!compose||!form||!window.React||!window.ReactDOM)return;
    installContextBridge(compose);
    mounting=true;const node=document.createElement('div');node.dataset.lourexAiWorkflowMount='true';compose.insertBefore(node,form);
    try{
      const [tools,procurement,memory,search,daily,collections]=await Promise.all([import('./src/components/AiWorkflowTools.js'),import('./src/components/ProcurementAiCompare.js'),import('./src/components/BusinessMemoryTool.js'),import('./src/components/BusinessSearchTool.js'),import('./src/components/DailyCommandCenterTool.js'),import('./src/components/CollectionsAiTool.js')]);if(!node.isConnected)return;
      window.ReactDOM.render(window.React.createElement(tools.AiWorkflowTools),node);mount=node;
      const procurementNode=document.createElement('div');procurementNode.dataset.lourexProcurementAiMount='true';compose.insertBefore(procurementNode,form);window.ReactDOM.render(window.React.createElement(procurement.ProcurementAiCompare),procurementNode);procurementMount=procurementNode;
      const memoryNode=document.createElement('div');memoryNode.dataset.lourexBusinessMemoryMount='true';compose.insertBefore(memoryNode,form);window.ReactDOM.render(window.React.createElement(memory.BusinessMemoryTool),memoryNode);memoryMount=memoryNode;
      const searchNode=document.createElement('div');searchNode.dataset.lourexBusinessSearchMount='true';compose.insertBefore(searchNode,form);window.ReactDOM.render(window.React.createElement(search.BusinessSearchTool),searchNode);searchMount=searchNode;
      const dailyNode=document.createElement('div');dailyNode.dataset.lourexDailyCommandCenterMount='true';compose.insertBefore(dailyNode,form);window.ReactDOM.render(window.React.createElement(daily.DailyCommandCenterTool),dailyNode);dailyMount=dailyNode;
      const collectionsNode=document.createElement('div');collectionsNode.dataset.lourexCollectionsAiMount='true';compose.insertBefore(collectionsNode,form);window.ReactDOM.render(window.React.createElement(collections.CollectionsAiTool),collectionsNode);collectionsMount=collectionsNode;
    }catch(error){console.warn('[LOUREX AI workflows] mount skipped',error);node.remove();}finally{mounting=false;}
  }
  function sync(){void syncMount();syncHandoff();}
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('lourex-language-change',sync);sync();
})();
