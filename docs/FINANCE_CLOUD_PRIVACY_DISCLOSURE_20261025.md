# LOUREX INVOICE — Finance cloud privacy disclosure, 35-A
Date: 2026-10-25 · Scope: disclosure only, no storage or security policy changes.

## Verified implementation fact
- The current account-synchronized workspace path, `src/cloud/plain-workspace.ts`, serializes workspace JSON and carries it in Base64 chunks; its own comments explicitly state that the payload **is not client-encrypted**. Base64 is encoding, not encryption.
- Firebase Auth, Firestore UID access rules and HTTPS are intended security dependencies. This review **does not confirm the rules actually published in production**; comparing deployed rules and access-control tests are separate acceptance gates 35-B and 35-C.
- Some historical/local backup paths use encryption; that does **not** make all synchronized account data end-to-end encrypted.
- Internal profitability fields are excluded from ordinary invoice/customer output. That statement **does not imply** that exported backups or cloud workspace copies contain no internal costs.

## Customer-facing language
**English:** Internal costs are excluded from customer-facing invoices, PDFs, print and document sharing. If account cloud sync is enabled, workspace data is not end-to-end encrypted by LOUREX; access protection depends on your account and cloud security rules.

**Arabic:** التكاليف الداخلية لا تظهر في الفواتير الموجهة للعملاء أو ملفات PDF أو الطباعة أو مشاركة المستندات. عند تفعيل المزامنة السحابية للحساب، لا تكون بيانات مساحة العمل مشفّرة من طرف إلى طرف بواسطة LOUREX؛ وتعتمد حماية الوصول على حسابك وقواعد أمان الخدمة السحابية.

## Explicitly not changed
No Firestore rules, Firebase config, API endpoints, account data, accounting calculations, purchase/stock records, invoice issuance, backups, migrations, secrets, or LOUREX AI code are modified in 35-A.

## Acceptance
- Source and output text in both languages are truthful and distinguish visibility in customer documents from cloud storage confidentiality.
- Existing profitability calculations and document-output regressions continue passing on the exact branch head.
- GitHub/Vercel acceptance and release approval are independent. 35-A cannot close whole original axis 35 while deployed Firestore rules remain unverified.
