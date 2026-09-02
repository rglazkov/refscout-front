/**
 * The technical identifiers of the checks. They live in the code and in the API
 * and never change; on screen their names come from the dictionary.
 */
export const moduleIds = ["bibcheck", "glossary", "presubmit", "cite"] as const;

export type ModuleId = (typeof moduleIds)[number];

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && (moduleIds as readonly string[]).includes(value);
}
