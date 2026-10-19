import type { DocumentAppearance } from '../types.js';
import { resolvedAppearanceTokens, resolvedTemplateId } from '../lib/appearance.js';
import { t } from '../lib/i18n.js';
import { StaticTemplatePreview, templateDisplayName } from '../templates/TemplateThumbnails.js';
import { Icon } from './UI.js';

// Native summary keeps the whole card keyboard/click accessible without a
// nested button or another owner of disclosure state.
export function EditorDesignSummary({appearance,kind,letter=false}:{appearance:DocumentAppearance;kind:'template'|'appearance';letter?:boolean}):any{
  const template=kind==='template',id=resolvedTemplateId(appearance.templateId);
  const tokens=resolvedAppearanceTokens(appearance);
  return <summary className="editor-discovery-summary">
    <span className={template?'editor-discovery-preview':'editor-discovery-palette'} aria-hidden="true">
      {template?<StaticTemplatePreview id={id} appearance={appearance}/>:<><Icon name="settings" size={22}/><span className="editor-discovery-swatches">{[tokens.accent,tokens.page,tokens.primary].map((color,index)=><i key={index} style={{backgroundColor:color}}/>)}</span></>}
    </span>
    <span className="editor-discovery-copy">
      <strong>{template?t('Document template','قالب المستند'):t('Customize appearance','تخصيص المظهر')}</strong>
      {template?<span className="editor-discovery-name">{templateDisplayName(id)}</span>:null}
      <small>{template?t('Choose a look for your document','اختر الشكل المناسب لمستندك'):letter?t('Page, branding & watermark','الصفحة والهوية والعلامة المائية'):t('Colors, fonts, watermark & columns','الألوان والخطوط والعلامة المائية والأعمدة')}</small>
    </span>
    <span className="editor-discovery-action"><span className="discovery-closed-label">{template?t('Change template','تغيير القالب'):t('Customize','تخصيص')}</span><span className="discovery-open-label">{t('Close options','إغلاق الخيارات')}</span><Icon name="chevronDown" size={16}/></span>
  </summary>;
}
