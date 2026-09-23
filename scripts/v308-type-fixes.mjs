import {readFile,writeFile} from 'node:fs/promises';

async function edit(path,fn){const source=await readFile(path,'utf8');const next=fn(source);if(next===source)throw new Error(`No change made to ${path}`);await writeFile(path,next);}
function one(source,from,to,label){if(!source.includes(from))throw new Error(`Missing patch anchor: ${label}`);return source.replace(from,to);}

await edit('src/components/AiCopilot.tsx',source=>one(
  source,
  "const active=activeDocument&&activeDocument.kind!=='purchase-order'?",
  "const active=activeDocument&&activeDocument.kind!=='purchase-order'&&activeDocument.kind!=='draft'?",
  'exclude company drafts from legacy AI invoice drafting context'
));

await edit('src/components/DraftDocumentEditor.tsx',source=>{
  source=one(source,
    "private saveAndClose=async()=>{if(this.state.saveState==='saved'){this.props.onClose();return;}await this.save(true);if(this.state.saveState==='saved'||!this.state.error)this.props.onClose();};",
    "private saveAndClose=async()=>{if(this.state.saveState==='saved'){this.props.onClose();return;}await this.save(true);if(!this.state.error)this.props.onClose();};",
    'saveAndClose narrowing');
  source=one(source,
    "private duplicateBlock=(id:string)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const at=letter.blocks.findIndex(block=>block.id===id);if(at<0)return doc;const source=letter.blocks[at];const copy={...source,id:defaultLetterBlock().id};const blocks=[...letter.blocks];blocks.splice(at+1,0,copy);return{...doc,letter:{...letter,blocks}};});",
    "private duplicateBlock=(id:string)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const at=letter.blocks.findIndex(block=>block.id===id);if(at<0)return doc;const source=letter.blocks[at]!;const copy:LetterBlock={...source,id:defaultLetterBlock().id};const blocks=[...letter.blocks];blocks.splice(at+1,0,copy);return{...doc,letter:{...letter,blocks}};});",
    'duplicate block type');
  source=one(source,
    "private moveBlock=(id:string,delta:number)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const blocks=[...letter.blocks];const at=blocks.findIndex(block=>block.id===id),to=at+delta;if(at<0||to<0||to>=blocks.length)return doc;[blocks[at],blocks[to]]=[blocks[to],blocks[at]];return{...doc,letter:{...letter,blocks}};});",
    "private moveBlock=(id:string,delta:number)=>this.mutate(doc=>{const letter=normalizeLetterData(doc.letter,doc.language);const blocks=[...letter.blocks];const at=blocks.findIndex(block=>block.id===id),to=at+delta;if(at<0||to<0||to>=blocks.length)return doc;const current=blocks[at]!,target=blocks[to]!;blocks[at]=target;blocks[to]=current;return{...doc,letter:{...letter,blocks}};});",
    'move block indexed access');
  return source;
});

await edit('src/lib/document-extras.ts',source=>one(
  source,
  "const block=(type:LetterBlock['type'],text:string)=>({...defaultLetterBlock(type,text),direction:rtl?'rtl':'auto' as const,font:font as LetterBlock['font']});",
  "const block=(type:LetterBlock['type'],text:string):LetterBlock=>{const next=defaultLetterBlock(type,text);next.direction=rtl?'rtl':'auto';next.font=font as LetterBlock['font'];return next;};",
  'letter preset block typing'
));

console.log('[LOUREX v308] Type integration fixes applied.');