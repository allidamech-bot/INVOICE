(()=>{
  'use strict';
  const PENDING='__lourexAiPendingSource';
  let mount=null,procurementMount=null,memoryMount=null,searchMount=null,dailyMount=null,collectionsMount=null,cfoMount=null;
  let mounting=false,handoffBusy=false,productReviewMount=null;
  let guardianReviewMount=null,guardianInFlight=false,guardianBypass=false;

  function validPending(){const value=window[PENDING];if(!value||!value.file||!value.route||Date.now()-Number(value.createdAt||0)>10*60*1000){if(value)delete window[PENDING];return null;}return value;}
  function handoffCustomer(pending){if(!document.querySelector('.ta-customers-page'))return false;window.dispatchEvent(new CustomEvent('lourex-ai-customer-source',{detail:{file:pending.file}}));delete window[PENDING];return true;}
  async function mountProductAiReview(pending){if(productReviewMount||!window.React||!window.ReactDOM)return false;const node=document.createElement('div');node.dataset.lourexAiProductReview='true';document.body.appendChild(node);productReviewMount=node;try{const mod=await import('./src/components/ProductAiSourceReview.js');if(!node.isConnected)return false;const onDone=()=>{try{window.ReactDOM.unmountComponentAtNode(node);}catch{}node.remove();if(productReviewMount===node)productReviewMount=null;};window.ReactDOM.render(window.React.createElement(mod.ProductAiSourceReview,{file:pending.file,onDone}),node);delete window[PENDING];handoffBusy=false;return true;}catch(error){console.warn('[LOUREX AI product review] mount skipped',error);node.remove();if(productReviewMount===node)productReviewMount=null;handoffBusy=false;return false;}}
  function handoffProducts(pending){if(!document.querySelector('.ta-product-library'))return false;void mountProductAiReview(pending);return true;}
  function syncHandoff(){const pending=validPending();if(!pending||handoffBusy)return;handoffBusy=true;const started=pending.route==='customer'?handoffCustomer(pending):pending.route==='product_list'?handoffProducts(pending):false;if(!started)handoffBusy=false;else if(pending.route==='customer')handoffBusy=false;}

  function currentEntityContext(){
    const customer=document.querySelector('.ta-customer-profile .ta-customer-profile-hero h1')?.textContent?.trim();
    if(customer)return`Customer: ${customer}`;
    const product=document.querySelector('.ta-product-editor.is-open .ta-product-editor-header h2')?.textContent?.trim();
    if(product)return`Product: ${product}`;
    const purchase=document.querySelector('.ta-ops-editor .ta-ops-editor-head h2')?.textContent?.trim();
    if(purchase)return`Purchasing workspace: ${purchase}`;
    const reports=document.querySelector('.ta-reports-page');
    if(reports){const dates=Array.from(reports.querySelectorAll('.ta-report-date input[type="date"]')).map(node=>node instanceof HTMLInputElement?node.value:'');const currency=reports.querySelector('.ta-report-currency select');const selectedCurrency=currency instanceof HTMLSelectElement?currency.value:'ALL';return`Reports period: ${dates[0]||'all'} to ${dates[1]||'current'}; currency filter: ${selectedCurrency||'ALL'} (currencies remain separate)`;}
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

  function quoteSourceFromModal(modal){
    const fileInput=modal.querySelector('input[type="file"]');
    if(fileInput instanceof HTMLInputElement&&fileInput.files?.[0])return fileInput.files[0];
    const text=Array.from(modal.querySelectorAll('textarea')).map(node=>node.value.trim()).find(Boolean);
    return text?new File([text],'Quote-RFQ-Source.txt',{type:'text/plain'}):null;
  }
  function installQuoteCustomerBridge(){
    const paragraphs=Array.from(document.querySelectorAll('.modal-body p'));
    const marker=paragraphs.find(node=>{const text=(node.textContent||'').trim();return text.includes('No unique exact saved customer match')||text.includes('لا توجد مطابقة دقيقة وفريدة مع عميل محفوظ')||text.includes('No exact saved customer match')||text.includes('لا توجد مطابقة دقيقة مع عميل محفوظ');});
    if(!(marker instanceof HTMLElement)||marker.dataset.lourexCustomerBridge==='true')return;
    const modal=marker.closest('.modal');if(!(modal instanceof HTMLElement))return;const source=quoteSourceFromModal(modal);if(!source)return;
    marker.dataset.lourexCustomerBridge='true';
    const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.dataset.lourexQuoteCustomerBridge='true';button.innerHTML=`<span>${document.documentElement.dir==='rtl'?'مراجعة / إنشاء العميل عبر Customer AI':'Review / Create Customer with Customer AI'}</span>`;
    button.addEventListener('click',()=>{
      window[PENDING]={route:'customer',file:source,createdAt:Date.now()};
      const close=modal.querySelector('.modal-header .icon-btn');if(close instanceof HTMLButtonElement)close.click();
      window.setTimeout(()=>window.dispatchEvent(new CustomEvent('lourex-global-action',{detail:{action:'navigate',target:'customers'}})),0);
    });
    marker.insertAdjacentElement('afterend',button);
  }

  function purchasePostButton(event){
    const target=event.target instanceof Element?event.target.closest('button'):null;
    if(!(target instanceof HTMLButtonElement)||!target.closest('.ta-ops-purchase-editor .ta-ops-editor-actions'))return null;
    const text=(target.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
    return text.includes('post purchase')||text.includes('ترحيل الشراء')?target:null;
  }
  function cleanupGuardian(){if(!guardianReviewMount)return;try{window.ReactDOM?.unmountComponentAtNode(guardianReviewMount);}catch{}guardianReviewMount.remove();guardianReviewMount=null;}
  function resumeNativePost(button){cleanupGuardian();if(!button.isConnected)return;guardianBypass=true;try{button.click();}finally{guardianBypass=false;}}
  async function interceptPurchasePost(event){
    if(guardianBypass||guardianInFlight||guardianReviewMount)return;
    const button=purchasePostButton(event);if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();guardianInFlight=true;
    try{
      const mod=await import('./src/components/PurchasePostGuardian.js');
      const prepared=await mod.preparePurchasePostGuardian(button);
      if(!prepared){resumeNativePost(button);return;}
      if(!window.React||!window.ReactDOM){resumeNativePost(button);return;}
      const node=document.createElement('div');node.dataset.lourexPurchaseGuardian='true';document.body.appendChild(node);guardianReviewMount=node;
      const onCancel=()=>cleanupGuardian();const onContinue=()=>resumeNativePost(button);
      window.ReactDOM.render(window.React.createElement(mod.PurchasePostGuardian,{review:prepared.review,purchaseNumber:prepared.purchaseNumber,onCancel,onContinue}),node);
    }catch(error){console.warn('[LOUREX Purchase Guardian] review skipped safely',error);resumeNativePost(button);}finally{guardianInFlight=false;}
  }

  async function syncMount(){
    if(mount&&!mount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(mount);}catch{}mount=null;}
    if(procurementMount&&!procurementMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(procurementMount);}catch{}procurementMount=null;}
    if(memoryMount&&!memoryMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(memoryMount);}catch{}memoryMount=null;}
    if(searchMount&&!searchMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(searchMount);}catch{}searchMount=null;}
    if(dailyMount&&!dailyMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(dailyMount);}catch{}dailyMount=null;}
    if(collectionsMount&&!collectionsMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(collectionsMount);}catch{}collectionsMount=null;}
    if(cfoMount&&!cfoMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(cfoMount);}catch{}cfoMount=null;}
    const panel=document.getElementById('lourex-ai-panel');if(!panel||mount||mounting)return;const compose=panel.querySelector('.lourex-ai-compose');const form=compose?.querySelector('form');if(!compose||!form||!window.React||!window.ReactDOM)return;
    installContextBridge(compose);
    mounting=true;const node=document.createElement('div');node.dataset.lourexAiWorkflowMount='true';compose.insertBefore(node,form);
    try{
      const [tools,procurement,memory,search,daily,collections,cfo]=await Promise.all([import('./src/components/AiWorkflowTools.js'),import('./src/components/ProcurementAiCompare.js'),import('./src/components/BusinessMemoryTool.js'),import('./src/components/BusinessSearchTool.js'),import('./src/components/DailyCommandCenterTool.js'),import('./src/components/CollectionsAiTool.js'),import('./src/components/CfoScenarioTool.js')]);if(!node.isConnected)return;
      window.ReactDOM.render(window.React.createElement(tools.AiWorkflowTools),node);mount=node;
      const hiddenProps={launcher:false};
      const procurementNode=document.createElement('div');procurementNode.dataset.lourexProcurementAiMount='true';compose.insertBefore(procurementNode,form);window.ReactDOM.render(window.React.createElement(procurement.ProcurementAiCompare,hiddenProps),procurementNode);procurementMount=procurementNode;
      const memoryNode=document.createElement('div');memoryNode.dataset.lourexBusinessMemoryMount='true';compose.insertBefore(memoryNode,form);window.ReactDOM.render(window.React.createElement(memory.BusinessMemoryTool,hiddenProps),memoryNode);memoryMount=memoryNode;
      const searchNode=document.createElement('div');searchNode.dataset.lourexBusinessSearchMount='true';compose.insertBefore(searchNode,form);window.ReactDOM.render(window.React.createElement(search.BusinessSearchTool,hiddenProps),searchNode);searchMount=searchNode;
      const dailyNode=document.createElement('div');dailyNode.dataset.lourexDailyCommandCenterMount='true';compose.insertBefore(dailyNode,form);window.ReactDOM.render(window.React.createElement(daily.DailyCommandCenterTool,hiddenProps),dailyNode);dailyMount=dailyNode;
      const collectionsNode=document.createElement('div');collectionsNode.dataset.lourexCollectionsAiMount='true';compose.insertBefore(collectionsNode,form);window.ReactDOM.render(window.React.createElement(collections.CollectionsAiTool,hiddenProps),collectionsNode);collectionsMount=collectionsNode;
      const cfoNode=document.createElement('div');cfoNode.dataset.lourexCfoScenarioMount='true';compose.insertBefore(cfoNode,form);window.ReactDOM.render(window.React.createElement(cfo.CfoScenarioTool,hiddenProps),cfoNode);cfoMount=cfoNode;
    }catch(error){console.warn('[LOUREX AI workflows] mount skipped',error);node.remove();}finally{mounting=false;}
  }
  function sync(){void syncMount();syncHandoff();installQuoteCustomerBridge();}
  document.addEventListener('click',event=>{void interceptPurchasePost(event);},true);
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('lourex-language-change',sync);sync();
})();
