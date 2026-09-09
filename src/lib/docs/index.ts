export {
  applyEdit,
  clearAllDocuments,
  docRegistry,
  forgetDocument,
  replaceText,
  setBibEntries,
  installAdapter,
  type DocRegistryAdapter,
} from "./registry";
export { detectKind, extensionOf, formatOf, proposeChecks } from "./detect";
export {
  canonicalise,
  decode,
  detectEol,
  fromBytes,
  fromString,
  isDerivedFormat,
  normalizeLineEndings,
  repairCodePoints,
  type Eol,
  type ExtractedText,
} from "./canonical";
export {
  holdSourceFile,
  releaseAllSourceFiles,
  releaseSourceFile,
  sourceFileOf,
} from "./sources";
export {
  limits,
  refuseAttachmentBySize,
  refuseAttachmentByVolume,
  refuseByCount,
  refuseBySize,
  refuseByVolume,
  type IntakeRefusal,
} from "./limits";
export {
  downloadExtensionOf,
  downloadFormatsOf,
  downloadName,
  sanitizeDocumentName,
} from "./names";
export { roleFromChecks, selfKind, type SelfKind } from "./role";
export { placesOf, type PlaceSummary } from "./places";
export { bibSpanOf, lineAt, lineOf, lineStarts, pageOf } from "./spans";
export {
  clearSnapshots,
  forgetSnapshot,
  observeSnapshots,
  recordSnapshot,
  restoreSnapshot,
  snapshotDocIds,
  snapshotOf,
  type TextSnapshot,
} from "./snapshot";
export {
  clearEdits,
  editedWithin,
  editsOf,
  forgetEdits,
  hasEdits,
  movedBy,
  observeEdits,
  projectOffset,
  recordEdits,
  restoreEdits,
  type Replacement,
  type TextEdit,
} from "./edits";
export { buildSubmission, withCompanions, type Submission } from "./submission";
export { countCodePoints, countWords, sha256Hex } from "./units";
