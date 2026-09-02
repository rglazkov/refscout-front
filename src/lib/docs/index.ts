export {
  clearAllDocuments,
  docRegistry,
  forgetDocument,
  replaceText,
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
export { buildSubmission, withCompanions, type Submission } from "./submission";
export { countCodePoints, countWords, sha256Hex } from "./units";
