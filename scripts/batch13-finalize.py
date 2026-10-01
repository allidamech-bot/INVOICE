from pathlib import Path

def replace(path, old, new, count=1):
    p=Path(path); s=p.read_text(); found=s.count(old)
    if found!=count: raise SystemExit(f'{path}: expected {count}, found {found}: {old[:120]!r}')
    p.write_text(s.replace(old,new,count))

replace('src/app/App.tsx',
"import { assertRecurringWorkflow, completeRecurringRun, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, recurringWorkflowDue } from '../lib/recurring-workflows.js';",
"import { assertRecurringWorkflow, completeRecurringRun, materializeRecurringDocumentDraft, materializeRecurringPurchaseDraft, recurringWorkflowDue } from '../lib/recurring-workflows.js';\nimport { appendAuditEventsForVaultDiff } from '../lib/audit-diff.js';")
replace('src/app/App.tsx',
"const merged=mergeVaultIntent(base,intended,latest);const encrypted=await saveVault(key,merged);this.latestEncryptedVault=encrypted;if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:merged},resolve));this.scheduleCloudSync();return merged;",
"const merged=mergeVaultIntent(base,intended,latest);const audited=appendAuditEventsForVaultDiff(latest,merged);const encrypted=await saveVault(key,audited);this.latestEncryptedVault=encrypted;if(this.state.unlocked&&this.state.key===key)await new Promise<void>(resolve=>this.setState({vault:audited},resolve));this.scheduleCloudSync();return audited;")

replace('src/lib/audit-trail.ts',
"export function auditEventsGlobal(events:DocumentEventRecord[],limit=250):DocumentEventRecord[]{return events.filter(isAuditEvent).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,Math.max(1,limit));}",
"export function auditEventsGlobal(events:DocumentEventRecord[],limit=250):DocumentEventRecord[]{return [...events].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,Math.max(1,limit));}")

replace('src/components/ActivityLogModal.tsx',
"Immutable activity evidence stored inside the encrypted LOUREX vault.",
"Encrypted append-style activity evidence stored inside the LOUREX vault.")
replace('src/components/ActivityLogModal.tsx',
"أدلة نشاط غير قابلة للتعديل محفوظة داخل خزنة LOUREX المشفرة.",
"أدلة نشاط تراكمية محفوظة داخل خزنة LOUREX المشفرة.")
