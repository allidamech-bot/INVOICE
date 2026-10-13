/** Max complete working quote lines from locally validated structured sources.
 * This limit is shared by the source reviewer, editor and approval guards;
 * generic model-generated document plans remain limited to 20 rows. */
export const AI_WORKING_QUOTE_MAX_LINES=120;
export const AI_MODEL_PLANNED_DOCUMENT_MAX_LINES=20;
/** Keep undo snapshots bounded in large documents (Firestore record safety). */
export function aiDraftUndoDepth(lines:number):number{return lines>80?5:lines>40?10:50;}
