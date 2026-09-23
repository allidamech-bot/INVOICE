import {readFile,writeFile} from 'node:fs/promises';
const path='src/app/App.tsx';
let source=await readFile(path,'utf8');
const from='<div className="print-portal">{this.state.printDoc?{isLetterDocument(this.state.printDoc)?<DraftDocumentRenderer document={this.state.printDoc} scale={1}/>:<TemplateRenderer document={this.state.printDoc} scale={1}/>} :null}</div>';
const to='<div className="print-portal">{this.state.printDoc?(isLetterDocument(this.state.printDoc)?<DraftDocumentRenderer document={this.state.printDoc} scale={1}/>:<TemplateRenderer document={this.state.printDoc} scale={1}/>):null}</div>';
if(!source.includes(from))throw new Error('Draft print portal anchor not found.');
source=source.replace(from,to);
await writeFile(path,source);
console.log('v308 print portal fixed.');
