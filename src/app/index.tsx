import { App } from './App.js';

const root=document.getElementById('root');
if(!root)throw new Error('Root element not found.');
ReactDOM.render(<App/>,root);
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>undefined));}
