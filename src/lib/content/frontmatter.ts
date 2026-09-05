import matter from "gray-matter";
import { parse as parseToml } from "smol-toml";
import type { ZodType } from "zod";

/**
 * The delimiter that opens a file says which language its front matter is
 * written in: `---` around a YAML block, `+++` around a TOML one. Both are
 * ordinary in the wild, so the author of a text writes the one they know.
 */
const TOML_DELIMITER = "+++";

/**
 * gray-matter reads YAML unaided and has to be handed a parser for any other
 * language. `smol-toml` is that parser: it implements TOML 1.0.0 and brings no
 * dependencies of its own.
 */
const tomlBlock = {
  delimiters: TOML_DELIMITER,
  language: "toml",
  engines: { toml: (block: string) => parseToml(block) as Record<string, unknown> },
};

/** A file saved with a byte order mark still opens with its delimiter. */
function withoutByteOrderMark(source: string): string {
  return source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
}

/**
 * Parses the front matter of a file. A separate function for the sake of the
 * messages: a bare parser error does not say which file is broken or what to do
 * about it, and the message is exactly what the author of the text reads.
 *
 * Each language has its own first trap, so the advice names the one that
 * belongs to the block that failed. In YAML it is a colon inside a value, which
 * the parser reads as the start of a nested field. In TOML it is a bare word on
 * the right of the equals sign, where a string has to be quoted.
 */
export function parseFrontmatter<T>(
  source: string,
  schema: ZodType<T>,
  where: string,
): { readonly data: T; readonly content: string } {
  const isToml = withoutByteOrderMark(source).startsWith(TOML_DELIMITER);

  let parsed;
  try {
    parsed = isToml ? matter(source, tomlBlock) : matter(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const advice = isToml
      ? "Most often the cause is an unquoted value - TOML wants quotes around a string."
      : "Most often the cause is a colon inside a value - put the string in quotes.";
    throw new Error(`Could not read the front matter of ${where}: ${detail}\n${advice}`);
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
