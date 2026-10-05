import type { DocumentAppearance } from '../types.js';
import { ARABIC_FONT_OPTIONS, LATIN_FONT_OPTIONS, resolvedAppearanceTokens } from '../lib/appearance.js';
import { t } from '../lib/i18n.js';
import { Select } from './UI.js';

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

function ControlRow({label,hint,children}:{label:string;hint?:string;children:any}):any{
  return <div className="document-design-row">
    <div className="document-design-label"><strong>{label}</strong>{hint?<small>{hint}</small>:null}</div>
    <div className="document-design-control">{children}</div>
  </div>;
}

function SizeSelect({label,value,onChange}:{label:string;value:TextScale;onChange:(value:TextScale)=>void}):any{
  return <ControlRow label={label}><Select aria-label={label} value={value} onChange={(event:any)=>onChange(event.target.value as TextScale)}>{sizeOptions.map(option=><option key={option.value} value={option.value}>{t(option.en,option.ar)}</option>)}</Select></ControlRow>;
}

function ColorControl({label,hint,value,onChange}:{label:string;hint?:string;value:string;onChange:(value:string)=>void}):any{
  const normalized=value||'#000000';
  return <ControlRow label={label} hint={hint}>
    <label className="document-color-control">
      <input className="document-color-swatch" type="color" aria-label={label} value={normalized} onChange={(event:any)=>onChange(event.target.value)}/>
      <span className="document-color-value" dir="ltr">{normalized.toUpperCase()}</span>
    </label>
  </ControlRow>;
}

export function DocumentDesignControls({appearance,onChange}:Props):any{
  const tokens=resolvedAppearanceTokens(appearance);
  const custom=(appearance.paletteMode??'auto')==='custom';
  const titleScale=appearance.documentTitleScale??'normal';
  const headingScale=appearance.sectionHeadingScale??'normal';
  const bodyScale=appearance.bodyTextScale??appearance.textScale??'normal';
  const tableScale=appearance.tableTextScale??appearance.textScale??'normal';

  return <div className="document-design-stack">
    <section className="document-design-group design-colors-group" aria-label={t('Document colors','ألوان المستند')}>
      <div className="document-design-group-head">
        <div><strong>{t('Colors','الألوان')}</strong><small>{t('Choose the template palette automatically or customize bounded document roles.','دع القالب يختار ألوانه تلقائيًا أو خصص أدوارًا محددة داخل المستند.')}</small></div>
        <span className={`design-mode-badge ${custom?'is-custom':'is-auto'}`}>{custom?t('Custom','مخصص'):t('Auto','تلقائي')}</span>
      </div>
      <div className="document-design-rows">
        <ControlRow label={t('Color System','نظام الألوان')}><Select aria-label={t('Color System','نظام الألوان')} value={appearance.paletteMode??'auto'} onChange={(event:any)=>onChange('paletteMode',event.target.value)}><option value="auto">{t('Auto — matched to template','تلقائي — متناسق مع القالب')}</option><option value="custom">{t('Custom','مخصص')}</option></Select></ControlRow>
        {!custom?<p className="document-design-note"><strong>{t('Template palette','ألوان القالب')}</strong><span>{t('LOUREX keeps the original balanced colors of the selected template in Preview and PDF.','يحافظ LOUREX على الألوان الأصلية المتوازنة للقالب المختار في المعاينة وPDF.')}</span></p>:null}
        {custom?<>
          <ColorControl label={t('Accent / Highlight','لون التمييز')} hint={t('Used for safe rules and highlights; it does not recolor dark mastheads or totals text.','يستخدم للخطوط والعناصر المميزة الآمنة، ولا يغيّر نصوص الترويسة أو الإجماليات الداكنة.')} value={appearance.accentColor||tokens.accent} onChange={value=>onChange('accentColor',value)}/>
          <ColorControl label={t('Section Heading Color','لون عناوين الأقسام')} value={appearance.headingTextColor||tokens.heading} onChange={value=>onChange('headingTextColor',value)}/>
          <ColorControl label={t('Primary Text / Values','النص والقيم الأساسية')} value={appearance.primaryTextColor||tokens.primary} onChange={value=>onChange('primaryTextColor',value)}/>
          <ColorControl label={t('Secondary Text / Labels','النص الثانوي / التسميات')} value={appearance.secondaryTextColor||tokens.secondary} onChange={value=>onChange('secondaryTextColor',value)}/>
          <p className="document-design-note document-design-safety"><strong>{t('Readability guard is always on.','حماية القراءة مفعلة دائمًا.')}</strong><span>{t('Unsafe foreground choices fall back to a safe document ink. Dark mastheads, table headers and totals keep their template contrast in Preview, PDF, Print and Share.','إذا كان لون النص غير مقروء يستخدم LOUREX لونًا آمنًا، وتبقى الترويسات الداكنة ورؤوس الجداول والإجماليات بتباين القالب في المعاينة وPDF والطباعة والمشاركة.')}</span></p>
        </>:null}
      </div>
    </section>

    <section className="document-design-group design-typography-group" aria-label={t('Document typography','خطوط وأحجام المستند')}>
      <div className="document-design-group-head"><div><strong>{t('Typography','الخط والنص')}</strong><small>{t('Font choices and bounded PDF-safe sizing.','اختيارات الخط وأحجام محدودة وآمنة لملف PDF.')}</small></div></div>
      <div className="document-design-rows">
        <ControlRow label={t('English Font','الخط الإنجليزي')}><Select aria-label={t('English Font','الخط الإنجليزي')} value={appearance.latinFont??'auto'} onChange={(event:any)=>onChange('latinFont',event.target.value)}>{LATIN_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></ControlRow>
        <ControlRow label={t('Arabic Font','الخط العربي')}><Select aria-label={t('Arabic Font','الخط العربي')} value={appearance.arabicFont??'auto'} onChange={(event:any)=>onChange('arabicFont',event.target.value)}>{ARABIC_FONT_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</Select></ControlRow>
        <SizeSelect label={t('Document Title Size','حجم عنوان المستند')} value={titleScale} onChange={value=>onChange('documentTitleScale',value)}/>
        <SizeSelect label={t('Section Heading Size','حجم عناوين الأقسام')} value={headingScale} onChange={value=>onChange('sectionHeadingScale',value)}/>
        <SizeSelect label={t('Body / Values Size','حجم النص والقيم')} value={bodyScale} onChange={value=>onChange('bodyTextScale',value)}/>
        <SizeSelect label={t('Table Text Size','حجم نص الجدول')} value={tableScale} onChange={value=>onChange('tableTextScale',value)}/>
      </div>
    </section>
  </div>;
}
