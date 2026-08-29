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
  limits,
  refuseByCount,
  refuseBySize,
  refuseByVolume,
  type IntakeRefusal,
} from "./limits";
export { downloadName, sanitizeDocumentName } from "./names";
export { roleFromChecks } from "./role";
export { buildSubmission, type Submission } from "./submission";
export { countCodePoints, countWords, sha256Hex } from "./units";
