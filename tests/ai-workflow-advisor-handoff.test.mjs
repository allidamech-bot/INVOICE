import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('AI workflow handoff submits only to an active Advisor and preserves an unsent draft',async()=>{
  const listeners=new Map();
  const windowMock={
    visualViewport:{addEventListener(){},removeEventListener(){}},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},
    setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,
    innerHeight:800,requestAnimationFrame:(fn)=>fn()
  };
  const prevWindow=globalThis.window,prevReact=globalThis.React;
  globalThis.window=windowMock;
  globalThis.React={};
  try{
    const {installConversationWorkspace,unmountConversationWorkspace}=await import('../dist/src/components/AiConversationWorkspace.js');
    const host={
      mounted:true,props:{screen:'reports',language:'ar'},
      state:{open:true,input:'',busy:false,attachmentBusy:false,proposal:null},
      __intelligenceKernel:{mode:'advisor',scope:{scope:'business',accountId:'account-A',workspaceId:'default',branchId:'main',threadId:'advisor-1'}},
      sent:[],
      toggle(){this.state.open=!this.state.open;},
      dismissProposal(){},
      async ask(text){this.sent.push(text);},
      setState(value,done){Object.assign(this.state,typeof value==='function'?value(this.state):value);done?.();}
    };
    installConversationWorkspace(host);
    const handler=listeners.get('lourex-ai-workflow-advisor');
    assert.equal(typeof handler,'function','workflow event must be registered by the workspace owner');
    const allow={detail:{prompt:'تحليل أسعار الموردين',submit:true,handled:false}};
    handler(allow);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(allow.detail.handled,true);
    assert.deepEqual(host.sent,['تحليل أسعار الموردين']);
    assert.equal(host.__intelligenceKernel.mode,'advisor','workflow must not grant Controller execution');
    host.state.input='مسودة غير مرسلة';
    const blocked={detail:{prompt:'طلب جديد',submit:true,handled:false}};
    handler(blocked);
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(blocked.detail.handled,true);
    assert.deepEqual(host.sent,['تحليل أسعار الموردين'],'pending Advisor draft prevents silent replacement and submission');
    assert.match(host.state.error,/unsent message/);
    assert.equal(host.state.input,'مسودة غير مرسلة');
    host.state.input='';
    host.__intelligenceKernel.scope={...host.__intelligenceKernel.scope,scope:'personal'};
    handler({detail:{prompt:'Try unsafe context',submit:true,handled:false}});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(host.sent.length,1,'handoff is denied outside the Business conversation');
    unmountConversationWorkspace(host);
    assert.equal(listeners.has('lourex-ai-workflow-advisor'),false,'unmount must clear the global event listener');
  }finally{
    if(prevReact===undefined)delete globalThis.React;else globalThis.React=prevReact;
    if(prevWindow===undefined)delete globalThis.window;else globalThis.window=prevWindow;
  }
});

test('AI workflow panel no longer directly submits to an arbitrary mode or hidden input',async()=>{
  const [tools,workspace]=await Promise.all([
    readFile(new URL('../src/components/AiWorkflowTools.tsx',import.meta.url),'utf8'),
    readFile(new URL('../src/components/AiConversationWorkspace.tsx',import.meta.url),'utf8')
  ]);
  assert.match(tools,/lourex-ai-workflow-advisor/);
  assert.match(tools,/\.lourex-ai-premium-textarea/,'voice text goes into the visible composer first');
  const method=tools.slice(tools.indexOf('private runMode='),tools.indexOf('private search='));
  assert.doesNotMatch(method,/advisorInput\(/,'workflow execution must use the selected-mode owner');
  assert.match(method,/if\(!detail\.handled\)/,'missing workspace is visible to the user');
  assert.match(workspace,/await host\.__workspaceSwitchMode\('advisor'\)/);
  assert.match(workspace,/normalizeAiConversationMode\(selected\.mode\)!=='advisor'/);
  assert.match(workspace,/Advisor has an unsent message/);
});
