import { AiPowerBridge } from '../components/AiPowerBridge.js';

function mountAiPowerBridge():void{
  if(document.getElementById('lourex-ai-power-root'))return;
  const mount=document.createElement('div');
  mount.id='lourex-ai-power-root';
  mount.setAttribute('aria-hidden','false');
  document.body.appendChild(mount);
  ReactDOM.render(<AiPowerBridge/>,mount);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountAiPowerBridge,{once:true});
else mountAiPowerBridge();
