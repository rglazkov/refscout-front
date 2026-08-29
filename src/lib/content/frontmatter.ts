import matter from "gray-matter";
import type { ZodType } from "zod";

/**
 * Parses the front matter of a file. A separate function for the sake of the
 * messages: a bare YAMLParseError does not say which file is broken or what to
 * do about it, and the message is exactly what the author of the text reads.
 *
 * The most common trap is a colon inside a value: YAML reads it as the start
 * of a nested field. That is why the quoting advice is stated outright.
 */
export function parseFrontmatter<T>(
  source: string,
  schema: ZodType<T>,
  where: string,
): { readonly data: T; readonly content: string } {
  let parsed;
  try {
    parsed = matter(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read the front matter of ${where}: ${detail}
` + "Most often the cause is a colon inside a value - put the string in quotes.",
    );
  }

  const result = schema.safeParse(parsed.data);
  if (!result.success) {
    throw new Error(
      `The front matter of ${where} has the wrong shape: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} - ${issue.message}`)
        .join("; ")}`,
    );
  }

  return { data: result.data, content: parsed.content };
}
