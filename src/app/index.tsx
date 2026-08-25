import { App } from './App.js';
import { startCloudFreshnessWatcher } from '../cloud/freshness.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
ReactDOM.render(<App/>,root);
startCloudFreshnessWatcher();
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>undefined));}
