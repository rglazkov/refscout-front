"use client";

import * as React from "react";
import { ChevronDownIcon, DownloadIcon, LoaderIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

/**
 * Taking the text away as a file, and choosing what kind of file.
 *
 * One component for both places a document is handed back - the editor and the
 * changed pane of a comparison - because "you get back the format you brought"
 * is one rule, and a rule written twice is a rule that is about to differ. It
 * lives beside the editor because that is the place a document is downloaded
 * from, and because its words belong to the working screen: a control in
 * `components/` is a control on every address, and the pages of the site would
 * be served the names of six file formats they cannot draw. The
 * list of formats is worked out from the document and arrives here already
 * decided; nothing about what may be offered is known in this file.
 *
 * A list of one is not a choice, so it is not drawn as one: the button then
 * names the format and a press on it saves the file. The menu appears only
 * where there is something to choose between, which for most documents in the
 * product means it does not appear at all.
 */
export function DownloadMenu({
  formats,
  onDownload,
  label,
  brought = true,
  inactive = false,
  testId = "download-document",
  variant = "outline",
  className,
}: {
  /**
   * Every extension this may be saved as, the one the rule chose standing
   * first. That order is the whole of what this component knows about them.
   */
  readonly formats: readonly string[];
  /** Saves the file. It resolves when the file has been handed to the browser. */
  readonly onDownload: (extension: string) => Promise<void>;
  /**
   * What the button says, where "Download" is not what is being done. The
   * search results are exported rather than downloaded and the button counts
   * them, so that screen names its own action.
   */
  readonly label?: string;
  /**
   * Whether the first format is the one the text arrived in. It is for a
   * document and not for a list of search results: those were never a file, so
   * naming a row "as it came in" would be answering a question nobody asked.
   */
  readonly brought?: boolean;
  /**
   * Nothing to save yet. The button stays where it is and says so - it is not
   * taken away and it is not `disabled`, because a control that vanishes moves
   * the row it stood in and a disabled one cannot be reached to be asked why.
   */
  readonly inactive?: boolean;
  readonly testId?: string;
  readonly variant?: React.ComponentProps<typeof Button>["variant"];
  readonly className?: string;
}) {
  const t = useTranslations("download");
  const [open, setOpen] = React.useState(false);
  /**
   * Which format is being written, or nothing. It is the extension rather than
   * a flag because the row that was pressed is the row that has to say it is
   * working - a spinner on the whole menu says the menu is busy, which is not
   * the thing the person asked about.
   */
  const [saving, setSaving] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  /*
   * The button is never disabled - no button in this product is. While a file
   * is being written the row says so, and a second press during that time is
   * ignored rather than queued: two presses mean one file, and the person meant
   * the first.
   */
  const save = (extension: string): void => {
    if (saving !== null) return;
    setSaving(extension);
    setFailed(false);
    void onDownload(extension).then(
      () => {
        setSaving(null);
        setOpen(false);
      },
      () => {
        setSaving(null);
        setFailed(true);
        setOpen(false);
      },
    );
  };

  const first = formats[0] ?? "txt";

  if (inactive || formats.length < 2) {
    return (
      <Download
        variant={variant}
        className={className}
        testId={testId}
        busy={saving !== null}
        aria-disabled={inactive}
        onClick={() => {
          if (!inactive) save(first);
        }}
      >
        {label ?? t("action", { extension: first })}
      </Download>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Download
          variant={variant}
          className={className}
          testId={testId}
          busy={saving !== null}
          aria-expanded={open}
        >
          {label ?? t("open")}
          <ChevronDownIcon
            className={cn(
              // The caret turns to point at the panel it opened, on the same
              // short token every other small state change uses.
              "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </Download>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto min-w-64 p-1.5">
        <ul aria-label={t("menuLabel")}>
          {formats.map((extension, index) => (
            <li key={extension}>
              <button
                type="button"
                data-testid={`download-as-${extension}`}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
                onClick={() => save(extension)}
              >
                {saving === extension ? (
                  <LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <DownloadIcon
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {/* An extension is an identifier, so it is set in the mono
                    face - the same rule that puts a count of characters there
                    and leaves the sentence beside it in the sans. */}
                <span className="font-mono">.{extension}</span>
                <span className="ms-auto ps-3 text-[0.8125rem] text-muted-foreground">
                  {index === 0 && brought ? t("native") : t(`formats.${extension}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {/* What a conversion costs, said at the moment somebody is choosing it
            rather than standing over their manuscript for the rest of the
            session. It is said only where the file that comes out is not the
            person's document at all - a bibliography written out in another
            format's fields - and a list holds at most one of these. */}
        {formats.filter(hasNote).map((extension) => (
          <p
            key={extension}
            className="border-t px-2 pt-2 pb-1 text-xs text-muted-foreground"
          >
            {t(`notes.${extension}`)}
          </p>
        ))}
        {/* Said where it was asked for, and it stays until the next attempt.
            The text itself is untouched and is still in front of the person -
            what did not work is the making of a file out of it. */}
        {failed ? (
          <p role="alert" className="border-t px-2 pt-2 pb-1 text-xs text-destructive">
            {t("failed")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** The formats whose menu row carries a sentence under the list. */
const NOTED = new Set(["ris"]);

function hasNote(extension: string): boolean {
  return NOTED.has(extension);
}

/**
 * The button itself, shared by the two shapes above so that the one with a menu
 * and the one without are the same control with the same weight in the row of
 * buttons it stands in.
 */
function Download({
  busy,
  testId,
  variant,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  readonly busy: boolean;
  readonly testId: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className={className}
      data-testid={testId}
      aria-busy={busy}
      {...props}
    >
      {busy ? (
        <LoaderIcon className="animate-spin" aria-hidden="true" />
      ) : (
        <DownloadIcon aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}
