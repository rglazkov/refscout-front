"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { BiblioRecordCard } from "@/features/records/record-card";
import { Collapse } from "@/components/motion/collapse";
import { ModeHeader } from "@/components/mode-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, messageKeyFor, scoutFeedback, scoutSearch } from "@/lib/api";
import {
  searchLimits,
  type ScoutAnswer,
  type ScoutRecord,
  type ScoutVote,
  type SearchLimit,
} from "@/lib/domain";
import { downloadText, toBibtex } from "@/lib/export";
import { useWording } from "@/lib/i18n";

import {
  arrange,
  noFilters,
  sortOrders,
  yearsIn,
  type Filters,
  type SortOrder,
} from "./filters";

/**
 * Scout: ten bibliographic databases behind one query string.
 *
 * The screen is a search line and the list under it, and it stays that until
 * an answer arrives - the sorting, the filters and the export appear with the
 * results they act on. A panel of controls standing over an empty list is the
 * first thing that makes a search look like work.
 *
 * The query is the only thing that leaves the browser, and it leaves on a
 * press. Nothing here is kept: there is no history of searches, because a query
 * is what a person is working on at this moment, and nothing goes into the
 * buffer, because a source is material for somebody's bibliography rather than
 * a document to be checked.
 */
export function ScoutScreen({ onBack }: { readonly onBack: () => void }) {
  const t = useTranslations("scout");
  const errors = useTranslations();
  const format = useFormatter();
  const locale = useLocale();
  const source = useWording();

  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState<SearchLimit>(searchLimits[0]);
  const [answer, setAnswer] = React.useState<ScoutAnswer | null>(null);
  const [failure, setFailure] = React.useState<{
    readonly code: string;
    readonly requestId: string;
  } | null>(null);
  const [filters, setFilters] = React.useState<Filters>(noFilters);
  const [order, setOrder] = React.useState<SortOrder>("relevance");
  const [showFilters, setShowFilters] = React.useState(false);
  const [picked, setPicked] = React.useState<readonly string[]>([]);
  // Outside React state: the search that is already in flight reads it, and a
  // render is not what makes cancelling work.
  const running = React.useRef<AbortController | null>(null);

  const search = useMutation({
    mutationFn: (asked: string) => {
      running.current?.abort();
      const controller = new AbortController();
      running.current = controller;
      return scoutSearch(asked, limit, locale, { signal: controller.signal });
    },
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: (result) => {
      setAnswer(result);
      setPicked([]);
    },
    onError: (error: unknown) => {
      // A search the person cancelled is not a failure to report to them.
      if (running.current?.signal.aborted === true) return;
      setAnswer(null);
      setFailure(
        error instanceof ApiError
          ? { code: error.failure.code, requestId: error.failure.requestId }
          : { code: "NETWORK", requestId: "" },
      );
    },
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim() === "" || search.isPending) return;
    search.mutate(query.trim());
  };

  const cancel = () => {
    running.current?.abort();
    search.reset();
  };

  const shown = answer === null ? [] : arrange(answer.results, filters, order);
  // Out of the whole answer rather than out of what is on screen: a list of
  // years that shrank as it was used would take away the way back.
  const years = answer === null ? [] : yearsIn(answer.results);
  const chosen = shown.filter((record) => picked.includes(record.resultId));

  return (
    <div className="mt-6 space-y-4" data-testid="scout-screen">
      <ModeHeader title={t("title")} lead={t("lead")} back={t("back")} onBack={onBack} />

      <form
        className="space-y-3 rounded-xl border bg-card p-3.5"
        onSubmit={submit}
        role="search"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              surface="card"
              className="h-[2.625rem] ps-9"
              value={query}
              aria-label={t("queryLabel")}
              placeholder={t("queryPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
              data-testid="scout-query"
            />
          </div>
          {search.isPending ? (
            <Button type="button" size="lg" variant="outlineOnCard" onClick={cancel}>
              {t("cancel")}
            </Button>
          ) : (
            <Button type="submit" size="lg" data-testid="scout-run">
              {t("run")}
            </Button>
          )}
        </div>

        {/* The request's one option. Everything else about a list - its order,
            what is hidden from it - is decided here in the browser. */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("limitLabel")}</span>
          <Select
            value={String(limit)}
            onValueChange={(value) => setLimit(Number(value) as SearchLimit)}
          >
            <SelectTrigger
              surface="card"
              size="sm"
              className="w-24"
              aria-label={t("limitLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {searchLimits.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {format.number(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>

      {search.isPending ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("searching")}
        </p>
      ) : null}

      {failure === null ? null : (
        <p
          role="alert"
          data-testid="scout-failure"
          className="rounded-lg border border-critical-border bg-critical-soft p-3 text-sm text-critical"
        >
          {failure.code === "NETWORK"
            ? t("offline")
            : errors(messageKeyFor(failure.code))}
          {failure.requestId === "" ? "" : ` (${failure.requestId})`}
        </p>
      )}

      {answer === null ? null : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground" data-testid="scout-count">
              <span className="font-mono font-semibold text-foreground">
                {format.number(shown.length)}
              </span>{" "}
              {t("found", { count: shown.length })}
              {shown.length === answer.results.length
                ? ""
                : ` · ${t("hidden", {
                    count: answer.results.length - shown.length,
                  })}`}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={showFilters}
                onClick={() => setShowFilters(!showFilters)}
                data-testid="scout-filters-toggle"
              >
                <SlidersHorizontalIcon aria-hidden="true" />
                {t("filters")}
              </Button>
              <Select
                value={order}
                onValueChange={(value) => setOrder(value as SortOrder)}
              >
                <SelectTrigger size="sm" className="w-40" aria-label={t("sortLabel")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOrders.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t(`sort.${option}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                data-testid="scout-export"
                aria-disabled={chosen.length === 0}
                onClick={() => {
                  if (chosen.length === 0) return;
                  downloadText(toBibtex(chosen), t("exportName"), "", "bib");
                }}
              >
                <DownloadIcon aria-hidden="true" />
                {t("export", { count: chosen.length })}
              </Button>
            </div>
          </div>

          {/* Which databases answered, and which did not. Two silent databases
              are neither an empty result nor a failure, so the list is shown
              and the sentence beside it says the list is short of them. */}
          <p
            className="text-[0.8125rem] text-muted-foreground"
            data-testid="scout-sources"
          >
            {t("answered", {
              sources: answer.searchedSources
                .map((id) => source(`sources.${id}`, undefined, id))
                .join(", "),
            })}
            {answer.degraded.length === 0
              ? ""
              : ` · ${t("degraded", {
                  sources: answer.degraded
                    .map((id) => source(`sources.${id}`, undefined, id))
                    .join(", "),
                })}`}
          </p>

          <Collapse open={showFilters}>
            <div
              className="grid gap-3 rounded-xl border bg-card p-3.5 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="scout-filters"
            >
              <YearField
                label={t("yearFrom")}
                hint={years[years.length - 1]}
                value={filters.yearFrom}
                onChange={(value) => setFilters({ ...filters, yearFrom: value })}
              />
              <YearField
                label={t("yearTo")}
                hint={years[0]}
                value={filters.yearTo}
                onChange={(value) => setFilters({ ...filters, yearTo: value })}
              />
              <CountField
                label={t("minCitations")}
                value={filters.minCitations}
                onChange={(value) => setFilters({ ...filters, minCitations: value })}
              />
              <FilterField
                label={t("author")}
                placeholder={t("authorPlaceholder")}
                value={filters.author}
                onChange={(value) => setFilters({ ...filters, author: value })}
              />
              <FilterField
                label={t("venue")}
                placeholder={t("venuePlaceholder")}
                value={filters.venue}
                onChange={(value) => setFilters({ ...filters, venue: value })}
              />
              <div className="flex flex-col justify-end gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.openAccessOnly}
                    onCheckedChange={(checked) =>
                      setFilters({ ...filters, openAccessOnly: checked === true })
                    }
                  />
                  {t("openAccessOnly")}
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.withDoiOnly}
                    data-testid="scout-doi-only"
                    onCheckedChange={(checked) =>
                      setFilters({ ...filters, withDoiOnly: checked === true })
                    }
                  />
                  {t("withDoiOnly")}
                </label>
              </div>
            </div>
          </Collapse>

          {shown.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="scout-empty">
              {answer.results.length === 0 ? t("nothingFound") : t("nothingLeft")}
            </p>
          ) : (
            <div className="space-y-2.5">
              {shown.map((record, index) => (
                <Result
                  key={record.resultId}
                  record={record}
                  ordinal={index + 1}
                  picked={picked.includes(record.resultId)}
                  onPick={() =>
                    setPicked((current) =>
                      current.includes(record.resultId)
                        ? current.filter((id) => id !== record.resultId)
                        : [...current, record.resultId],
                    )
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterField({
  label,
  placeholder,
  value,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <Input
        surface="card"
        className="mt-1"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

/**
 * A year: four digits, and nothing else the field will take. The hint is the
 * end of the range the answer actually covers, so the two fields say between
 * which years there is anything to narrow before a key is pressed.
 */
function YearField({
  label,
  hint,
  value,
  onChange,
}: {
  readonly label: string;
  readonly hint: number | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      {label}
      <Input
        className="mt-1 font-mono"
        surface="card"
        inputMode="numeric"
        maxLength={4}
        value={value}
        placeholder={hint === undefined ? "" : String(hint)}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
      />
    </label>
  );
}

/** How far a step of the two buttons moves the number. */
const CITATION_STEP = 1;

/**
 * A count, and only a count. Digits are the only thing the field takes, and the
 * two buttons beside it move by one: the numbers that get typed here are five
 * and twenty as often as they are a hundred, and a step that steps over them is
 * a step in the way.
 */
function CountField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const t = useTranslations("scout");
  const id = React.useId();
  const current = value === "" ? 0 : Number(value);

  const step = (by: number) => {
    const next = Math.max(0, current + by);
    onChange(next === 0 ? "" : String(next));
  };

  return (
    <div className="text-sm">
      <label htmlFor={id} className="block">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <Button
          type="button"
          variant="outlineOnCard"
          size="icon-sm"
          aria-label={t("fewer")}
          onClick={() => step(-CITATION_STEP)}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <Input
          id={id}
          surface="card"
          className="text-center font-mono"
          inputMode="numeric"
          value={value}
          placeholder={t("citationsPlaceholder")}
          data-testid="scout-min-citations"
          // Digits, and nothing that looks like a number to a parser and like a
          // mistake to a person: no minus, no exponent, no separator.
          onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))}
        />
        <Button
          type="button"
          variant="outlineOnCard"
          size="icon-sm"
          aria-label={t("more")}
          onClick={() => step(CITATION_STEP)}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * One result, and what a person does with it here: keep it for the export, copy
 * it, or tell us the search was wrong.
 *
 * The thumb is the one element on this screen that sends anything, and what it
 * sends is the identifier of the record and the direction of the vote. The
 * query is not in it, and it is not in anything else we send either.
 */
function Result({
  record,
  ordinal,
  picked,
  onPick,
}: {
  readonly record: ScoutRecord;
  readonly ordinal: number;
  readonly picked: boolean;
  readonly onPick: () => void;
}) {
  const t = useTranslations("scout");
  const [voted, setVoted] = React.useState<ScoutVote | null>(null);

  const vote = (direction: ScoutVote) => {
    setVoted(direction);
    // A vote that did not arrive is not something to interrupt a search with:
    // it is our question, not the person's work.
    void scoutFeedback(record.resultId, direction).catch(() => undefined);
  };

  return (
    <BiblioRecordCard
      record={record}
      ordinal={ordinal}
      highlighted={picked}
      testId="scout-result"
      {...(record.relevance === undefined ? {} : { relevance: record.relevance })}
      actions={
        <>
          <Button
            type="button"
            size="xs"
            variant={picked ? "default" : "outline"}
            aria-pressed={picked}
            data-testid="scout-pick"
            onClick={onPick}
          >
            {picked ? t("picked") : t("pick")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(toBibtex([record]))}
          >
            <CopyIcon aria-hidden="true" />
            {t("copyBibtex")}
          </Button>
          <span className="flex-1" />
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-pressed={voted === "up"}
            aria-label={t("goodMatch")}
            title={t("goodMatch")}
            data-testid="scout-vote-up"
            onClick={() => vote("up")}
          >
            <ThumbsUpIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-pressed={voted === "down"}
            aria-label={t("badMatch")}
            title={t("badMatch")}
            onClick={() => vote("down")}
          >
            <ThumbsDownIcon aria-hidden="true" />
          </Button>
        </>
      }
    />
  );
}
