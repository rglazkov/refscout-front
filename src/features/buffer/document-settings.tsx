"use client";

import * as React from "react";
import { PencilIcon, Trash2Icon, TypeIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { countCodePoints, limits } from "@/lib/docs";
import { type BufferItem, type ModuleId } from "@/lib/domain";
import { useBufferStore } from "@/stores";

import { AttachmentField } from "./attachment-field";
import { PasteInEditor } from "./paste-in-editor";

/**
 * Everything a check needs besides the text, on the card of the document it
 * will read. Two things live here and they are the same kind of thing: the
 * settings of the check, and the other text it reads.
 *
 * Both belong to the document rather than to the job. A buffer holding two
 * manuscripts is an ordinary buffer, and two manuscripts have two subject areas
 * and two bibliographies; one set of switches over the whole run could not say
 * that, and would leave the person guessing which document it applied to.
 *
 * Only the checks ticked on this document appear. The panel answers "what will
 * happen to this file", so a section for a check that will not run on it is an
 * answer to a question nobody asked.
 */
export function DocumentSettings({ item }: { readonly item: BufferItem }) {
  return (
    /* A recessed tray with a panel per check standing on it. Four checks worth
       of switches in one bordered box is a single sheet a person has to read
       from the top to find the one section they came for; separating them costs
       nothing and makes the panel scannable. */
    <div className="mt-2 space-y-2.5 rounded-lg border bg-muted p-2.5">
      {item.checks.includes("bibcheck") ? <Bibcheck item={item} /> : null}
      {item.checks.includes("glossary") ? <Glossary item={item} /> : null}
      {item.checks.includes("presubmit") ? <Presubmit item={item} /> : null}
      {item.checks.includes("cite") ? <Cite item={item} /> : null}
    </div>
  );
}

/**
 * One check's settings. The name of the check sits on the panel's own border,
 * so the eye finds the section it wants without reading the switches inside it.
 */
function Section({
  module,
  children,
}: {
  readonly module: ModuleId;
  readonly children: React.ReactNode;
}) {
  const checkName = useTranslations("capabilities");
  return (
    <fieldset
      className="rounded-lg border bg-card px-3 pt-2 pb-3 shadow-[var(--elevation-xs)]"
      data-testid={`settings-${module}`}
    >
      <legend className="px-1.5 text-[0.6875rem] font-semibold tracking-[0.08em] text-primary uppercase">
        {checkName(module)}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

function Bibcheck({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.settings");
  const setOptions = useBufferStore((state) => state.setOptions);
  const options = item.options.bibcheck;
  const set = (patch: Partial<typeof options>) => setOptions(item.id, "bibcheck", patch);

  return (
    <Section module="bibcheck">
      {/* The bibliography is not a document of the buffer: it is what BibCheck
          on this manuscript reads, and it is brought in here. */}
      <AttachmentField item={item} slot="bibcheck" />
      <label
        htmlFor={`verify-live-${item.id}`}
        className="flex items-center gap-2 text-sm"
      >
        <Checkbox
          id={`verify-live-${item.id}`}
          checked={options.verifyLive}
          onCheckedChange={(checked) => set({ verifyLive: checked === true })}
        />
        {t("verifyLive")}
      </label>
      <label
        htmlFor={`show-orphans-${item.id}`}
        className="flex items-center gap-2 text-sm"
      >
        <Checkbox
          id={`show-orphans-${item.id}`}
          checked={options.showOrphans}
          onCheckedChange={(checked) => set({ showOrphans: checked === true })}
        />
        {t("showOrphans")}
      </label>
      <label
        htmlFor={`count-commented-${item.id}`}
        className="flex items-center gap-2 text-sm"
      >
        <Checkbox
          id={`count-commented-${item.id}`}
          checked={options.countCommented}
          onCheckedChange={(checked) => set({ countCommented: checked === true })}
        />
        {t("countCommented")}
      </label>
      <label
        htmlFor={`unify-keys-${item.id}`}
        className="flex items-center gap-2 text-sm"
      >
        <Checkbox
          id={`unify-keys-${item.id}`}
          checked={options.unifyKeys}
          onCheckedChange={(checked) => set({ unifyKeys: checked === true })}
        />
        {t("unifyKeys")}
      </label>
      <Choice
        id={`key-format-${item.id}`}
        label={t("keyFormat")}
        value={options.keyFormat}
        onValueChange={(value) => set({ keyFormat: value as typeof options.keyFormat })}
        options={(
          ["author-year", "author-year-title", "author-title-year", "numeric"] as const
        ).map((value) => ({ value, label: t(`keyFormats.${value}`) }))}
      />
      <Choice
        id={`sort-by-${item.id}`}
        label={t("sortBy")}
        value={options.sortBy}
        onValueChange={(value) => set({ sortBy: value as typeof options.sortBy })}
        options={(
          ["author", "year", "title", "key", "cited-order", "original"] as const
        ).map((value) => ({ value, label: t(`sortOrders.${value}`) }))}
      />
    </Section>
  );
}

/**
 * One choice out of a list, on a card. The label is beside the control rather
 * than wrapped around it, because the list is a listbox the control opens and
 * not a field the label can point into.
 */
function Choice({
  id,
  label,
  value,
  onValueChange,
  options,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}) {
  return (
    <div className="text-sm">
      <label htmlFor={id} className="block">
        {label}
      </label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger id={id} surface="card" size="sm" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Glossary({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.settings");
  const setOptions = useBufferStore((state) => state.setOptions);

  return (
    <Section module="glossary">
      <AttachmentField item={item} slot="glossary" />
      <label htmlFor={`domain-${item.id}`} className="block text-sm">
        {t("domain")}
        <Input
          id={`domain-${item.id}`}
          aria-label={t("domain")}
          surface="card"
          className="mt-1"
          value={item.options.glossary.domain ?? ""}
          onChange={(event) =>
            setOptions(item.id, "glossary", { domain: event.target.value })
          }
        />
      </label>
    </Section>
  );
}

function Presubmit({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.settings");
  const setOptions = useBufferStore((state) => state.setOptions);

  return (
    <Section module="presubmit">
      {/* The venue's requirements are this check's second text, and they are
          brought in exactly as the other two are. */}
      <AttachmentField item={item} slot="venue" />
      <label htmlFor={`anonymity-${item.id}`} className="flex items-center gap-2 text-sm">
        <Checkbox
          id={`anonymity-${item.id}`}
          checked={item.options.presubmit.anonymity}
          onCheckedChange={(checked) =>
            setOptions(item.id, "presubmit", { anonymity: checked === true })
          }
        />
        {t("anonymity")}
      </label>
    </Section>
  );
}

/**
 * Cite reads a piece of writing and proposes real sources for the claims in it,
 * so the setting that matters is which piece: the whole document, or a
 * paragraph or draft section pasted into the box. The box is a box rather than
 * a line because what goes into it is a passage of prose - a claim needs its
 * sentences around it before a source can be proposed for it.
 */
function Cite({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.settings");
  const setOptions = useBufferStore((state) => state.setOptions);
  const options = item.options.cite;

  return (
    <Section module="cite">
      <div className="flex flex-wrap gap-2">
        {(["excerpt", "document"] as const).map((source) => (
          <Button
            key={source}
            type="button"
            size="xs"
            variant={options.source === source ? "default" : "outlineOnCard"}
            aria-pressed={options.source === source}
            data-testid={`cite-source-${source}`}
            onClick={() => setOptions(item.id, "cite", { source })}
          >
            {t(`citeSource.${source}`)}
          </Button>
        ))}
      </div>

      {options.source === "excerpt" ? (
        <Excerpt item={item} />
      ) : (
        <p className="text-xs text-muted-foreground">{t("citeWholeDocument")}</p>
      )}

      <label htmlFor={`max-per-claim-${item.id}`} className="block text-sm">
        {t("maxPerClaim")}
        <Input
          id={`max-per-claim-${item.id}`}
          aria-label={t("maxPerClaim")}
          type="number"
          min={1}
          max={20}
          surface="card"
          className="mt-1 font-mono"
          value={options.maxPerClaim}
          onChange={(event) =>
            setOptions(item.id, "cite", {
              maxPerClaim: Math.max(1, Number(event.target.value) || 1),
            })
          }
        />
      </label>
      <label htmlFor={`instructions-${item.id}`} className="block text-sm">
        {t("instructions")}
        <Textarea
          id={`instructions-${item.id}`}
          aria-label={t("instructions")}
          rows={3}
          surface="card"
          className="mt-1"
          value={options.instructions ?? ""}
          onChange={(event) =>
            setOptions(item.id, "cite", { instructions: event.target.value })
          }
        />
      </label>
    </Section>
  );
}

/**
 * The passage Cite reads. What goes in here is a paragraph or a draft section,
 * so it is written in the editor a document is read in - the same box the
 * bibliography and the requirements are pasted into - and the card shows what
 * is in the slot rather than a sliver of it.
 */
function Excerpt({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.settings");
  const format = useFormatter();
  const setOptions = useBufferStore((state) => state.setOptions);
  const [writing, setWriting] = React.useState(false);
  const excerpt = item.options.cite.excerpt ?? "";
  const chars = countCodePoints(excerpt);
  const tooLong = chars > limits.maxCiteExcerptChars;

  return (
    <div className="space-y-1.5">
      <p className="text-sm">{t("excerpt")}</p>

      {excerpt === "" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-dashed border-input px-2.5 py-2">
          <span className="flex-1 text-xs text-muted-foreground">
            {t("excerptEmpty")}
          </span>
          <Button
            type="button"
            variant="outlineOnCard"
            size="xs"
            data-testid="cite-excerpt-write"
            onClick={() => setWriting(true)}
          >
            <TypeIcon aria-hidden="true" />
            {t("excerptPaste")}
          </Button>
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-control-card px-2.5 py-2"
          data-testid="cite-excerpt"
        >
          <span className="min-w-0 flex-1 truncate text-sm">{firstLine(excerpt)}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {t("excerptVolume", { chars: format.number(chars) })}
          </span>
          {/* On a control fill, so it takes the other surface. */}
          <Button
            type="button"
            variant="outline"
            size="xs"
            data-testid="cite-excerpt-write"
            onClick={() => setWriting(true)}
          >
            <PencilIcon aria-hidden="true" />
            {t("excerptOpen")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("excerptClear")}
            onClick={() => setOptions(item.id, "cite", { excerpt: "" })}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      )}

      {tooLong ? (
        <p role="alert" className="text-xs text-critical">
          {t("excerptTooLong", { limit: limits.maxCiteExcerptChars })}
        </p>
      ) : null}

      <PasteInEditor
        open={writing}
        title={t("excerpt")}
        initial={excerpt}
        confirmLabel={t("excerptUse")}
        onClose={() => setWriting(false)}
        onDone={(text) => setOptions(item.id, "cite", { excerpt: text })}
      />
    </div>
  );
}

/** The opening of the passage, so the filled slot says which passage it holds. */
function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 120)}…` : line;
}
