import type { LetterBlock, LetterDocumentData, LourexDocument } from '../types.js';
import { displayDate } from '../lib/id.js';
import { defaultLetterData, defaultWatermark, normalizeLetterData, normalizeWatermark } from '../lib/document-extras.js';

interface Props { document:LourexDocument; scale?:number; compact?:boolean; }

const FONT_STACKS:Record<LetterBlock['font'],string>={
  system:'-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif',inter:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
  'source-sans':'"Source Sans 3","Segoe UI",sans-serif',montserrat:'Montserrat,"Segoe UI",sans-serif',playfair:'"Playfair Display",Georgia,serif',
  cairo:'Cairo,Tajawal,Arial,sans-serif',tajawal:'Tajawal,Cairo,Arial,sans-serif','noto-kufi':'"Noto Kufi Arabic",Cairo,Arial,sans-serif','noto-naskh':'"Noto Naskh Arabic",serif'
};

function splitLongBlock(block:LetterBlock):LetterBlock[]{
  const text=block.text||'';
  const limit=block.type==='heading'?420:block.type==='subheading'?650:1700;
  if(text.length<=limit)return[block];
  const parts:LetterBlock[]=[];
  let rest=text;
  let index=0;
  while(rest.length){
    if(rest.length<=limit){parts.push({...block,id:`${block.id}-part-${index}`,text:rest});break;}
    let cut=rest.lastIndexOf('\n',limit);
    if(cut<limit*.55)cut=rest.lastIndexOf(' ',limit);
    if(cut<limit*.55)cut=limit;
    parts.push({...block,id:`${block.id}-part-${index}`,text:rest.slice(0,cut).trim(),spacingAfter:2});
    rest=rest.slice(cut).trimStart();index+=1;
  }
  return parts;
}

function blockWeight(block:LetterBlock):number{
  if(block.type==='spacer')return .45;
  const chars=Math.max(1,block.text.length);
  const lines=Math.ceil(chars/(block.size>=22?44:block.size>=17?62:86));
  return Math.max(.65,lines*(block.lineHeight*.48)+(block.spacingBefore+block.spacingAfter)/35);
}

function paginate(letter:LetterDocumentData):LetterBlock[][]{
  const source=letter.blocks.flatMap(splitLongBlock);
  if(!source.length)return [[]];
  const pages:LetterBlock[][]=[];let current:LetterBlock[]=[];let weight=0;
  const capacity=(pageIndex:number)=>pageIndex===0?11.6:13.2;
  for(const block of source){
    const w=blockWeight(block);
    if(current.length&&weight+w>capacity(pages.length)){pages.push(current);current=[];weight=0;}
    current.push(block);weight+=w;
  }
  if(current.length)pages.push(current);
  return pages.length?pages:[[]];
}

function Watermark({document:doc}:{document:LourexDocument}):any{
  const watermark=normalizeWatermark(doc.appearance.watermark??defaultWatermark());
  if(!watermark.enabled)return null;
  const useLogo=watermark.type==='logo'&&Boolean(doc.companySnapshot.logoDataUrl);
  const content=useLogo?<img src={doc.companySnapshot.logoDataUrl} alt=""/>:<span>{watermark.text||'DRAFT'}</span>;
  const style={ '--wm-opacity':String(watermark.opacity),'--wm-color':watermark.color,'--wm-angle':`${watermark.angle}deg`,'--wm-size':`${watermark.size}px`} as any;
  if(watermark.pattern==='repeat')return <div className="document-custom-watermark is-repeat" style={style} aria-hidden="true">{Array.from({length:9},(_,index)=><span className="wm-tile" key={index}>{useLogo?<img src={doc.companySnapshot.logoDataUrl} alt=""/>:<b>{watermark.text||'DRAFT'}</b>}</span>)}</div>;
  return <div className={`document-custom-watermark ${useLogo?'is-logo':'is-text'}`} style={style} aria-hidden="true">{content}</div>;
}

function CompanyHeader({doc,letter}:{doc:LourexDocument;letter:LetterDocumentData}):any{
  const company=doc.companySnapshot;
  const companyName=doc.language==='ar'?(company.nameAr||company.nameEn):(company.nameEn||company.nameAr);
  const address=doc.language==='ar'?(company.addressAr||company.addressEn):(company.addressEn||company.addressAr);
  const details=[address,[company.city,company.country].filter(Boolean).join(', '),company.phone,company.email,company.website].filter(Boolean);
  return <header className="letterhead-header">
    <div className="letterhead-brand">{letter.showLogo&&company.logoDataUrl?<img src={company.logoDataUrl} alt={companyName||'Company logo'}/>:null}<div><strong>{companyName||'LOUREX'}</strong>{letter.showCompanyDetails&&details.length?<span>{details.join(' · ')}</span>:null}</div></div>
    <span className="letterhead-accent"/>
  </header>;
}

function LetterMeta({doc,letter}:{doc:LourexDocument;letter:LetterDocumentData}):any{
  const rows=[
    letter.recipient?['To','إلى',letter.recipient]:null,
    letter.attention?['Attention','عناية',letter.attention]:null,
    letter.subject?['Subject','الموضوع',letter.subject]:null,
    letter.showReference&&letter.reference?['Reference','المرجع',letter.reference]:null,
    letter.showDate?['Date','التاريخ',displayDate(doc.issueDate,doc.language)]:null
  ].filter(Boolean) as string[][];
  if(!rows.length)return null;
  return <section className="letter-meta">{rows.map(([en,ar,value])=><div key={en}><b>{doc.language==='ar'?ar:en}</b><span dir="auto">{value}</span></div>)}</section>;
}

function Block({block}:{block:LetterBlock}):any{
  const style={fontFamily:FONT_STACKS[block.font],fontSize:`${block.size}px`,color:block.color,fontWeight:block.bold?800:400,fontStyle:block.italic?'italic':'normal',textDecoration:block.underline?'underline':'none',lineHeight:block.lineHeight,marginTop:`${block.spacingBefore}px`,marginBottom:`${block.spacingAfter}px`,textAlign:block.align==='start'?'start':block.align==='end'?'end':block.align} as any;
  if(block.type==='spacer')return <div className="letter-block letter-block-spacer" style={{height:`${Math.max(12,block.spacingAfter+12)}px`}}/>;
  const Tag=block.type==='heading'?'h1':block.type==='subheading'?'h2':block.type==='quote'?'blockquote':block.type==='bullet'?'div':'p';
  return <Tag className={`letter-block block-${block.type}`} dir={block.direction} style={style}>{block.type==='bullet'?<><span className="letter-bullet">•</span><span>{block.text}</span></>:block.text||' '}</Tag>;
}

function Footer({doc,letter,pageIndex,totalPages}:{doc:LourexDocument;letter:LetterDocumentData;pageIndex:number;totalPages:number}):any{
  if(letter.footerStyle==='none')return <footer className="letterhead-footer footer-none"><span>{pageIndex+1} / {totalPages}</span></footer>;
  const company=doc.companySnapshot;
  const text=letter.footerStyle==='company'?(company.footerText||[company.phone,company.email,company.website].filter(Boolean).join(' · ')):'';
  return <footer className={`letterhead-footer footer-${letter.footerStyle}`}><span dir="auto">{text}</span><b>{pageIndex+1} / {totalPages}</b></footer>;
}

function SignatureArea({doc,letter}:{doc:LourexDocument;letter:LetterDocumentData}):any{
  if(!letter.showSignature&&!letter.showStamp)return null;
  if(!doc.companySnapshot.signatureDataUrl&&!doc.companySnapshot.stampDataUrl)return null;
  return <div className="letter-signing">{letter.showSignature&&doc.companySnapshot.signatureDataUrl?<div><img src={doc.companySnapshot.signatureDataUrl} alt="Signature"/><span>{doc.language==='ar'?'التوقيع':'Signature'}</span></div>:null}{letter.showStamp&&doc.companySnapshot.stampDataUrl?<div><img src={doc.companySnapshot.stampDataUrl} alt="Stamp"/><span>{doc.language==='ar'?'الختم':'Stamp'}</span></div>:null}</div>;
}

export function DraftDocumentRenderer({document:doc,scale=1,compact=false}:Props):any{
  const letter=normalizeLetterData(doc.letter??defaultLetterData(doc.language),doc.language);
  const pages=paginate(letter);
  const direction=doc.language==='ar'?'rtl':'ltr';
  return <div className="invoice-pages draft-letter-pages" style={{'--preview-scale':String(scale),'--letter-accent':letter.accentColor} as any}>
    {pages.map((blocks,pageIndex)=><article key={`${doc.id}-letter-${pageIndex}`} className={`invoice-page draft-letter-page page-${letter.pageStyle} header-${letter.headerStyle} footer-${letter.footerStyle} width-${letter.bodyWidth} ${compact?'compact-preview':''}`} dir={direction} data-kind="draft" data-page={pageIndex+1}>
      <Watermark document={doc}/><CompanyHeader doc={doc} letter={letter}/>
      <main className="letter-page-body">{pageIndex===0?<LetterMeta doc={doc} letter={letter}/>:<div className="letter-continuation"><span>{doc.number}</span></div>}<div className="letter-blocks">{blocks.map(block=><Block key={block.id} block={block}/>)}</div>{pageIndex===pages.length-1?<SignatureArea doc={doc} letter={letter}/>:null}</main>
      <Footer doc={doc} letter={letter} pageIndex={pageIndex} totalPages={pages.length}/>
    </article>)}
  </div>;
}
