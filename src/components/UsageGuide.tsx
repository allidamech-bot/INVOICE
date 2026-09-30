import '../styles/ai-assistant-help-batch3.css';
import { t } from '../lib/i18n.js';

interface GuideItem{
  titleEn:string;
  titleAr:string;
  bodyEn:string;
  bodyAr:string;
  stepsEn:string[];
  stepsAr:string[];
}

const GUIDE_ITEMS:GuideItem[]=[
  {
    titleEn:'Customers & Customer 360',titleAr:'العملاء وملف Customer 360',
    bodyEn:'Keep customer identity, commercial defaults and relationship history in one place.',
    bodyAr:'اجمع هوية العميل والافتراضات التجارية وسجل العلاقة في مكان واحد.',
    stepsEn:['Add or review the customer from Customers.','Open the customer profile to see Customer 360.','Create quotations or invoices from the customer context when needed.'],
    stepsAr:['أضف العميل أو راجعه من قسم العملاء.','افتح ملف العميل لمشاهدة Customer 360.','أنشئ عرض سعر أو فاتورة من سياق العميل عند الحاجة.']
  },
  {
    titleEn:'Quotations, invoices & commercial flow',titleAr:'عروض الأسعار والفواتير والمسار التجاري',
    bodyEn:'Documents owns quotation, proforma and invoice creation. Commercial tracking stays separate from document lifecycle.',
    bodyAr:'قسم المستندات مسؤول عن عروض الأسعار والبروفورما والفواتير، وتبقى المتابعة التجارية منفصلة عن دورة حياة المستند.',
    stepsEn:['Create a draft from Documents or Quick Create.','Review customer, items, terms and currency before finalizing.','Use Commercial Flow to record Sent, Accepted, Rejected, Expired or Converted state.'],
    stepsAr:['أنشئ مسودة من المستندات أو الإنشاء السريع.','راجع العميل والأصناف والشروط والعملة قبل الاعتماد.','استخدم Commercial Flow لتسجيل الإرسال أو القبول أو الرفض أو الانتهاء أو التحويل.']
  },
  {
    titleEn:'Products & inventory',titleAr:'المنتجات والمخزون',
    bodyEn:'Products stores reusable catalog data; Inventory shows deterministic stock position and movements.',
    bodyAr:'قسم المنتجات يحفظ بيانات الكتالوج القابلة لإعادة الاستخدام، والمخزون يعرض الرصيد والحركات بشكل حتمي.',
    stepsEn:['Maintain SKU, descriptions, cost and commercial metadata in Products.','Review on-hand position from Inventory.','Use inventory movements only for supported operational adjustments.'],
    stepsAr:['حافظ على SKU والأوصاف والتكلفة والبيانات التجارية داخل المنتجات.','راجع الرصيد المتوفر من المخزون.','استخدم حركات المخزون فقط للتعديلات التشغيلية المدعومة.']
  },
  {
    titleEn:'Purchasing & Supplier 360',titleAr:'المشتريات وملف Supplier 360',
    bodyEn:'Purchasing owns suppliers, purchase records and landed-cost workflow. Supplier 360 is relationship history, not Accounts Payable.',
    bodyAr:'قسم المشتريات مسؤول عن الموردين وسجلات الشراء وتكلفة الوصول. Supplier 360 يعرض تاريخ العلاقة وليس ذمم الموردين.',
    stepsEn:['Create or open a supplier in Purchasing.','Use View 360 for purchase history, supplied products and posted spend by currency.','Create and review purchases before posting.'],
    stepsAr:['أنشئ المورد أو افتحه من المشتريات.','استخدم عرض 360 لمراجعة تاريخ الشراء والأصناف وقيمة المشتريات المرحلة حسب العملة.','أنشئ المشتريات وراجعها قبل الترحيل.']
  },
  {
    titleEn:'Finance & receivables',titleAr:'المالية والمستحقات',
    bodyEn:'Finance shows customer receivables, collections and aging from the existing deterministic engines.',
    bodyAr:'تعرض المالية مستحقات العملاء والتحصيل وأعمار الديون من المحركات الحتمية الحالية.',
    stepsEn:['Review outstanding and overdue balances in Finance.','Record customer payments against the correct invoice.','Do not treat collections as revenue or supplier spend as payables.'],
    stepsAr:['راجع الأرصدة المستحقة والمتأخرة في المالية.','سجل دفعات العميل على الفاتورة الصحيحة.','لا تعتبر التحصيل إيرادًا ولا تعتبر إنفاق المورد ذممًا دائنة.']
  },
  {
    titleEn:'Reports',titleAr:'التقارير',
    bodyEn:'Reports separates period performance from as-of balances and only shows profitability when source cost data is reliable enough.',
    bodyAr:'تفصل التقارير بين أداء الفترة والأرصدة حتى تاريخ معين، ولا تعرض الربحية إلا عندما تكون بيانات التكلفة موثوقة بما يكفي.',
    stepsEn:['Choose the reporting period first.','Read sales, collections and receivables as separate metrics.','Treat profitability warnings as data-quality signals, not estimates to ignore.'],
    stepsAr:['اختر فترة التقرير أولًا.','اقرأ المبيعات والتحصيل والمستحقات كمؤشرات منفصلة.','اعتبر تحذيرات الربحية مؤشرات جودة بيانات وليست تقديرات يمكن تجاهلها.']
  },
  {
    titleEn:'LOUREX AI assistant',titleAr:'مساعد LOUREX بالذكاء الاصطناعي',
    bodyEn:'The assistant explains, searches and prepares safe proposals. Deterministic LOUREX engines remain authoritative for business numbers.',
    bodyAr:'يشرح المساعد ويبحث ويجهز مقترحات آمنة، وتبقى محركات LOUREX الحتمية هي المرجع لأرقام الأعمال.',
    stepsEn:['Open the robot assistant from the shell.','Ask in the context of the page you are using.','Review every proposed record change before approving it.'],
    stepsAr:['افتح مساعد الروبوت من الواجهة.','اسأله ضمن سياق الصفحة التي تعمل عليها.','راجع أي تغيير مقترح على السجلات قبل الموافقة عليه.']
  },
  {
    titleEn:'Backup, restore & cloud sync',titleAr:'النسخ الاحتياطي والاستعادة والمزامنة',
    bodyEn:'Data protection features preserve the encrypted business vault; restore and sync actions must be reviewed carefully.',
    bodyAr:'تحافظ ميزات حماية البيانات على خزنة الأعمال المشفرة، ويجب مراجعة الاستعادة والمزامنة بعناية.',
    stepsEn:['Keep a recent backup before major changes.','Check sync state before moving between devices.','Use restore only when you understand which data version will become authoritative.'],
    stepsAr:['احتفظ بنسخة احتياطية حديثة قبل التغييرات الكبيرة.','تحقق من حالة المزامنة قبل الانتقال بين الأجهزة.','استخدم الاستعادة فقط عندما تعرف أي نسخة من البيانات ستصبح المعتمدة.']
  },
  {
    titleEn:'Security, PIN & recovery',titleAr:'الأمان وPIN والاسترداد',
    bodyEn:'Protect account credentials, PIN and recovery material. Recovery works only with the security material available to the configured workflow.',
    bodyAr:'احمِ بيانات الحساب ورمز PIN ومواد الاسترداد. تعمل الاستعادة فقط بمواد الأمان المتاحة لمسار العمل المهيأ.',
    stepsEn:['Set or change PIN from Security.','Store recovery material separately from the device.','Use account password recovery when authentication—not the local vault—is the issue.'],
    stepsAr:['اضبط PIN أو غيّره من الأمان.','احفظ مواد الاسترداد بعيدًا عن الجهاز.','استخدم استرداد كلمة مرور الحساب عندما تكون المشكلة في تسجيل الدخول وليس في الخزنة المحلية.']
  }
];

export function UsageGuide():any{return <section className="lx-usage-guide" aria-label={t('LOUREX usage guide','دليل استخدام LOUREX')}>
  <header className="lx-usage-guide-head">
    <small>{t('How to use LOUREX','طريقة استخدام LOUREX')}</small>
    <h4>{t('Choose the task you want to complete','اختر المهمة التي تريد تنفيذها')}</h4>
    <p>{t('Each guide keeps you inside the canonical workflow so data, calculations and AI assistance stay connected instead of creating duplicate paths.','يبقيك كل شرح داخل المسار الأساسي حتى تبقى البيانات والحسابات ومساعدة الذكاء مترابطة من دون إنشاء مسارات مكررة.')}</p>
  </header>
  <div className="lx-usage-guide-grid">{GUIDE_ITEMS.map(item=><article key={item.titleEn} className="lx-usage-guide-card">
    <h5>{t(item.titleEn,item.titleAr)}</h5>
    <p>{t(item.bodyEn,item.bodyAr)}</p>
    <ol>{(document.documentElement.dir==='rtl'?item.stepsAr:item.stepsEn).map(step=><li key={step}>{step}</li>)}</ol>
  </article>)}</div>
</section>}
