(()=>{
  'use strict';
  const PENDING='__lourexAiPendingSource';
  let mount=null;
  let procurementMount=null;
  let memoryMount=null;
  let mounting=false;
  let handoffBusy=false;
  let productReviewMount=null;

  function validPending(){
    const value=window[PENDING];
    if(!value||!value.file||!value.route||Date.now()-Number(value.createdAt||0)>10*60*1000){
      if(value)delete window[PENDING];
      return null;
    }
    return value;
  }

  function assignFile(input,file){
    try{
      const transfer=new DataTransfer();
      transfer.items.add(file);
      input.files=transfer.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
      return true;
    }catch{return false;}
  }

  function later(fn,attempt=0){
    if(attempt>30){handoffBusy=false;return;}
    window.setTimeout(()=>{if(fn()){handoffBusy=false;return;}later(fn,attempt+1);},80);
  }

  function handoffCustomer(pending){
    const page=document.querySelector('.ta-customers-page');
    if(!page)return false;
    const button=page.querySelector('.ta-customers-header .ta-customer-modal-actions > button');
    if(!button)return false;
    button.click();
    later(()=>{
      const input=Array.from(document.querySelectorAll('input[type="file"][multiple]')).find(node=>node instanceof HTMLInputElement);
      if(!(input instanceof HTMLInputElement))return false;
      if(!assignFile(input,pending.file))return false;
      delete window[PENDING];
      return true;
    });
    return true;
  }

  function spreadsheetSource(file){return /\.(xlsx|xls|csv)$/i.test(String(file?.name||''));}

  async function mountProductAiReview(pending){
    if(productReviewMount||!window.React||!window.ReactDOM)return false;
    const node=document.createElement('div');
    node.dataset.lourexAiProductReview='true';
    document.body.appendChild(node);
    productReviewMount=node;
    try{
      const mod=await import('./src/components/ProductAiSourceReview.js');
      if(!node.isConnected)return false;
      const onDone=()=>{
        try{window.ReactDOM.unmountComponentAtNode(node);}catch{}
        node.remove();
        if(productReviewMount===node)productReviewMount=null;
      };
      window.ReactDOM.render(window.React.createElement(mod.ProductAiSourceReview,{file:pending.file,onDone}),node);
      delete window[PENDING];
      handoffBusy=false;
      return true;
    }catch(error){
      console.warn('[LOUREX AI product review] mount skipped',error);
      node.remove();
      if(productReviewMount===node)productReviewMount=null;
      handoffBusy=false;
      return false;
    }
  }

  function handoffProducts(pending){
    const page=document.querySelector('.ta-product-library');
    if(!page)return false;
    if(!spreadsheetSource(pending.file)){
      void mountProductAiReview(pending);
      return true;
    }
    const button=page.querySelector('.ta-product-commandbar > button');
    if(!(button instanceof HTMLButtonElement))return false;
    button.click();
    later(()=>{
      const input=document.querySelector('.product-import-file-input');
      if(!(input instanceof HTMLInputElement))return false;
      if(!assignFile(input,pending.file))return false;
      delete window[PENDING];
      return true;
    });
    return true;
  }

  function syncHandoff(){
    const pending=validPending();
    if(!pending||handoffBusy)return;
    handoffBusy=true;
    const started=pending.route==='customer'?handoffCustomer(pending):pending.route==='product_list'?handoffProducts(pending):false;
    if(!started)handoffBusy=false;
  }

  async function syncMount(){
    if(mount&&!mount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(mount);}catch{}mount=null;}
    if(procurementMount&&!procurementMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(procurementMount);}catch{}procurementMount=null;}
    if(memoryMount&&!memoryMount.isConnected){try{window.ReactDOM?.unmountComponentAtNode(memoryMount);}catch{}memoryMount=null;}
    const panel=document.getElementById('lourex-ai-panel');
    if(!panel||mount||mounting)return;
    const compose=panel.querySelector('.lourex-ai-compose');
    const form=compose?.querySelector('form');
    if(!compose||!form||!window.React||!window.ReactDOM)return;
    mounting=true;
    const node=document.createElement('div');
    node.dataset.lourexAiWorkflowMount='true';
    compose.insertBefore(node,form);
    try{
      const [tools,procurement,memory]=await Promise.all([
        import('./src/components/AiWorkflowTools.js'),
        import('./src/components/ProcurementAiCompare.js'),
        import('./src/components/BusinessMemoryTool.js')
      ]);
      if(!node.isConnected)return;
      window.ReactDOM.render(window.React.createElement(tools.AiWorkflowTools),node);
      mount=node;
      const procurementNode=document.createElement('div');
      procurementNode.dataset.lourexProcurementAiMount='true';
      compose.insertBefore(procurementNode,form);
      window.ReactDOM.render(window.React.createElement(procurement.ProcurementAiCompare),procurementNode);
      procurementMount=procurementNode;
      const memoryNode=document.createElement('div');
      memoryNode.dataset.lourexBusinessMemoryMount='true';
      compose.insertBefore(memoryNode,form);
      window.ReactDOM.render(window.React.createElement(memory.BusinessMemoryTool),memoryNode);
      memoryMount=memoryNode;
    }catch(error){
      console.warn('[LOUREX AI workflows] mount skipped',error);
      node.remove();
    }finally{mounting=false;}
  }

  function sync(){void syncMount();syncHandoff();}
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('lourex-language-change',sync);
  sync();
})();
