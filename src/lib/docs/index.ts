export {
  clearAllDocuments,
  docRegistry,
  forgetDocument,
  replaceText,
  setBibEntries,
  useAdapter,
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
export { downloadExtensionOf, downloadName, sanitizeDocumentName } from "./names";
export { roleFromChecks, selfKind, type SelfKind } from "./role";
export { placesOf, type PlaceSummary } from "./places";
export { bibSpanOf, lineAt, lineOf, lineStarts, pageOf } from "./spans";
export {
  clearSnapshots,
  forgetSnapshot,
  recordSnapshot,
  snapshotDocIds,
  snapshotOf,
  type TextSnapshot,
} from "./snapshot";
export {
  clearEdits,
  editedWithin,
  forgetEdits,
  hasEdits,
  movedBy,
  projectOffset,
  recordEdits,
  type TextEdit,
} from "./edits";
export { buildSubmission, withCompanions, type Submission } from "./submission";
export { countCodePoints, countWords, sha256Hex } from "./units";
