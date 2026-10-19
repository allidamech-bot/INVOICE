import type {FinancialReadout,FinancialFact} from '../lib/ai-financial-readout.js';

/** The only DOM owner for a local financial chat readout.
 * No Markdown, HTML injection, or secondary React-node reconstruction.
 * Numbers come directly from recorded tool evidence. */
const factRows=(facts:FinancialFact[])=><dl className="lxbr-facts">{facts.map((row,i)=>
  <div className="lxbr-fact" key={i}>
    {row.label?<dt>{row.label}</dt>:null}
    <dd><bdi dir="auto">{row.value}</bdi></dd>
  </div>)}</dl>;

export function AiFinancialReadout({readout,language}:{readout:FinancialReadout;language:'ar'|'en'}):any{
 const ar=language==='ar';
 return <article className="lxbr" dir={ar?'rtl':'ltr'} aria-label={ar?'تفاصيل السجل المالي':'Financial record details'}>
  <header className="lxbr-heading">
   <span className="lxbr-eyebrow">{ar?'من سجلات LOUREX':'From LOUREX records'}</span>
   <h3 dir="auto">{readout.title}</h3>
   {readout.party?<p className="lxbr-party"><bdi dir="auto">{readout.party}</bdi></p>:null}
  </header>
  {readout.intro.length?factRows(readout.intro):null}
  {readout.sections.map((section,i)=><section className="lxbr-section" key={i} aria-label={section.title}>
   <h4>{section.title}</h4>
   {section.facts.length?factRows(section.facts):null}
   {section.movements.length?<ol className="lxbr-ledger">{section.movements.map((row,j)=>
    <li key={j}>
     <div className="lxbr-entry-head"><strong>{row.label}</strong><span><bdi dir="auto">{row.date}</bdi></span></div>
     <p className="lxbr-reference"><bdi dir="auto">{row.reference}</bdi></p>
     {row.amount?<p className="lxbr-amount" dir="auto">{row.amount}</p>:null}
     {row.balance?<p className="lxbr-balance" dir="auto">{row.balance}</p>:null}
    </li>)}</ol>:null}
   {section.notes.map((note,j)=><p className="lxbr-note" key={j} dir="auto">{note}</p>)}
  </section>)}
  {readout.itemsTitle?<details className="lxbr-items">
   <summary><span>{readout.itemsTitle}</span><span className="lxbr-chevron" aria-hidden="true">⌄</span></summary>
   <div className="lxbr-item-content">
    <ol>{readout.items.map((item,i)=><li key={i} dir="auto">{item}</li>)}</ol>
    {readout.partial?<p className="lxbr-note">{ar?'الأصناف المعروضة جزئية؛ افتح المستند الأصلي لمراجعة جميع البنود.':'The list is partial; open the original document to review all items.'}</p>:null}
   </div>
  </details>:null}
 </article>;
}
