/**
 * Test-only browser harness. This runs the existing R06 component with its
 * static-disabled flag replaced IN MEMORY, never in the checked-in app source.
 * It is NOT an R07N production mount and has no Firebase/provider/finance API.
 */
import {build} from 'esbuild';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=process.cwd(),out=resolve(root,'.tmp/ai-next-r06-mobile');
mkdirSync(out,{recursive:true});
const path=resolve(root,'src/ai-next/ui/view-model.ts');
const original=readFileSync(path,'utf8');
const gate='export const R06_NEXT_CONVERSATION_ENABLED=false as const;';
if(original.split(gate).length!==2)
  throw Error('R06_UNMOUNTED_GATE_CHANGED_MANUAL_REVIEW_REQUIRED');
const html=`<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>R06 WebKit isolated mobile QA ONLY</title>
<style>*{box-sizing:border-box}body{font:14px Arial,sans-serif;margin:0;background:#eef4f1}#root{padding:4px}</style>
</head><body><div id="root"></div>
<script src="./bundle.js"></script></body></html>`;
writeFileSync(resolve(out,'index.html'),html);
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {NextConversationWorkspace} from './src/ai-next/ui/NextConversationWorkspace.tsx';
import {R06_NEXT_CONVERSATION_ENABLED} from './src/ai-next/ui/view-model.ts';
globalThis.React=React;
const scope={ownerUid:'test-owner',actorId:'test-owner',accountId:'test-account',
 companyId:'test-company',branchId:'test-branch',threadId:'test-thread',
 scopeType:'business',role:'owner',authorizationVersion:1};
globalThis.__qa={sent:[],failNext:false,uploadAttempts:0,seedMessages:null,
  gateValue:R06_NEXT_CONVERSATION_ENABLED};
function Harness(){
  const [mode,setMode]=React.useState('controller');
  const [messages,setMessages]=React.useState([]);
  globalThis.__qa.seedMessages=n=>setMessages(Array.from({length:n},(_,i)=>({
    messageId:'qa-message-'+i,turnId:'qa-turn-'+i,role:i%2?'assistant':'user',
    text:'اختبار رسالة رقم '+i+' mixed 42 USD',createdAt:'2026-11-02T10:00:00Z',
    sourceIds:[]
  })));
  const view={scope,threadId:scope.threadId,messages,attachments:[],
    currentTask:null,draft:null,memories:[]};
  const unsupported=async()=>{throw Error('UNAVAILABLE_BY_DESIGN');};
  return React.createElement(NextConversationWorkspace,{
    scope,view,mode,onModeChange:setMode,
    onSend:async ({text,mode:sentMode,sourceIds,signal})=>{
      if(signal.aborted)return {accepted:false};
      globalThis.__qa.sent.push({text,mode:sentMode,sourceIds});
      if(globalThis.__qa.failNext){globalThis.__qa.failNext=false;
        return {accepted:false};}
      setMessages(old=>[...old,{
        messageId:'user-new-'+old.length,turnId:'turn-new-'+old.length,
        role:'user',text,createdAt:'2026-11-02T10:00:00Z',sourceIds:[]
      },{
        messageId:'assistant-new-'+old.length,turnId:'turn-new-'+old.length,
        role:'assistant',text:'تم استلام الرسالة فقط، دون تنفيذ مالي.',
        createdAt:'2026-11-02T10:00:01Z',sourceIds:[]
      }]);
      return {accepted:true};
    },
    onSelectFiles:async()=>{globalThis.__qa.uploadAttempts++;throw Error('UPLOAD_DISABLED');},
    onSelectSource:()=>{},onEditDraft:unsupported,onUndoDraft:unsupported,
    onRedoDraft:unsupported,onDiscardDraft:unsupported,
    onRequestReview:unsupported,onCancelTask:unsupported,onRetryTask:unsupported,
    onRevokeMemory:unsupported
  });
}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'r06-qa-entry.ts',loader:'ts'},
  bundle:true,platform:'browser',format:'iife',target:'es2022',
  jsx:'transform',jsxFactory:'React.createElement',
  outfile:resolve(out,'bundle.js'),logLevel:'warning',
  plugins:[{name:'test-only-r06-gate',setup(bundle){
    bundle.onLoad({filter:/[\\/]ai-next[\\/]ui[\\/]view-model\.ts$/},
      ({path:filename})=>({contents:readFileSync(filename,'utf8')
        .replace(gate,'export const R06_NEXT_CONVERSATION_ENABLED=true as boolean;'),
        loader:'ts'}));
  }}]
});
console.log('R06 WebKit test-only bundle built; application feature gate unchanged');
