"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { BuildingIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiError, fetchVenueRequirements, listVenues } from "@/lib/api";
import { type BufferItem, type VenueRef } from "@/lib/domain";
import { useIntake } from "@/features/intake/use-intake";
import { useBufferStore } from "@/stores";

/**
 * The venue's requirements, chosen on the card of the manuscript they belong to
 * (M1.4.5). Requirements attached to the job rather than to the document fall
 * apart on the first buffer holding two manuscripts for two journals.
 *
 * Four ways in, and each of them ends in the same `venue` field: a preset from
 * the list, an address, pasted text, or a file.
 */
type Way = "preset" | "url" | "text" | "file";

export function VenueDialog({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.venue");
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={t("open", { name: item.name })}
          data-testid="venue-button"
        >
          <BuildingIcon aria-hidden="true" />
          {item.venue?.source ?? t("notSet")}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("lead", { name: item.name })}</DialogDescription>
        </DialogHeader>
        <VenueForm item={item} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function VenueForm({
  item,
  onDone,
}: {
  readonly item: BufferItem;
  readonly onDone: () => void;
}) {
  const t = useTranslations("buffer.venue");
  const setVenue = useBufferStore((state) => state.setVenue);
  const intake = useIntake();
  const [way, setWay] = React.useState<Way>("preset");
  const [url, setUrl] = React.useState("");
  const [text, setText] = React.useState("");
  const [preset, setPreset] = React.useState("");

  /**
   * The list changes rarely, so it is asked for once and kept for the session
   * rather than fetched every time the dialogue opens (M1.4.6). The client
   * sends the chosen id and the server expands the requirements behind it.
   */
  const venues = useQuery({
    queryKey: ["venues"],
    queryFn: () => listVenues(),
    staleTime: Infinity,
  });

  const apply = (venue: VenueRef) => {
    setVenue(item.id, venue);
    onDone();
  };

  /**
   * The address is fetched on an explicit press, so that the request is an
   * action of the person's and not a side effect of typing (§4). It is the one
   * request that happens before "Run the check", and it carries the address
   * alone.
   */
  const [fetching, setFetching] = React.useState(false);
  const loadUrl = async () => {
    setFetching(true);
    setVenue(item.id, { kind: "url", source: url, state: "loading" });
    try {
      const requirements = await fetchVenueRequirements(url);
      setVenue(item.id, {
        kind: "url",
        source: url,
        state: requirements.state === "ready" ? "ready" : "not-requirements",
        ...(requirements.text === undefined ? {} : { text: requirements.text }),
      });
      if (requirements.state === "ready") onDone();
    } catch (error) {
      // Three refusals and one answer that is not a refusal at all: the page
      // opened and had no requirements on it. That last one is said in its own
      // words, because the person gave the journal's front page instead of the
      // page for authors, and that is what has to be pointed out (M1.4.8).
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

  /**
   * A requirements file is read in the browser exactly like every other
   * document and never leaves it. It enters the buffer with no checks ticked,
   * so the job can name it by id, and the plan says why it does not take part.
   */
  const loadFile = async (file: File) => {
    const added = await intake.addRequirementsFile(file);
    if (added === null) return;
    apply({
      kind: "file",
      source: added.name,
      docId: added.docId,
      text: added.text,
      state: "ready",
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("ways")}>
        {(["preset", "url", "text", "file"] as const).map((option) => (
          <Button
            key={option}
            type="button"
            role="tab"
            aria-selected={way === option}
            size="sm"
            variant={way === option ? "default" : "outline"}
            onClick={() => setWay(option)}
          >
            {t(`way.${option}`)}
          </Button>
        ))}
      </div>

      {way === "preset" ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="venue-preset">
            {t("presetLabel")}
          </label>
          <select
            id="venue-preset"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={preset}
            onChange={(event) => setPreset(event.target.value)}
          >
            <option value="">{t("presetEmpty")}</option>
            {(venues.data ?? []).map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.publisher === undefined
                  ? venue.name
                  : `${venue.name} — ${venue.publisher}`}
              </option>
            ))}
          </select>
          {preset === "" ? (
            <BlockedButton action="venue.preset" reason={t("pickFirst")} size="sm">
              {t("use")}
            </BlockedButton>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const chosen = (venues.data ?? []).find((venue) => venue.id === preset);
                apply({ kind: "preset", source: chosen?.name ?? preset, state: "ready" });
              }}
            >
              {t("use")}
            </Button>
          )}
        </div>
      ) : null}

      {way === "url" ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="venue-url">
            {t("urlLabel")}
          </label>
          <input
            id="venue-url"
            aria-label={t("urlLabel")}
            type="url"
            inputMode="url"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          {url === "" ? (
            <BlockedButton action="venue.url" reason={t("addressFirst")} size="sm">
              {t("load")}
            </BlockedButton>
          ) : (
            <Button type="button" size="sm" onClick={() => void loadUrl()}>
              {fetching ? t("loading") : t("load")}
            </Button>
          )}
          {/* Every one of the four states has a way out, and it is the same
              one: type the requirements in by hand (M1.4.8). */}
          {item.venue?.state === "failed" ||
          item.venue?.state === "timeout" ||
          item.venue?.state === "not-requirements" ? (
            <p role="status" className="text-sm text-critical">
              {t(`state.${item.venue.state}`)} {t("wayOut")}
            </p>
          ) : null}
        </div>
      ) : null}

      {way === "text" ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="venue-text">
            {t("textLabel")}
          </label>
          <textarea
            id="venue-text"
            aria-label={t("textLabel")}
            rows={6}
            className="w-full rounded-md border bg-background p-3 text-sm"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {text.trim() === "" ? (
            <BlockedButton action="venue.text" reason={t("textFirst")} size="sm">
              {t("use")}
            </BlockedButton>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => apply({ kind: "text", source: text, text, state: "ready" })}
            >
              {t("use")}
            </Button>
          )}
        </div>
      ) : null}

      {way === "file" ? (
        <div className="space-y-2">
          <label className="block text-sm" htmlFor="venue-file">
            {t("fileLabel")}
          </label>
          <input
            id="venue-file"
            aria-label={t("fileLabel")}
            type="file"
            accept=".txt,.md,.tex"
            className="block w-full text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) void loadFile(file);
            }}
          />
        </div>
      ) : null}

      {item.venue === undefined ? null : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setVenue(item.id, undefined);
            onDone();
          }}
        >
          {t("clear")}
        </Button>
      )}
    </div>
  );
}
