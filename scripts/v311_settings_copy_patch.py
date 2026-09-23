from pathlib import Path
p=Path('src/components/SettingsModal.tsx')
s=p.read_text()
old="t('Proforma Prefix','بادئة الفاتورة المبدئية')"
new="t('Quotation Prefix','بادئة عرض السعر')"
if old not in s: raise SystemExit('quotation prefix copy anchor missing')
s=s.replace(old,new,1)
old="t('The PIN protects the encrypted vault on this device. Every explicit account sign-in requires the PIN before the workspace opens; normal refreshes stay unlocked until the session locks.','يحمي رمز PIN الخزنة المشفّرة على هذا الجهاز. بعد كل تسجيل دخول صريح للحساب يجب إدخال PIN قبل فتح مساحة العمل، أما التحديث العادي فيبقى مفتوحًا حتى تُقفل الجلسة.')"
new="t('The PIN protects the encrypted vault on this device. Every account sign-in and every new page start or reload requires the PIN before the workspace opens. Auto Lock also protects an already-open session after inactivity.','يحمي رمز PIN الخزنة المشفّرة على هذا الجهاز. يتطلب كل تسجيل دخول للحساب وكل تشغيل جديد للصفحة أو إعادة تحميل إدخال PIN قبل فتح مساحة العمل. كما يحمي القفل التلقائي الجلسة المفتوحة بعد فترة من عدم النشاط.')"
if old not in s: raise SystemExit('PIN settings copy anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
print('v311 settings copy corrected')
