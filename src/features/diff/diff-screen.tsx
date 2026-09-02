"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  HighlighterIcon,
  Trash2Icon,
  TypeIcon,
  UploadIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { ModeHeader } from "@/components/mode-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { detectKind, downloadExtensionOf, releaseSourceFile } from "@/lib/docs";
import { type DetectedKind, type SourceFormat } from "@/lib/domain";
import { downloadText } from "@/lib/export";
import { syntaxKindOf, useSyntax } from "@/features/editor/syntax";
import { acceptFile } from "@/features/intake/intake";
import { PasteOverlay } from "@/features/intake/paste-overlay";
import { RefusalLine } from "@/features/intake/refusal-line";
import { type RefusalNotice } from "@/features/intake/use-intake";
import { compareTexts, countLines, diffLimits, type DiffResult } from "@/workers";

import { MergePanes, type PanesHandle, type Position } from "./merge-panes";

/**
 * DiffChecker: two versions of the same work, side by side.
 *
 * Nothing here goes to a server, and that is not a rule to be kept but a fact
 * about the mode - it has nothing to send. Both panes take the formats the
 * buffer takes, through the same intake, so a `.docx` and the PDF it was
 * printed to can be compared; the comparison itself runs in a worker, so the
 * panes keep scrolling and keep taking what is typed while it is going on.
 *
 * The buffer is untouched by any of this. Coming into the mode and going back
 * leaves it exactly as it was: a mode changes what the working area holds, it
 * does not take the work away.
 */
type Side = "left" | "right";

type Pane = {
  readonly name: string;
  readonly format: SourceFormat;
  /** What the text turned out to be, which is what it is highlighted as. */
  readonly detected: DetectedKind;
  readonly text: string;
  readonly lines: number;
  readonly reading: boolean;
  readonly refusal: RefusalNotice | null;
};

const emptyPane: Pane = {
  name: "",
  format: "typed",
  detected: "unknown",
  text: "",
  lines: 0,
  reading: false,
  refusal: null,
};

/**
 * What the modified pane is handed back as. "Auto" is the product's own rule -
 * the format it was brought in, and for text that was typed or pasted, whatever
 * the text turned out to be - and the rest of the list is there for the times
 * that rule guesses wrong, which is why it can be overridden at all.
 */
const exportFormats = ["auto", "tex", "bib", "md", "txt"] as const;

type ExportFormat = (typeof exportFormats)[number];

function extensionFor(pane: Pane, chosen: ExportFormat): string {
  if (chosen !== "auto") return chosen;
  if (pane.format !== "typed") return downloadExtensionOf(pane.format);
  if (pane.detected === "bibtex") return "bib";
  if (pane.detected === "latex") return "tex";
  if (pane.detected === "markdown") return "md";
  return "txt";
}

export function DiffScreen({ onBack }: { readonly onBack: () => void }) {
  const t = useTranslations("diff");
  const format = useFormatter();

  const [panes, setPanes] = React.useState<Record<Side, Pane>>({
    left: emptyPane,
    right: emptyPane,
  });
  /**
   * The two panes as they stand this instant, which is not the same question as
   * what the last render drew. Reading a file takes seconds, and two files
   * chosen one after the other are two answers arriving into a screen that has
   * moved on since each was asked for - so what decides whether the pair is
   * complete is this, and never the state of the render the choice was made in.
   */
  const held = React.useRef(panes);

  const apply = React.useCallback((side: Side, pane: Pane) => {
    const next = { ...held.current, [side]: pane };
    held.current = next;
    setPanes(next);
    return next;
  }, []);
  const [answer, setAnswer] = React.useState<DiffResult | null>(null);
  const [comparing, setComparing] = React.useState(false);
  /**
   * A comparison the person stopped. It is remembered so that the panes do not
   * simply start it again: they stopped it, and what they get back is the two
   * texts and a button that says so.
   */
  const [stopped, setStopped] = React.useState(false);
  const [highlight, setHighlight] = React.useState(true);
  const [position, setPosition] = React.useState<Position>({ current: 0, total: 0 });
  const [exportAs, setExportAs] = React.useState<ExportFormat>("auto");
  const [pasteInto, setPasteInto] = React.useState<Side | null>(null);
  const handle = React.useRef<PanesHandle | null>(null);
  const holdPanes = React.useCallback((panes: PanesHandle | null) => {
    handle.current = panes;
  }, []);
  const running = React.useRef<AbortController | null>(null);

  const left = panes.left;
  const right = panes.right;
  const both = left.text !== "" && right.text !== "";
  // The same grammar the editor would use, chosen by what the text turned out
  // to be rather than by the extension it arrived under.
  const languageLeft = useSyntax(syntaxKindOf(left.format, left.detected));
  const languageRight = useSyntax(syntaxKindOf(right.format, right.detected));

  /**
   * A comparison of the pair as it now stands. It is started where a pane
   * changes rather than watched for afterwards: the pair is known at the moment
   * it is completed, and a comparison that begins there begins once.
   */
  const compare = React.useCallback(async (a: string, b: string) => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setStopped(false);
    setComparing(true);
    try {
      setAnswer(await compareTexts({ a, b }, { signal: controller.signal }));
    } catch {
      // A comparison that was stopped or that failed leaves the two texts where
      // they are: they are readable and editable without it.
      setAnswer(null);
    } finally {
      if (!controller.signal.aborted) setComparing(false);
    }
  }, []);

  const put = (side: Side, pane: Pane) => {
    // A new text on either side is a new comparison: the marks on screen
    // describe the pair that is no longer here.
    running.current?.abort();
    setAnswer(null);
    setComparing(false);
    setStopped(false);
    const next = apply(side, pane);
    if (next.left.text !== "" && next.right.text !== "") {
      void compare(next.left.text, next.right.text);
    }
  };

  /**
   * A file, read exactly the way the buffer reads one - the same worker, the
   * same formats, the same refusals - and then kept here rather than in the
   * buffer, because a pane is not a document under check.
   */
  const bring = async (side: Side, file: File) => {
    const id = crypto.randomUUID();
    running.current?.abort();
    apply(side, { ...emptyPane, name: file.name, reading: true });
    setAnswer(null);
    const result = await acceptFile(file, { bufferChars: 0 }, {}, id);
    // The handle to the person's own disk is needed while the text is coming
    // out and not afterwards: a pane offers no way in that would open it again.
    releaseSourceFile(id);

    if (!result.ok) {
      put(side, {
        ...emptyPane,
        refusal: { name: result.name, refusal: result.refusal },
      });
      return;
    }
    put(side, {
      name: result.item.name,
      format: result.item.sourceFormat,
      detected: result.item.detected,
      text: result.content.text,
      lines: countLines(result.content.text),
      reading: false,
      refusal: null,
    });
  };

  const cancel = () => {
    running.current?.abort();
    setComparing(false);
    setStopped(true);
  };

  /** Both panes at once: a comparison is a pair, and so is starting over. */
  const clear = () => {
    running.current?.abort();
    held.current = { left: emptyPane, right: emptyPane };
    setPanes(held.current);
    setAnswer(null);
    setComparing(false);
    setStopped(false);
    setPosition({ current: 0, total: 0 });
  };

  const overLimit = answer?.overLimit === true;

  return (
    <div className="mt-6 space-y-4" data-testid="diff-screen">
      <ModeHeader title={t("title")} lead={t("lead")} back={t("back")} onBack={onBack}>
        {left.text === "" && right.text === "" ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="diff-clear"
            onClick={clear}
          >
            <Trash2Icon aria-hidden="true" />
            {t("clearBoth")}
          </Button>
        )}
      </ModeHeader>

      <div className="grid gap-3 sm:grid-cols-2">
        <PaneHead
          label={t("original")}
          pane={left}
          onFile={(file) => void bring("left", file)}
          onPaste={() => setPasteInto("left")}
        />
        <PaneHead
          label={t("modified")}
          pane={right}
          onFile={(file) => void bring("right", file)}
          onPaste={() => setPasteInto("right")}
        />
      </div>

      {both ? null : (
        <p className="text-sm text-muted-foreground" data-testid="diff-waiting">
          {t("bringBoth")}
        </p>
      )}

      {stopped && !comparing ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
          <span className="text-sm">{t("stopped")}</span>
          <Button
            type="button"
            variant="outlineOnCard"
            size="sm"
            data-testid="diff-compare-again"
            onClick={() => void compare(left.text, right.text)}
          >
            {t("compareAgain")}
          </Button>
        </div>
      ) : null}

      {comparing ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3"
          role="status"
        >
          <span className="text-sm">{t("comparing")}</span>
          <Button type="button" variant="outlineOnCard" size="sm" onClick={cancel}>
            {t("cancelCompare")}
          </Button>
        </div>
      ) : null}

      {overLimit ? (
        <p
          role="alert"
          data-testid="diff-over-limit"
          className="rounded-lg border border-warning-border bg-warning-soft p-3 text-sm text-warning"
        >
          {t("overLimit", {
            left: format.number(answer?.lines.a ?? 0),
            right: format.number(answer?.lines.b ?? 0),
            limit: format.number(diffLimits.maxLines),
          })}
        </p>
      ) : null}

      {answer === null || overLimit ? null : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            {/* Where the reader is, and how much is left. Standing inside a
                change the line says which one of how many; between two of them
                it says how many there are in all. */}
            <span className="text-sm" data-testid="diff-summary">
              {position.current === 0 ? (
                <>
                  <span className="font-mono font-semibold">
                    {format.number(position.total)}
                  </span>{" "}
                  {t("changes", { count: position.total })}
                </>
              ) : (
                t("position", {
                  current: format.number(position.current),
                  total: format.number(position.total),
                })
              )}
            </span>
            <span className="flex-1" />
            <Button
              type="button"
              variant="outlineOnCard"
              size="icon-sm"
              aria-label={t("previousChange")}
              title={t("previousChange")}
              onClick={() => handle.current?.previous()}
            >
              <ArrowUpIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outlineOnCard"
              size="icon-sm"
              aria-label={t("nextChange")}
              title={t("nextChange")}
              onClick={() => handle.current?.next()}
            >
              <ArrowDownIcon aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={highlight ? "default" : "outlineOnCard"}
              size="sm"
              aria-pressed={highlight}
              data-testid="diff-highlight"
              onClick={() => setHighlight(!highlight)}
            >
              <HighlighterIcon aria-hidden="true" />
              {t("highlight")}
            </Button>
          </div>

          <div data-diff-highlight={highlight ? "on" : "off"}>
            <MergePanes
              onReady={holdPanes}
              onPosition={setPosition}
              left={left.text}
              right={right.text}
              changes={answer.changes}
              labelLeft={t("original")}
              labelRight={t("modified")}
              languageLeft={languageLeft}
              languageRight={languageRight}
              onLeftChange={(text) => apply("left", { ...held.current.left, text })}
              onRightChange={(text) => apply("right", { ...held.current.right, text })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(right.text)}
            >
              <CopyIcon aria-hidden="true" />
              {t("copyModified")}
            </Button>
            {/* The changed pane comes back in the format it was brought in -
                the same rule the buffer downloads by - and the list beside the
                button is for a text that was pasted rather than brought, where
                that rule has only the text itself to read. */}
            <Select
              value={exportAs}
              onValueChange={(value) => setExportAs(value as ExportFormat)}
            >
              <SelectTrigger size="sm" className="w-36" aria-label={t("formatLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exportFormats.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "auto"
                      ? t("formatAuto", { extension: extensionFor(right, "auto") })
                      : t("formatNamed", { extension: option })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="diff-export"
              onClick={() =>
                downloadText(right.text, right.name, "", extensionFor(right, exportAs))
              }
            >
              <DownloadIcon aria-hidden="true" />
              {t("export", { extension: extensionFor(right, exportAs) })}
            </Button>
            <span className="text-[0.8125rem] text-muted-foreground">
              {t("panesNote", { limit: format.number(diffLimits.maxLines) })}
            </span>
          </div>
        </>
      )}

      <PasteOverlay
        open={pasteInto !== null}
        onClose={() => setPasteInto(null)}
        onAdd={(text, name, textFormat) => {
          const side = pasteInto;
          if (side === null) return;
          put(side, {
            name,
            format: textFormat,
            detected: detectKind(text, textFormat),
            text,
            lines: countLines(text),
            reading: false,
            refusal: null,
          });
        }}
      />
    </div>
  );
}

/** Every format a pane takes, which is every format the buffer takes. */
const ACCEPTED = ".pdf,.docx,.txt,.md,.tex,.bib,.gls";

/**
 * The head of one pane: what is in it, and the ways to put something there.
 *
 * It is the same field a check's second text is brought in on - a dashed
 * outline that takes a file dropped on it, a button that opens the file
 * dialogue and a button that opens the editor to type into. Replacing one side
 * is most of what this mode is used for, so the ways in stay after a text has
 * arrived rather than being replaced by its name.
 */
function PaneHead({
  label,
  pane,
  onFile,
  onPaste,
}: {
  readonly label: string;
  readonly pane: Pane;
  readonly onFile: (file: File) => void;
  readonly onPaste: () => void;
}) {
  const t = useTranslations("diff");
  const format = useFormatter();

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted: File[]) => {
      const file = accepted[0];
      if (file !== undefined) onFile(file);
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {pane.reading
            ? t("reading")
            : pane.text === ""
              ? t("nothingHere")
              : t("lines", { name: pane.name, lines: format.number(pane.lines) })}
        </span>
      </div>

      <div
        {...getRootProps()}
        data-testid="diff-pane-zone"
        data-drag-active={isDragActive}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-dashed border-input px-2.5 py-2 transition-colors",
          isDragActive && "border-primary bg-primary-soft",
        )}
      >
        {/* Rendered at zero size and outside the tab order, as the library
            produces it: the buttons beside it are the controls, and they are
            the ones with names. */}
        <input {...getInputProps()} accept={ACCEPTED} data-testid="diff-pane-input" />
        <span className="flex-1 text-xs text-muted-foreground">{t("dropHere")}</span>
        <Button type="button" variant="outlineOnCard" size="xs" onClick={open}>
          <UploadIcon aria-hidden="true" />
          {t("chooseFile")}
        </Button>
        <Button type="button" variant="outlineOnCard" size="xs" onClick={onPaste}>
          <TypeIcon aria-hidden="true" />
          {t("pasteText")}
        </Button>
      </div>

      {pane.refusal === null ? null : (
        <p
          role="alert"
          className="rounded-md border border-critical-border bg-critical-soft p-2 text-[0.8125rem] text-critical"
        >
          <RefusalLine notice={pane.refusal} />
        </p>
      )}
    </div>
  );
}
