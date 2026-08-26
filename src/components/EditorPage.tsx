import { EditorPage as EditorPageCore } from './EditorPageCore.js';

// Keep the editor's internal draft state scoped to one document identity.
// A new invoice created from a proforma must mount a fresh editor instead of
// retaining the source document's local state.
export function EditorPage(props:any):any {
  return <EditorPageCore key={props.document?.id ?? 'editor'} {...props}/>;
}
