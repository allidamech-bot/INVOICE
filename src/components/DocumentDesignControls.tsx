import type { DocumentAppearance } from '../types.js';
import { ARABIC_FONT_OPTIONS, LATIN_FONT_OPTIONS, resolvedAppearanceTokens } from '../lib/appearance.js';
import { t } from '../lib/i18n.js';
import { Field, Input, Select } from './UI.js';

type TextScale='small'|'normal'|'large';

interface Props {
  appearance:DocumentAppearance;
  onChange:(key:keyof DocumentAppearance,value:any)=>void;
}

const sizeOptions:Array<{value:TextScale;en:string;ar:string}>=[
  {value:'small',en:'Small',ar:'صغير'},
  {value:'normal',en:'Normal',ar:'عادي'},
  {value:'large',en:'Large',ar:'كبير'}
];

function SizeSelect({label,value,onChange}:{label:string;value:TextScale;onChange:(value:TextScale)=>void}):any{
  return <Field label={label}><Select value={value} onChange={(event:any)=>onChange(event.target.value as TextScale)}>{sizeOptions.map(option=><option key={option.value} value={option.value}>{t(option.en,option.ar)}</option>)}</Select></Field>;
}

export function DocumentDesignControls({appearance,onChange}:Props):any{
  const tokens=resolvedAppearanceTokens(appearance);
  const custom=(appearance.paletteMode??'auto')==='custom';
  const titleScale=appearance.documentTitleScale??'normal';
  const headingScale=appearance.sectionHeadingScale??'normal';
  const bodyScale=appearance.bodyTextScale??appearance.textScale??'normal';
  const tableScale=appearance.tableTextScale??appearance.textScale??'normal';

  return <div className="document-design-stack">
    <section className="design-control-card design-colors-card" aria-label={t('Document colors','ألوان المستند')}>
      <div className="design-control-card-head"><div><strong>{t('Colors','الألوان')}</strong><small>{t('Choose the template palette automatically or customize bounded document roles.','دع القالب يختار ألوانه تلقائيًا أو خصص أدوارًا محددة داخل المستند.')}</small></div><span className={`design-mode-badge ${custom?'is-custom':'is-auto'}`}>{custom?t('Custom','مخصص'):t('Auto','تلقائي')}</span></div>
      <div className="appearance-system-grid design-colors-grid">
        <Field label={t('Color System','نظام الألوان')}><Select value={appearance.paletteMode??'auto'} onChange={(event:any)=>onChange('paletteMode',event.target.value)}><option value="auto">{t('Auto — matched to template','تلقائي — متناسق مع القالب')}</option><option value="custom">{t('Custom','مخصص')}</option></Select></Field>
        {!custom?<div className="appearance-auto-note"><span><strong>{t('Template palette','ألوان القالب')}</strong>{t('LOUREX keeps the original balanced colors of the selected template in Preview and PDF.','يحافظ LOUREX على الألوان الأصلية المتوازنة للقالب المختار في المعاينة وPDF.')}</span></div>:null}
        {custom?<>
          <Field label={t('Accent / Highlight','لون التمييز')} hint={t('Used for safe rules and highlights; it does not recolor dark mastheads or totals text.','يستخدم للخطوط والعناصر المميزة الآمنة، ولا يغيّر نصوص الترويسة أو الإجماليات الداكنة.')}><Input type="color" value={appearance.accentColor||tokens.accent} onChange={(event:any)=>onChange('accentColor',event.target.value)}/></Field>
          <Field label={t('Section Heading Color','لون عناوين الأقسام')}><Input type="color" value={appearance.headingTextColor||tokens.heading} onChange={(event:any)=>onChange('headingTextColor',event.target.value)}/></Field>
          <Field label={t('Primary Text / Values','النص والقيم الأساسية')}><Input type="color" value={appearance.primaryTextColor||tokens.primary} onChange={(event:any)=>onChange('primaryTextColor',event.target.value)}/></Field>
          <Field label={t('Secondary Text / Labels','النص الثانوي / التسميات')}><Input type="color" value={appearance.secondaryTextColor||tokens.secondary} onChange={(event:any)=>onChange('secondaryTextColor',event.target.value)}/></Field>
          <div className="contrast-safety-note"><strong>{t('Readability guard is always on.','حماية القراءة مفعلة دائمًا.')}</strong><span>{t('Unsafe foreground choices fall back to a safe document ink. Dark mastheads, table headers and totals keep their template contrast in Preview, PDF, Print and Share.','إذا كان لون النص غير مقروء يستخدم LOUREX لونًا آمنًا، وتبقى الترويسات الداكنة ورؤوس الجداول والإجماليات بتباين القالب في المعاينة وPDF والطباعة والمشاركة.')}</span></div>
        </>:null}
      </div>
    </section>

    <section className="design-control-card design-typography-card" aria-label={t('Document typography','خطوط وأحجام المستند')}>
      <div className="design-control-card-head"><div><strong>{t('Typography','الخط والنص')}</strong><small>{t('Font choices and bounded PDF-safe sizing.','اختيارات الخط وأحجام محدودة وآمنة لملف PDF.')}</small></div></div>
      <div className="appearance-system-grid typography-system-grid">
        <Field label={t('English Font','الخط الإنجليزي')}><Select value={appearance.latinFont??'auto'} onChange={(event:any)=>onChange('latinFont',event.target.value)}>{LATIN_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></Field>
        <Field label={t('Arabic Font','الخط العربي')}><Select value={appearance.arabicFont??'auto'} onChange={(event:any)=>onChange('arabicFont',event.target.value)}>{ARABIC_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></Field>
        <SizeSelect label={t('Document Title Size','حجم عنوان المستند')} value={titleScale} onChange={value=>onChange('documentTitleScale',value)}/>
        <SizeSelect label={t('Section Heading Size','حجم عناوين الأقسام')} value={headingScale} onChange={value=>onChange('sectionHeadingScale',value)}/>
        <SizeSelect label={t('Body / Values Size','حجم النص والقيم')} value={bodyScale} onChange={value=>onChange('bodyTextScale',value)}/>
        <SizeSelect label={t('Table Text Size','حجم نص الجدول')} value={tableScale} onChange={value=>onChange('tableTextScale',value)}/>
      </div>
    </section>
  </div>;
}
