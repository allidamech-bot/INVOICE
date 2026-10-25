import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('35-A: profitability privacy statement no longer falsely claims cloud data is end-to-end encrypted',async()=>{
 const panel=await read('src/components/ProfitabilityPanel.tsx');
 assert.doesNotMatch(panel,/These figures stay inside the encrypted LOUREX vault/);
 assert.doesNotMatch(panel,/خزنة LOUREX المشفّرة/);
 assert.match(panel,/workspace data is not end-to-end encrypted by LOUREX/);
 assert.match(panel,/لا تكون بيانات مساحة العمل مشفّرة من طرف إلى طرف بواسطة LOUREX/);
 assert.match(panel,/access protection depends on your account and cloud security rules/);
 assert.match(panel,/تعتمد حماية الوصول على حسابك وقواعد أمان الخدمة السحابية/);
 assert.match(panel,/customer-facing invoices, PDFs, print and document sharing/);
 assert.match(panel,/الفواتير الموجهة للعملاء أو ملفات PDF أو الطباعة أو مشاركة المستندات/);
 assert.match(panel,/className="profitability-privacy"><Icon name="alert"/);
});

test('35-A: documented cloud encoding is not falsely treated as client encryption',async()=>{
 const [cloud, panel]=await Promise.all([read('src/cloud/plain-workspace.ts'),read('src/components/ProfitabilityPanel.tsx')]);
 assert.match(cloud,/It is NOT client-encrypted/);
 assert.match(cloud,/JSON carried in base64 chunks/);
 assert.match(cloud,/Firestore UID rules and HTTPS remain mandatory/);
 assert.match(panel,/If account cloud sync is enabled/);
 assert.match(panel,/عند تفعيل المزامنة السحابية للحساب/);
});

test('35-A: public document output still omits internal profitability, no behavior change',async()=>{
 const [panel,renderer]=await Promise.all([read('src/components/ProfitabilityPanel.tsx'),read('src/templates/TemplateRenderer.tsx')]);
 assert.match(panel,/calculateProfitability\(document\)/);
 assert.match(panel,/Internal only · never printed/);
 assert.doesNotMatch(renderer,/ProfitabilityPanel|internalCosts|Gross profit|الربح الإجمالي/);
});
