from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    p = Path(path)
    text = p.read_text()
    found = text.count(old)
    if found != count:
        raise SystemExit(f"{path}: expected {count} anchors, found {found}: {old[:100]!r}")
    p.write_text(text.replace(old, new))


# Types
path = "src/types.ts"
anchor = "export interface VaultPayload {\n"
recurrence = """export type RecurringCadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringTarget = 'document' | 'purchase';

export interface RecurringGeneratedRun {
  id: string;
  scheduledFor: string;
  generatedId: string;
  generatedNumber: string;
  createdAt: string;
}

export interface RecurringWorkflowRecord {
  id: string;
  workspaceId: string;
  target: RecurringTarget;
  title: string;
  sourceId: string;
  sourceNumber: string;
  cadence: RecurringCadence;
  interval: number;
  nextRunDate: string;
  endDate: string;
  enabled: boolean;
  documentTemplate: LourexDocument | null;
  purchaseTemplate: PurchaseRecord | null;
  generatedRuns: RecurringGeneratedRun[];
  createdAt: string;
  updatedAt: string;
}

"""
replace(path, anchor, recurrence + anchor)
replace(
    path,
    "  inventoryMovements: InventoryMovementRecord[];\n  documents: LourexDocument[];",
    "  inventoryMovements: InventoryMovementRecord[];\n  recurringWorkflows: RecurringWorkflowRecord[];\n  documents: LourexDocument[];",
)

# Defaults + schema version
path = "src/lib/defaults.ts"
replace(
    path,
    "// Batch 1 commercial tracking reuses encrypted document-event records, so no schema bump is required.\nexport const APP_SCHEMA_VERSION = 16;",
    "// Batch 1 commercial tracking reuses encrypted document-event records, so no schema bump is required.\n// v17 adds encrypted recurring workflow definitions and idempotent generated-draft history.\nexport const APP_SCHEMA_VERSION = 17;",
)
replace(path, "inventoryMovements: [], documents: []", "inventoryMovements: [], recurringWorkflows: [], documents: []")

# Vault migration
path = "src/storage/vault.ts"
replace(
    path,
    "const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);",
    "const INVENTORY_MOVEMENT_TYPES = new Set(['opening','purchase','purchase-reversal','issue','adjustment']);\nconst RECURRING_TARGETS = new Set(['document','purchase']);\nconst RECURRING_CADENCES = new Set(['weekly','monthly','quarterly','yearly']);",
)
anchor = "  migrated.savedItems = Array.isArray((vault as any).savedItems) ? (vault as any).savedItems.map((item:any)=>({\n"
block = """  migrated.recurringWorkflows = Array.isArray((vault as any).recurringWorkflows) ? (vault as any).recurringWorkflows.map((workflow:any)=>{
    const target=RECURRING_TARGETS.has(workflow?.target)?workflow.target:'document';
    const cadence=RECURRING_CADENCES.has(workflow?.cadence)?workflow.cadence:'monthly';
    const documentTemplate=target==='document'&&workflow?.documentTemplate&&typeof workflow.documentTemplate==='object'?structuredClone(workflow.documentTemplate):null;
    const purchaseTemplate=target==='purchase'&&workflow?.purchaseTemplate&&typeof workflow.purchaseTemplate==='object'?structuredClone(workflow.purchaseTemplate):null;
    if(documentTemplate){documentTemplate.role='standard';documentTemplate.status='draft';documentTemplate.lifecycleStatus='active';documentTemplate.revision=1;documentTemplate.creditForId='';documentTemplate.creditForNumber='';documentTemplate.voidedAt='';documentTemplate.voidReason='';documentTemplate.convertedFromId='';documentTemplate.attachments=[];}
    if(purchaseTemplate){purchaseTemplate.status='draft';purchaseTemplate.postedAt='';purchaseTemplate.reversedAt='';purchaseTemplate.reverseReason='';}
    return{
      id:stringValue(workflow?.id),workspaceId:stringValue(workflow?.workspaceId,'default')||'default',target,title:stringValue(workflow?.title),sourceId:stringValue(workflow?.sourceId),sourceNumber:stringValue(workflow?.sourceNumber),cadence,
      interval:Math.max(1,Math.min(52,Math.trunc(finiteNumber(workflow?.interval,1)))),nextRunDate:stringValue(workflow?.nextRunDate),endDate:stringValue(workflow?.endDate),enabled:booleanValue(workflow?.enabled,true),
      documentTemplate,purchaseTemplate,
      generatedRuns:Array.isArray(workflow?.generatedRuns)?workflow.generatedRuns.map((run:any)=>({id:stringValue(run?.id),scheduledFor:stringValue(run?.scheduledFor),generatedId:stringValue(run?.generatedId),generatedNumber:stringValue(run?.generatedNumber),createdAt:stringValue(run?.createdAt,nowIso())})).filter((run:any)=>run.id&&run.scheduledFor&&run.generatedId&&run.generatedNumber):[],
      createdAt:stringValue(workflow?.createdAt,nowIso()),updatedAt:stringValue(workflow?.updatedAt,workflow?.createdAt?stringValue(workflow.createdAt):nowIso())
    };
  }).filter((workflow:any)=>workflow.id&&workflow.nextRunDate&&(workflow.documentTemplate||workflow.purchaseTemplate)) : [];

"""
replace(path, anchor, block + anchor)
replace(
    path,
    "  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.documents.map(d => d.id), 'document');",
    "  unique(migrated.inventoryMovements.map(m => m.id), 'inventory movement');\n  unique(migrated.recurringWorkflows.map(r => r.id), 'recurring workflow');\n  for(const workflow of migrated.recurringWorkflows)unique(workflow.generatedRuns.map(run=>run.id),'recurring run');\n  unique(migrated.documents.map(d => d.id), 'document');",
)

# Concurrent merge + validation
path = "src/storage/vault-merge.ts"
replace(
    path,
    "import type { AppSettings, CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PurchaseRecord, SavedItem, Supplier, VaultPayload } from '../types.js';",
    "import type { AppSettings, CompanySettings, Customer, ExpenseRecord, InventoryMovementRecord, LourexDocument, PurchaseRecord, RecurringWorkflowRecord, SavedItem, Supplier, VaultPayload } from '../types.js';",
)
replace(path, "import { t } from '../lib/i18n.js';", "import { t } from '../lib/i18n.js';\nimport { assertRecurringWorkflow } from '../lib/recurring-workflows.js';")
anchor = "function mergeCompany(base:CompanySettings,intended:CompanySettings,latest:CompanySettings):CompanySettings{"
block = """function guardRecurringWorkflowChanges(base:RecurringWorkflowRecord[],intended:RecurringWorkflowRecord[],latest:RecurringWorkflowRecord[]):void{
  if(intended===base)return;
  guardConcurrentRecordChanges(base,intended,latest,'Recurring workflow','Reopen the Recurring Manager before saving or generating a draft.');
  const baseById=new Map(base.map(item=>[item.id,item]));
  for(const workflow of intended){const before=baseById.get(workflow.id);if(before&&sameRecord(before,workflow))continue;assertRecurringWorkflow(workflow);}
}

"""
replace(path, anchor, block + anchor)
replace(
    path,
    "  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  const documents=mergeDocuments",
    "  const inventoryMovements=mergeRecords(base.inventoryMovements,intended.inventoryMovements,latest.inventoryMovements);\n  guardRecurringWorkflowChanges(base.recurringWorkflows,intended.recurringWorkflows,latest.recurringWorkflows);\n  const recurringWorkflows=mergeRecords(base.recurringWorkflows,intended.recurringWorkflows,latest.recurringWorkflows);\n  const documents=mergeDocuments",
)
replace(path, "    inventoryMovements,\n    documents,", "    inventoryMovements,\n    recurringWorkflows,\n    documents,")
