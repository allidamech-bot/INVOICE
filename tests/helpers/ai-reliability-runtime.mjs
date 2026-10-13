import {readFile} from 'node:fs/promises';
export async function reliabilityRuntimeModules(database){
 const modules={};for(const name of ['ai-local-diagnostics','ai-business-memory-graph','ai-reliability-intelligence'])Object.assign(modules,await import(`../../dist/src/lib/${name}.js`));
 const key='__memoryFixture'+crypto.randomUUID().replaceAll('-','');globalThis[key]=database;
 const source=(await readFile(new URL('../../dist/src/storage/assistant-memory-store.js',import.meta.url),'utf8')).replace(/import \{[^}]*\} from '\.\/db.js';/,`const {getRecord,putRecord}=globalThis.${key};`);
 const memory=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+crypto.randomUUID());delete globalThis[key];
 return {...modules,...memory};
}
export async function compiledReliabilityHarness(vault,router=async()=>null){
 const records=new Map(),database={getRecord:async id=>records.get(id)||null,putRecord:async r=>records.set(r.id,structuredClone(r))};
 const modules=await reliabilityRuntimeModules(database);
 for(const name of ['ai-conversation-kernel','ai-conversation-mode','ai-foundation-approval','ai-assistant-foundation','workspaces','ai-workspace-model','ai-document-review','ai-mission-runner','ai-commercial-conversation','ai-draft-resumption'])Object.assign(modules,await import(`../../dist/src/lib/${name}.js`));
 const key='__storeFixture'+crypto.randomUUID().replaceAll('-','');globalThis[key]=database;
 let source=await readFile(new URL('../../dist/src/storage/assistant-store.js',import.meta.url),'utf8');source=source.replace(/import .* from '.*';/g,line=>line.includes("'./db.js'")?`const {getRecord,putRecord}=globalThis.${key};`:line.replace("'../lib/ai-conversation-kernel.js'",JSON.stringify(new URL('../../dist/src/lib/ai-conversation-kernel.js',import.meta.url).href)).replace("'../lib/ai-conversation-mode.js'",JSON.stringify(new URL('../../dist/src/lib/ai-conversation-mode.js',import.meta.url).href)));
 const store=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+crypto.randomUUID());delete globalThis[key];
 const session={key:await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),vault};
 const runtimeKey='__reliabilityFixture'+crypto.randomUUID().replaceAll('-','');globalThis[runtimeKey]={...modules,...store,activeAccountStorageUid:()=>null,resumeVaultSession:async()=>session,orchestrateAiToolRequest:router};
 source=(await readFile(new URL('../../dist/src/lib/ai-intelligence-runtime.js',import.meta.url),'utf8')).replace(/import \{([\s\S]*?)\} from '[^']+';/g,(_all,names)=>`const {${names}}=globalThis.${runtimeKey};`);
 const runtime=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+crypto.randomUUID());delete globalThis[runtimeKey];
 const host=()=>({props:{screen:'home',language:'ar'},state:{assistantScope:'business',messages:[],proposal:null,error:'',busy:false},__lourexAssistantThreadId:'reliability-thread',__lourexAssistantWorkspaceKey:'default|main',__lourexLoadPromise:Promise.resolve(),setState(update,done){Object.assign(this.state,typeof update==='function'?update(this.state):update);done?.();},async ask(){},async approveProposal(){}});
 return{runtime,host,session,store,memory:modules,records};
}
