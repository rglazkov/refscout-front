"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import {
  GlobeIcon,
  LinkIcon,
  PencilIcon,
  Trash2Icon,
  TypeIcon,
  UploadIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, fetchVenueRequirements } from "@/lib/api";
import { cn } from "@/lib/cn";
import { type BufferItem, type FilledSlot } from "@/lib/domain";
import { selfKind } from "@/lib/docs";
import { RefusalLine } from "@/features/intake/refusal-line";
import { useIntake, type RefusalNotice } from "@/features/intake/use-intake";
import { companionChoices, companionOf, useBufferStore, useUiStore } from "@/stores";

import { PasteInEditor } from "./paste-in-editor";

/**
 * How a check is given the second text it reads.
 *
 * BibCheck reads the bibliography the manuscript cites - or, ticked on the
 * bibliography, the manuscript that cites it; Glossary reads the glossary file
 * that already exists; PreSubmit reads the venue's requirements. There are two
 * ways in and they end in the same link. A document of the buffer can be named,
 * because the pair is often two files the person brought together and both of
 * them are theirs to open, correct and download. Or a text can be brought in
 * here - dropped, chosen or pasted - when it is not a document they came to
 * have checked and a card of its own would only be in the way.
 *
 * The venue keeps a third way, an address, and only the venue: requirements
 * live on a call-for-papers page rather than in a file on the disk. What comes
 * back is read into the browser as a text like the others, so it opens in the
 * editor and is removed the same way.
 */
export function AttachmentField({
  item,
  slot,
}: {
  readonly item: BufferItem;
  readonly slot: FilledSlot;
}) {
  const t = useTranslations("buffer.attach");
  const attached = useBufferStore((state) => companionOf(state.items, item, slot));

  return (
    <div className="space-y-2">
      {/* What BibCheck reads depends on which half of the pair this card is:
          on a manuscript it is the bibliography, on a bibliography it is the
          manuscript that cites it. Asking a bibliography for a bibliography is
          how a person concludes they have put the file in the wrong place. */}
      <p className="text-sm">{t(`${labelFor(item, slot)}.label`)}</p>
      {attached === undefined ? (
        <Empty item={item} slot={slot} />
      ) : (
        <Filled item={item} slot={slot} attached={attached} />
      )}
    </div>
  );
}

/** Which of the two sentences this slot asks its question with. */
function labelFor(item: BufferItem, slot: FilledSlot): string {
  const self = selfKind(item.sourceFormat, item.detected);
  if (slot === "bibcheck" && self === "bibliography") return "bibcheckCites";
  if (slot === "glossary" && self === "glossary") return "glossaryUsedBy";
  return slot;
}

/**
 * What is in the slot, once something is. The name opens the text, exactly as a
 * document's name does in the buffer: a bibliography and a glossary file are
 * other texts than the manuscript, and the way to read and correct them - and
 * the only place to download them - is the editor.
 */
function Filled({
  item,
  slot,
  attached,
}: {
  readonly item: BufferItem;
  readonly slot: FilledSlot;
  readonly attached: BufferItem;
}) {
  const t = useTranslations("buffer.attach");
  const format = useFormatter();
  const detach = useBufferStore((state) => state.detach);
  const chooseCompanion = useBufferStore((state) => state.chooseCompanion);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const [confirming, setConfirming] = React.useState(false);
  const venueState = slot === "venue" ? item.venue?.state : undefined;
  // A document of the buffer is only unnamed here: it is somebody's document,
  // it keeps its card, and destroying it from another card would take away the
  // one copy of a text they never asked to be rid of.
  const own = attached.attachedTo !== undefined;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border bg-control-card px-2.5 py-2"
      data-testid={`attachment-${slot}`}
    >
      <span className="min-w-0 flex-1 font-mono text-sm break-all">{attached.name}</span>
      <span className="font-mono text-xs text-muted-foreground">
        {t("volume", { chars: format.number(attached.extract.chars) })}
      </span>
      {/* The row this stands on is itself a control fill, so the button takes
          the other surface: `outlineOnCard` here would be the row's own colour
          to the byte and the button would vanish into it. */}
      <Button
        type="button"
        variant="outline"
        size="xs"
        data-testid={`attachment-open-${slot}`}
        onClick={() => openOverlay({ docId: attached.id })}
      >
        <PencilIcon aria-hidden="true" />
        {t("open")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-testid={`attachment-clear-${slot}`}
        aria-label={
          own
            ? t("removeLabel", { name: attached.name })
            : t("unlinkLabel", { name: attached.name })
        }
        onClick={() =>
          own ? setConfirming(true) : chooseCompanion(item.id, slot, undefined)
        }
      >
        <Trash2Icon aria-hidden="true" />
      </Button>

      {venueState === undefined || venueState === "ready" ? null : (
        <p role="status" className="w-full text-xs text-critical">
          {t(`venue.state.${venueState}`)} {t("venue.wayOut")}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("removeTitle")}
        body={t("removeBody", { name: attached.name })}
        confirmLabel={t("removeYes")}
        cancelLabel={t("keep")}
        onConfirm={() => detach(item.id, slot)}
      />
    </div>
  );
}

/** The empty slot: a document of the buffer, or a text brought in here. */
function Empty({ item, slot }: { readonly item: BufferItem; readonly slot: FilledSlot }) {
  const t = useTranslations("buffer.attach");
  const intake = useIntake();
  const setVenue = useBufferStore((state) => state.setVenue);
  const chooseCompanion = useBufferStore((state) => state.chooseCompanion);
  // The list is derived outside the selector. A selector that builds an array
  // hands the store a new value on every read, and the store re-renders on
  // every change of value: the component then re-renders itself for as long as
  // it is on screen.
  const items = useBufferStore((state) => state.items);
  const choices = companionChoices(items, item);
  const [notice, setNotice] = React.useState<RefusalNotice | null>(null);
  const [pasting, setPasting] = React.useState(false);
  const [linking, setLinking] = React.useState(false);

  // Left to the compiler rather than memoised by hand: written out, the
  // dependency list has to name the whole of `item`, and the compiler then
  // declines to optimise the component at all.
  const take = async (file: File) => {
    setNotice(null);
    const result = await intake.attachFile(item.id, slot, file);
    if (!result.ok) {
      setNotice(result.notice);
      return;
    }
    if (slot === "venue") {
      setVenue(item.id, {
        kind: "file",
        source: result.item.name,
        docId: result.item.id,
        state: "ready",
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted: File[]) => {
      const file = accepted[0];
      if (file !== undefined) void take(file);
    },
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        data-testid={`attach-zone-${slot}`}
        data-drag-active={isDragActive}
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-dashed border-input px-2.5 py-2 transition-colors",
          isDragActive && "border-primary bg-primary-soft",
        )}
      >
        <input
          {...getInputProps()}
          accept=".txt,.md,.bib,.tex,.gls"
          data-testid={`attach-input-${slot}`}
        />
        {/* The buffer first, because the pair is most often two files the
            person brought together: naming one is a choice among documents they
            can already see, and it costs nothing to offer. */}
        {choices.length === 0 ? (
          <span className="flex-1 text-xs text-muted-foreground">{t("dropHere")}</span>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
            <label htmlFor={`companion-${slot}-${item.id}`}>{t("fromBuffer")}</label>
            <Select
              value=""
              onValueChange={(value) => chooseCompanion(item.id, slot, value)}
            >
              <SelectTrigger
                id={`companion-${slot}-${item.id}`}
                size="sm"
                surface="card"
                className="max-w-56 font-mono"
                data-testid={`companion-select-${slot}`}
              >
                <SelectValue placeholder={t("notChosen")} />
              </SelectTrigger>
              <SelectContent>
                {choices.map((choice) => (
                  <SelectItem key={choice.id} value={choice.id} className="font-mono">
                    {choice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button type="button" variant="outlineOnCard" size="xs" onClick={open}>
          <UploadIcon aria-hidden="true" />
          {t("chooseFile")}
        </Button>
        <Button
          type="button"
          variant="outlineOnCard"
          size="xs"
          onClick={() => setPasting(true)}
        >
          <TypeIcon aria-hidden="true" />
          {t("pasteText")}
        </Button>
        {slot === "venue" ? (
          <Button
            type="button"
            variant="outlineOnCard"
            size="xs"
            onClick={() => setLinking(true)}
          >
            <LinkIcon aria-hidden="true" />
            {t("venue.fromLink")}
          </Button>
        ) : null}
      </div>

      {notice === null ? null : (
        <p role="alert" className="mt-1.5 text-xs text-critical">
          <RefusalLine notice={notice} />
        </p>
      )}

      <PasteInEditor
        open={pasting}
        title={t(`${slot}.pasteTitle`)}
        confirmLabel={t("attach")}
        onClose={() => setPasting(false)}
        onDone={async (text) => {
          setNotice(null);
          const name = t(`${slot}.pastedName`);
          const result = await intake.attachText(item.id, slot, text, name);
          if (!result.ok) {
            setNotice(result.notice);
            return;
          }
          if (slot === "venue") {
            setVenue(item.id, {
              kind: "text",
              source: name,
              docId: result.item.id,
              state: "ready",
            });
          }
        }}
      />

      {slot === "venue" ? (
        <VenueLink item={item} open={linking} onClose={() => setLinking(false)} />
      ) : null}
    </div>
  );
}

/**
 * The venue's fourth way. The address is fetched on an explicit press, so the
 * request is an action of the person's and not a side effect of typing; it is
 * the one request that happens before "Run the check", and it carries the
 * address alone.
 */
function VenueLink({
  item,
  open,
  onClose,
}: {
  readonly item: BufferItem;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations("buffer.attach");
  const intake = useIntake();
  const setVenue = useBufferStore((state) => state.setVenue);
  const [url, setUrl] = React.useState("");
  const [fetching, setFetching] = React.useState(false);

  const load = async () => {
    setFetching(true);
    setVenue(item.id, { kind: "url", source: url, state: "loading" });
    try {
      const requirements = await fetchVenueRequirements(url);
      if (requirements.state !== "ready" || requirements.text === undefined) {
        setVenue(item.id, { kind: "url", source: url, state: "not-requirements" });
        return;
      }
      // What came back is read into the browser as a text of its own, so the
      // requirements can be opened, corrected and removed like every other
      // text on this card.
      const result = await intake.attachText(
        item.id,
        "venue",
        requirements.text,
        url,
        "txt",
      );
      if (!result.ok) {
        setVenue(item.id, { kind: "url", source: url, state: "failed" });
        return;
      }
      setVenue(item.id, {
        kind: "url",
        source: url,
        docId: result.item.id,
        state: "ready",
      });
      onClose();
    } catch (error) {
      // Three refusals and one answer that is not a refusal at all: the page
      // opened and had no requirements on it. That last one is said in its own
      // words, because the person gave the journal's front page instead of its
      // page for authors, and that is what has to be pointed out.
      const code = error instanceof ApiError ? error.failure.code : "VENUE_FETCH_FAILED";
      setVenue(item.id, {
        kind: "url",
        source: url,
        state: code === "VENUE_FETCH_TIMEOUT" ? "timeout" : "failed",
        errorCode: code,
      });
    } finally {
      setFetching(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{t("venue.linkTitle")}</DialogTitle>
        </DialogHeader>

        <label className="block text-sm" htmlFor={`venue-url-${item.id}`}>
          {t("venue.urlLabel")}
          <Input
            id={`venue-url-${item.id}`}
            aria-label={t("venue.urlLabel")}
            type="url"
            inputMode="url"
            className="mt-1 font-mono"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>

        {item.venue?.state === "failed" ||
        item.venue?.state === "timeout" ||
        item.venue?.state === "not-requirements" ? (
          <p role="status" className="text-sm text-critical">
            {t(`venue.state.${item.venue.state}`)} {t("venue.wayOut")}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
          {url === "" ? (
            <BlockedButton action="venue.url" reason={t("venue.addressFirst")} size="sm">
              <GlobeIcon aria-hidden="true" />
              {t("venue.load")}
            </BlockedButton>
          ) : (
            <Button type="button" size="sm" onClick={() => void load()}>
              <GlobeIcon aria-hidden="true" />
              {fetching ? t("venue.loading") : t("venue.load")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
