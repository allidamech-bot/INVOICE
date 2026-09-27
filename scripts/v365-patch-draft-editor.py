from pathlib import Path

PATH=Path('src/components/DraftDocumentEditor.tsx')
text=PATH.read_text()

if 'TemplateThumbnails' in text and 'DRAFT_PURPOSES' in text and 'DraftPdfDesign' not in text:
    raise SystemExit(0)

def replace_once(old:str,new:str)->None:
    global text
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'Expected exactly one target, got {count}: {old[:100]!r}')
    text=text.replace(old,new,1)

replace_once(
    "import type { CompanySettings, LetterBlock, LetterDocumentData, LourexDocument } from '../types.js';",
    "import type { CompanySettings, LetterBlock, LetterDocumentData, LourexDocument, TemplateId } from '../types.js';"
)
replace_once(
    "import { DraftDocumentRenderer } from './DraftDocumentRenderer.js';",
    "import { DraftDocumentRenderer } from './DraftDocumentRenderer.js';\nimport { TemplateThumbnails } from '../templates/TemplateThumbnails.js';"
)

start=text.index("type DraftPdfDesign='executive'|'minimal'|'commercial'|'official';")
end=text.index('const IOS_WEBKIT',start)
constants="""const DRAFT_PURPOSES:Array<{id:LetterDocumentData['preset'];nameEn:string;nameAr:string;descriptionEn:string;descriptionAr:string}>=[
  {id:'blank',nameEn:'Blank Page',nameAr:'صفحة حرة',descriptionEn:'Start with a clean company page.',descriptionAr:'ابدأ بصفحة شركة نظيفة.'},
  {id:'company-letter',nameEn:'Company Letter',nameAr:'خطاب شركة',descriptionEn:'General external company correspondence.',descriptionAr:'مراسلات الشركة الخارجية العامة.'},
  {id:'letter-of-intent',nameEn:'Letter of Intent',nameAr:'خطاب نوايا',descriptionEn:'Intent, sourcing and commercial-interest letters.',descriptionAr:'خطابات النوايا والتوريد والاهتمام التجاري.'},
  {id:'formal-letter',nameEn:'Formal Letter',nameAr:'خطاب رسمي',descriptionEn:'Recipient, subject and formal closing.',descriptionAr:'مستلم وموضوع وخاتمة رسمية.'},
  {id:'memo',nameEn:'Memo',nameAr:'مذكرة',descriptionEn:'Structured internal company memo.',descriptionAr:'مذكرة داخلية منظمة.'},
  {id:'notice',nameEn:'Notice',nameAr:'إشعار',descriptionEn:'Clear official company announcement.',descriptionAr:'إشعار شركة رسمي وواضح.'}
];
const draftPurposeLabel=(preset:LetterDocumentData['preset'])=>DRAFT_PURPOSES.find(item=>item.id===preset)??DRAFT_PURPOSES[0]!;
"""
text=text[:start]+constants+text[end:]

replace_once(
    "  private applyPdfDesign=(id:DraftPdfDesign)=>{const design=DRAFT_PDF_DESIGNS.find(item=>item.id===id);if(design)this.patchLetter(design.settings);};\n  private activePdfDesign=(letter:LetterDocumentData):DraftPdfDesign|null=>DRAFT_PDF_DESIGNS.find(design=>Object.entries(design.settings).every(([key,value])=>letter[key as keyof LetterDocumentData]===value))?.id??null;",
    "  private setTemplate=(id:TemplateId)=>this.mutate(doc=>({...doc,appearance:{...doc.appearance,templateId:id}}));"
)

section_start=text.index('        <section className="draft-control-section draft-pdf-design-section">')
section_next=text.index('        <section className="draft-control-section">',section_start)
new_section="""        <section className="draft-control-section draft-pdf-design-section"><div className="draft-section-heading"><span>PDF</span><div><h2>{t('Document design templates','قوالب تصميم المستند')}</h2><p>{t('Use the same 18 premium visual identities available to quotations and invoices, adapted to company-letter content.','استخدم نفس 18 هوية تصميم فاخرة المتاحة لعروض السعر والفواتير، لكن بمحتوى خطاب الشركة.')}</p></div></div><TemplateThumbnails document={d} onSelect={this.setTemplate}/></section>
"""
text=text[:section_start]+new_section+text[section_next:]

preset_start=text.index('<div className="draft-preset-grid">')
preset_end=text.index('</div><div className="form-grid two">',preset_start)
new_grid="""<div className="draft-preset-grid draft-purpose-grid">{DRAFT_PURPOSES.map(purpose=><button type="button" key={purpose.id} className={letter.preset===purpose.id?'active':''} onClick={()=>this.applyPreset(purpose.id)}><strong>{t(purpose.nameEn,purpose.nameAr)}</strong><span>{t(purpose.descriptionEn,purpose.descriptionAr)}</span></button>)}</div>"""
text=text[:preset_start]+new_grid+text[preset_end+len('</div>'):]

replace_once(
    "<span>{t('Draft','مسودة')}</span></div><div className={`draft-save-state",
    "<span>{t(draftPurposeLabel(letter.preset).nameEn,draftPurposeLabel(letter.preset).nameAr)}</span></div><div className={`draft-save-state"
)
replace_once(
    "<header><strong>{t('Draft Preview','معاينة المسودة')}</strong><IconButton",
    "<header><strong>{t(draftPurposeLabel(letter.preset).nameEn,draftPurposeLabel(letter.preset).nameAr)}</strong><IconButton"
)

required=['TemplateThumbnails','DRAFT_PURPOSES','letter-of-intent','company-letter','private setTemplate=(id:TemplateId)']
for token in required:
    if token not in text:
        raise SystemExit(f'Missing required v365 token after patch: {token}')
for retired in ['type DraftPdfDesign=','DRAFT_PDF_DESIGNS','activePdfDesign','applyPdfDesign']:
    if retired in text:
        raise SystemExit(f'Retired Draft design fork still present: {retired}')

PATH.write_text(text)
