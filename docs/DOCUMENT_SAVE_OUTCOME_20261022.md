# Document save confirmation — 22 October 2026

Baseline: #959, `4d25b02444f10ae267cec80d32a308d1d1cef4c8`.

## Confirmed defect

The merge intentionally preserves a concurrently issued final over a stale
draft. App.saveDocument nevertheless resolved successfully, rebound the editor
to its unsaved draft on manual save, and displayed "Document saved". Automatic
save also resolved successfully, so EditorPageCore marked the unsaved edits as
saved and could close through its ordinary successful-save path.

The synthetic runtime reproduction stored the issued content while the editor
displayed different draft content with a success toast. Four regression checks
failed before correction: manual stale save, automatic stale save, manual use
of the actual stored scoped row, and confirmation after an account-view change.

## Limited correction

After the existing persist call, confirm the same Firebase/account-storage
identity is still visible and the document in the active scoped vault matches
the intended content. Use the existing canonical comparison, ignoring only
updatedAt and normalizing historical default/main scope.
New editor rows may omit scope before their first save. Fill only omitted
scope IDs from the originating vault before comparing, matching that save's
existing scope stamping while retaining explicit source IDs. Six additional
regressions cover manual save, autosave and issuance in an extra workspace or
non-main branch; they failed before this comparison correction.

If the document differs or is unavailable, reject the save acknowledgement with
a localized instruction to reopen Documents. Leave unsaved editor work intact;
the existing editor error handling retains its unsaved state. Do not show a
success toast or begin electronic-copy creation on that path. On confirmed
success, manual save and electronic-copy preparation use the actual stored
row. Autosave still does not rebind the active editor prop.

No merge priority, persistence API, stock posting, financial formula, schema or
existing audit-generation behavior changes. This verifies the outcome after
local persistence; it does not roll back a completed merge or unrelated settings
saved with it, nor claim to have prevented the earlier local commit when the
account view changes afterward.

## Verification and data boundaries

The harness runs original App.persist and App.saveDocument implementations,
real domain functions and a synthetic local CAS store. It covers manual and
automatic conflicts, normal scoped saves, failed CAS, post-commit account-view
changes and normal issuance. Electronic-copy calls are captured locally; no
network or real Firebase account is used. A runtime extraction of the original
EditorPageCore.save confirms an unsuccessful autosave stays unsaved with its
draft text intact. Existing Safari prop-stability source checks retain their
manual-only binding requirement and now name the confirmed stored row.
The existing QR/approval VM harness receives the account-identity and real
comparison dependencies introduced by the acknowledgement check; its original
approval and publication-order assertions are preserved.

No customer-data cleanup, migration, production settings, Firebase-rule change
or deployment. Physical iPhone and every live-cloud concurrency path remain
outside this synthetic acceptance.
