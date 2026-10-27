import {isDeepStrictEqual} from 'node:util';
import {prototypeFinanceGlAtomicAppend,fingerprintSyntheticFinanceSources} from '../../api/_accounting/finance-gl-atomic-contract.js';
import {inspectSourceBoundStockGl} from '../../dist/src/lib/finance-source-bound-stock-gl-preview.js';
import {validateMeta,decodeWorkspace} from '../../api/_accounting/period-format.js';

/**
 * Test-only adapter. Importable exclusively by Node integration tests.
 * NEVER expose as a production API handler or grant clients write access.
 * All persisted records exist only in a local, fixed demo Firestore project.
 */
const PROJECT='demo-lourex-gl-qa';
const fail=code=>{throw new Error('ALIF_22_GL_EMULATOR_'+code);};
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(x);
const same=(a,b)=>isDeepStrictEqual(a,b);

export function createFinanceGlQaEmulatorService(db,{abortAfterStagingWrites=false}={}){
  if(!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')
    ||db.projectId!==PROJECT)
    fail('LIVE_DATABASE_FORBIDDEN');
  return {
    async execute(identity,command){
      // This is only a synthetic QA identity argument, NOT a verified token.
      if(identity?.role!=='owner'||!id(identity.uid))fail('QA_OWNER_REQUIRED');
      if(!id(command?.scopeKey)||!id(command?.opId)
        ||!Array.isArray(command.append)||command.append.some(j=>!id(j?.id)))
        fail('INVALID_COMMAND_ID');
      const root=db.collection('users').doc(identity.uid);
      const controlRef=root.collection('accounting').doc('control');
      const manifestRef=root.collection('workspace').doc('meta');
      // Must be underneath the server-owned 'accounting' namespace: the
      // currently checked-in Rules prohibit ALL client writes there. Never
      // reuse root-level QA namespaces as future live financial accounts.
      const sourceRef=controlRef.collection('financeGlQaSources').doc(command.scopeKey);
      const ledgerRef=controlRef.collection('financeGlQaLedgers').doc(command.scopeKey);
      const receiptRef=controlRef.collection('financeGlQaReceipts').doc(command.opId);

      return db.runTransaction(async tx=>{
        // All reads must occur before any transaction writes.
        const [controlSnap,metaSnap,sourceSnap,ledgerSnap,receiptSnap]=
          await tx.getAll(controlRef,manifestRef,sourceRef,ledgerRef,receiptRef);
        const control=controlSnap.data(),meta=metaSnap.data(),
          source=sourceSnap.data(),ledger=ledgerSnap.data();
        if(!controlSnap.exists||control?.format!=='LOUREX_PERIOD_CONTROL_V1'
          ||control.version!==1||control.ownerUid!==identity.uid
          ||!Number.isSafeInteger(control.generation)||control.generation<1
          ||!Array.isArray(control.boundaries)
          ||!metaSnap.exists||meta?.chunkStorage!=='period-generations-v1'
          ||!id(meta.revision))fail('TRUSTED_PERIOD_AUTHORITY_MISSING');
        if(!sourceSnap.exists||source?.format!=='LOUREX_FINANCE_GL_QA_SOURCE_V1'
          ||source.ownerUid!==identity.uid||source.sourceRevision!==meta.revision
          ||!source.controls||!source.evidence||!id(source.workspaceId)
          ||!id(source.branchId))fail('ORIGINAL_SOURCE_AUTHORITY_MISSING');
        // Merely matching the manifest revision is NOT proof that the source
        // records came from that immutable, server-enrolled workspace.
        // Read the original immutable generation chunks within this transaction,
        // validate their canonical SHA and compare COMPLETE source arrays.
        const checkedMeta=validateMeta(meta);
        if(checkedMeta.chunkStorage!=='period-generations-v1'
          ||checkedMeta.chunkCount>24)fail('QA_SOURCE_SIZE_UNSUPPORTED');
        const chunkRefs=Array.from({length:checkedMeta.chunkCount},(_,i)=>
          root.collection('periodGenerations').doc(checkedMeta.revision)
            .collection('chunks')
            .doc('chunk-'+checkedMeta.revision+'-'+String(i).padStart(5,'0')));
        const chunkDocs=await tx.getAll(...chunkRefs);
        let published;
        try{published=decodeWorkspace(checkedMeta,
          chunkDocs.map(snap=>snap.exists?snap.data():null));}
        catch{fail('PUBLISHED_WORKSPACE_INVALID');}
        const controls=source.controls,evidence=source.evidence;
        if(!same(evidence.purchases,published.purchases)
          ||!same(evidence.documents,published.documents)
          ||!same(evidence.movements,published.inventoryMovements)
          ||!Array.isArray(evidence.orderedMovementIds)
          ||evidence.orderedMovementIds.length!==published.inventoryMovements.length
          ||evidence.orderedMovementIds.some((id,i)=>id!==published.inventoryMovements[i]?.id))
          fail('SOURCE_NOT_IN_PUBLISHED_WORKSPACE');
        if(controls.workspaceId!==source.workspaceId
          ||controls.branchId!==source.branchId
          ||evidence.scope?.workspaceId!==source.workspaceId
          ||evidence.scope?.branchId!==source.branchId)
          fail('SOURCE_SCOPE_INVALID');

        if(!ledgerSnap.exists||ledger?.format!=='LOUREX_FINANCE_GL_QA_LEDGER_V1'
          ||ledger.ownerUid!==identity.uid||ledger.workspaceId!==source.workspaceId
          ||ledger.branchId!==source.branchId
          ||ledger.authorityPresent!==true
          ||ledger.periodGeneration!==control.generation
          ||!Array.isArray(ledger.journals)||!Array.isArray(ledger.receipts))
          fail('LEDGER_AUTHORITY_MISSING');
        if(ledger.sourceSha256!==fingerprintSyntheticFinanceSources(evidence))
          fail('SOURCE_CHANGED');
        const relevant=control.boundaries.filter(b=>b?.workspaceId===source.workspaceId);
        if(relevant.length>1||relevant.some(b=>typeof b.through!=='string'))
          fail('PERIOD_BOUNDARY_INVALID');
        const cutoff=relevant[0]?.through??null;
        const fullState={...ledger,closedThrough:cutoff};
        const known=fullState.receipts.filter(r=>r.opId===command.opId);
        if(known.length>1||receiptSnap.exists!==Boolean(known.length)
          ||receiptSnap.exists&&!same(receiptSnap.data(),known[0]))
          fail('RECEIPT_AUTHORITY_MISSING');

        if(fullState.journals.length>100||fullState.receipts.length>100)
          fail('QA_LEDGER_CAPACITY');
        const priorRefs=fullState.journals.map(j=>{
          if(!id(j.id))fail('INVALID_OLD_JOURNAL');
          return controlRef.collection('financeGlQaJournals').doc(j.id);
        });
        if(priorRefs.length){
          const docs=await tx.getAll(...priorRefs);
          if(docs.some((snap,index)=>!snap.exists
            ||!same(snap.data(),fullState.journals[index])))
            fail('JOURNAL_AUTHORITY_MISSING');
        }
        const result=prototypeFinanceGlAtomicAppend({
          state:fullState,identity,command,sourceEvidence:evidence,
          controls,verifySourceBoundGl:inspectSourceBoundStockGl
        });
        if(result.replayed){
          return{...result,emulatorCommitted:false,productionReady:false};
        }

        const appendedRefs=command.append.map(j=>
          controlRef.collection('financeGlQaJournals').doc(j.id));
        const exists=await tx.getAll(...appendedRefs);
        if(exists.some(snap=>snap.exists))fail('EXISTING_JOURNAL_COLLISION');

        for(let i=0;i<appendedRefs.length;i++)
          tx.create(appendedRefs[i],structuredClone(command.append[i]));
        tx.create(receiptRef,structuredClone(result.receipt));
        // Copy the entire small synthetic state as a CAS anchor. Firestore
        // detects concurrent updates to this document and retries/aborts.
        const nextState={...result.state,format:'LOUREX_FINANCE_GL_QA_LEDGER_V1'};
        tx.update(ledgerRef,nextState);
        if(abortAfterStagingWrites)fail('INJECTED_TRANSACTION_ABORT');
        return{...result,emulatorCommitted:true,productionReady:false};
      });
    }
  };
}
