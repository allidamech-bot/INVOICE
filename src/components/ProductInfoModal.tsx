import type { UiLanguage } from '../types.js';
import { t } from '../lib/i18n.js';
import { Modal } from './UI.js';
import { UsageGuide } from './UsageGuide.js';

export type ProductInfoSection='help'|'privacy'|'terms'|'about';

interface Props{
  open:boolean;
  section:ProductInfoSection;
  language:UiLanguage;
  onSection:(section:ProductInfoSection)=>void;
  onClose:()=>void;
}

function runtimeInfo():{environment:string;commitSha:string;commitRef:string;source:string}{
  const runtime=(window as any).__LOUREX_RUNTIME__||{};
  const owner=String(runtime.sourceRepoOwner||'').trim();
  const slug=String(runtime.sourceRepoSlug||'').trim();
  return{
    environment:String(runtime.environment||'').trim(),
    commitSha:String(runtime.commitSha||'').trim(),
    commitRef:String(runtime.commitRef||'').trim(),
    source:owner&&slug?`${owner}/${slug}`:''
  };
}

function HelpContent():any{return <div className="lx-product-info-content">
  <header className="lx-product-info-hero"><small>{t('Help Center','مركز المساعدة')}</small><h3>{t('Run the business from one clear workflow','أدر أعمالك من مسار واضح واحد')}</h3><p>{t('Use LOUREX by business task. Each area keeps its own source of truth while search and LOUREX AI help you reach the right workflow faster.','استخدم LOUREX بحسب مهمة العمل. يحتفظ كل قسم بمصدره الموثوق للبيانات، بينما يساعدك البحث وذكاء LOUREX للوصول إلى المسار الصحيح بسرعة.')}</p></header>
  <div className="lx-help-grid">
    <article><strong>{t('Sell & issue documents','البيع وإصدار المستندات')}</strong><p>{t('Create quotations and invoices from Documents. Customer defaults and document lifecycle rules remain attached to the document workflow.','أنشئ عروض الأسعار والفواتير من المستندات. تبقى افتراضات العميل وقواعد دورة حياة المستند ضمن مسار المستند نفسه.')}</p></article>
    <article><strong>{t('Collect receivables','تحصيل المستحقات')}</strong><p>{t('Open Finance to review outstanding and overdue customer balances, record collections and inspect aging.','افتح المالية لمراجعة أرصدة العملاء المستحقة والمتأخرة وتسجيل التحصيل ومراجعة أعمار الديون.')}</p></article>
    <article><strong>{t('Purchase & control stock','الشراء وضبط المخزون')}</strong><p>{t('Purchasing owns suppliers and purchase workflow. Products & Inventory owns catalog, on-hand position and inventory movements.','قسم المشتريات مسؤول عن الموردين ودورة الشراء. قسم المنتجات والمخزون مسؤول عن الكتالوج والرصيد وحركات المخزون.')}</p></article>
    <article><strong>{t('Understand performance','فهم الأداء')}</strong><p>{t('Reports separates sales, collections, receivables and gross profitability. Period metrics and as-of balances are not treated as the same concept.','تفصل التقارير بين المبيعات والتحصيل والمستحقات وإجمالي الربحية. مؤشرات الفترة والأرصدة حتى تاريخ معين ليست مفهوماً واحداً.')}</p></article>
  </div>
  <section className="lx-info-note"><h4>{t('Account, settings and sign-out','الحساب والإعدادات وتسجيل الخروج')}</h4><p>{t('Open More for Account, Settings and Sign out. Account contains the company profile, logo and account access. Settings contains preferences, companies and branches, commercial controls, document artwork and numbering, team approvals, data and security. Use the links inside Account and Settings to move between them without losing pending changes. Save company settings and workspace preferences separately.','افتح قائمة المزيد للوصول إلى الحساب والإعدادات وتسجيل الخروج. يحتوي الحساب على ملف الشركة والشعار والدخول إلى الحساب. تضم الإعدادات التفضيلات والشركات والفروع والضوابط التجارية وصور المستندات والترقيم وموافقات الفريق والبيانات والأمان. استخدم الروابط داخل الحساب والإعدادات للتنقل بينهما مع الحفاظ على التعديلات المعلقة. احفظ إعدادات الشركة وتفضيلات مساحة العمل كلًّا على حدة.')}</p></section>
  <UsageGuide/>
  <section className="lx-finance-help" aria-label={t('Financial terms','المصطلحات المالية')}>
    <h4>{t('Financial terms used in LOUREX','المصطلحات المالية في LOUREX')}</h4>
    <dl>
      <div><dt>{t('Net sales','صافي المبيعات')}</dt><dd>{t('Finalized commercial sales for the selected reporting period, after supported credit-note effects.','المبيعات التجارية النهائية خلال فترة التقرير المحددة بعد تأثيرات إشعارات الدائن المدعومة.')}</dd></div>
      <div><dt>{t('Collections','التحصيل')}</dt><dd>{t('Recorded customer payments. This is not the same as revenue.','مدفوعات العملاء المسجلة. وهي ليست نفس الإيراد.')}</dd></div>
      <div><dt>{t('Outstanding','المستحق')}</dt><dd>{t('Open customer receivable balance as of the relevant date.','رصيد مستحقات العملاء المفتوح حتى التاريخ ذي الصلة.')}</dd></div>
      <div><dt>{t('Gross profit','إجمالي الربح')}</dt><dd>{t('Shown only when the required product cost data is complete enough for the existing deterministic profitability calculation.','يظهر فقط عندما تكون بيانات تكلفة المنتجات المطلوبة مكتملة بما يكفي لحساب الربحية الحتمي الموجود.')}</dd></div>
    </dl>
  </section>
</div>}

function PrivacyContent():any{return <div className="lx-product-info-content">
  <header className="lx-product-info-hero"><small>{t('Privacy & AI Data','الخصوصية وبيانات الذكاء الاصطناعي')}</small><h3>{t('Know when business data leaves the current workflow','اعرف متى تغادر بيانات الأعمال مسار العمل الحالي')}</h3><p>{t('LOUREX is designed around local-first business data with optional connected services. The exact data path depends on the feature you choose and your deployment configuration.','تم تصميم LOUREX حول بيانات أعمال محلية أولاً مع خدمات متصلة اختيارية. يعتمد مسار البيانات الفعلي على الميزة التي تختارها وإعدادات النشر لديك.')}</p></header>
  <section className="lx-info-stack">
    <article><h4>{t('Local and cloud data','البيانات المحلية والسحابية')}</h4><p>{t('Core business records are handled through LOUREX storage boundaries. If cloud sync, backup or recovery is enabled, those configured services participate in that workflow.','تتم معالجة سجلات الأعمال الأساسية ضمن حدود تخزين LOUREX. عند تفعيل المزامنة أو النسخ الاحتياطي أو الاسترداد السحابي، تشارك الخدمات المهيأة في ذلك المسار.')}</p></article>
    <article><h4>{t('AI requests','طلبات الذكاء الاصطناعي')}</h4><p>{t('AI features are task-scoped. When you invoke an AI workflow, the files or business context required for that task may be sent to the configured AI service. LOUREX should not treat instructions embedded inside uploaded documents as trusted commands.','ميزات الذكاء الاصطناعي محددة بالمهمة. عند تشغيل مسار ذكاء اصطناعي قد تُرسل الملفات أو سياق الأعمال اللازم لتلك المهمة إلى خدمة الذكاء الاصطناعي المهيأة. لا ينبغي لـ LOUREX اعتبار التعليمات المضمنة داخل الملفات المرفوعة أوامر موثوقة.')}</p></article>
    <article><h4>{t('Review before mutation','المراجعة قبل التغيير')}</h4><p>{t('AI-generated proposals should be reviewed before they change business records. Missing source values must remain missing rather than being invented.','يجب مراجعة المقترحات المولدة بالذكاء الاصطناعي قبل تغيير سجلات الأعمال. القيم غير الموجودة في المصدر يجب أن تبقى مفقودة بدلاً من اختراعها.')}</p></article>
    <article className="lx-info-note"><h4>{t('Deployment-specific obligations','التزامات خاصة بالنشر')}</h4><p>{t('Provider retention, jurisdiction, data residency and legal obligations can vary by deployment and provider terms. This in-app explanation does not replace a jurisdiction-specific privacy notice prepared for your organization.','قد تختلف مدة احتفاظ المزود والاختصاص القضائي ومكان تخزين البيانات والالتزامات القانونية حسب إعداد النشر وشروط المزود. هذا الشرح داخل التطبيق لا يستبدل إشعار خصوصية خاصاً بجهة عملك واختصاصك القضائي.')}</p></article>
  </section>
</div>}

function TermsContent():any{return <div className="lx-product-info-content">
  <header className="lx-product-info-hero"><small>{t('Terms of Use','شروط الاستخدام')}</small><h3>{t('Operational responsibilities when using LOUREX','مسؤوليات الاستخدام التشغيلي لـ LOUREX')}</h3><p>{t('These in-app terms describe safe product use. They do not replace any separately executed commercial agreement, licensing terms or jurisdiction-specific legal terms.','توضح هذه الشروط داخل التطبيق الاستخدام الآمن للمنتج، ولا تستبدل أي اتفاق تجاري أو شروط ترخيص منفصلة أو شروط قانونية خاصة باختصاص قضائي.')}</p></header>
  <section className="lx-info-stack">
    <article><h4>{t('Review business documents','راجع مستندات الأعمال')}</h4><p>{t('You remain responsible for reviewing customer, supplier, tax, banking, shipping and commercial information before a document is issued or shared externally.','تبقى مسؤولاً عن مراجعة معلومات العميل والمورد والضرائب والبنوك والشحن والمعلومات التجارية قبل إصدار المستند أو مشاركته خارجياً.')}</p></article>
    <article><h4>{t('Accounting and tax treatment','المعالجة المحاسبية والضريبية')}</h4><p>{t('LOUREX calculations depend on the data and rules configured in the application. Confirm tax, accounting and regulatory treatment with the professionals responsible for your business where required.','تعتمد حسابات LOUREX على البيانات والقواعد المهيأة في التطبيق. تحقّق من المعالجة الضريبية والمحاسبية والتنظيمية مع المختصين المسؤولين عن أعمالك عند الحاجة.')}</p></article>
    <article><h4>{t('AI assistance','مساعدة الذكاء الاصطناعي')}</h4><p>{t('AI output is assistance, not automatic authority. Proposals, extracted values and recommendations require review. Deterministic calculations remain separate from generative interpretation where the product identifies them as such.','مخرجات الذكاء الاصطناعي مساعدة وليست سلطة تلقائية. المقترحات والقيم المستخرجة والتوصيات تحتاج مراجعة. تبقى الحسابات الحتمية منفصلة عن التفسير التوليدي عندما يحددها المنتج بذلك.')}</p></article>
    <article><h4>{t('Backups and access','النسخ الاحتياطي والوصول')}</h4><p>{t('Keep appropriate backups and protect account, PIN and recovery material. Recovery features can only operate within the data and credentials available to the configured workflow.','احتفظ بنسخ احتياطية مناسبة واحمِ الحساب ورمز PIN ومواد الاسترداد. تعمل ميزات الاسترداد فقط ضمن البيانات وبيانات الاعتماد المتاحة لمسار العمل المهيأ.')}</p></article>
  </section>
</div>}

function AboutContent():any{
  const info=runtimeInfo();
  const shortSha=info.commitSha?info.commitSha.slice(0,12):'';
  return <div className="lx-product-info-content">
    <header className="lx-product-info-hero lx-about-hero"><small>{t('About LOUREX','حول LOUREX')}</small><h3>LOUREX Invoice</h3><p>{t('A business operating workspace for documents, customers, purchasing, inventory, receivables, reporting and assisted intelligence.','مساحة تشغيل أعمال للمستندات والعملاء والمشتريات والمخزون والمستحقات والتقارير والذكاء المساعد.')}</p></header>
    <dl className="lx-build-info">
      <div><dt>{t('Product generation','جيل المنتج')}</dt><dd>Product OS v451</dd></div>
      <div><dt>{t('Environment','البيئة')}</dt><dd>{info.environment||t('Not exposed by this runtime','غير معروضة في بيئة التشغيل')}</dd></div>
      <div><dt>{t('Build commit','بناء Git')}</dt><dd><code>{shortSha||t('Not exposed by this runtime','غير معروض في بيئة التشغيل')}</code></dd></div>
      <div><dt>{t('Build ref','مرجع البناء')}</dt><dd><code>{info.commitRef||t('Not exposed by this runtime','غير معروض في بيئة التشغيل')}</code></dd></div>
      <div><dt>{t('Source','المصدر')}</dt><dd><code>{info.source||t('Not exposed by this runtime','غير معروض في بيئة التشغيل')}</code></dd></div>
    </dl>
  </div>;
}

export function ProductInfoModal({open,section,language,onSection,onClose}:Props):any{
  const tabs:Array<{id:ProductInfoSection;en:string;ar:string}>=[
    {id:'help',en:'Help',ar:'المساعدة'},
    {id:'privacy',en:'Privacy & AI',ar:'الخصوصية والذكاء'},
    {id:'terms',en:'Terms',ar:'الشروط'},
    {id:'about',en:'About',ar:'حول'}
  ];
  const body=section==='privacy'?<PrivacyContent/>:section==='terms'?<TermsContent/>:section==='about'?<AboutContent/>:<HelpContent/>;
  return <Modal open={open} title={t('LOUREX Product Information','معلومات منتج LOUREX')} size="lg" onClose={onClose}>
    <div className="lx-product-info" dir={language==='ar'?'rtl':'ltr'}>
      <nav className="lx-product-info-tabs" aria-label={t('Product information','معلومات المنتج')}>
        {tabs.map(tab=><button type="button" key={tab.id} className={section===tab.id?'is-active':''} aria-current={section===tab.id?'page':undefined} onClick={()=>onSection(tab.id)}>{t(tab.en,tab.ar)}</button>)}
      </nav>
      {body}
    </div>
  </Modal>;
}
