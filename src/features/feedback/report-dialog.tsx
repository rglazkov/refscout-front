"use client";

import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/field";
import { RELEASE, peekEvents, sendReport, type ReportParts } from "@/lib/telemetry";
import { useReportStore } from "@/stores";

/**
 * The form a person writes a report in, and the list of everything that will
 * leave with it.
 *
 * Showing the contents is not a decoration. This product works with unpublished
 * manuscripts, and somebody who is told "we have sent something about your
 * session" and not shown what is right to assume the worst. So every field is
 * listed with the value it actually holds, every one of them can be unticked,
 * and what is unticked is never put into the body at all rather than stripped
 * out at the far end.
 *
 * A fragment of the text is the one thing never gathered on their behalf. It is
 * attached only when they selected it themselves and then ticked a box standing
 * beside the exact characters that would go.
 */
type Filled = {
  readonly message: string;
  readonly parts: ReportParts;
  /** What was selected on the page when the form opened; empty when nothing was. */
  readonly excerpt: string;
  readonly attachExcerpt: boolean;
  readonly sending: boolean;
  /** The identifier the receiver gave back, once there is one. */
  readonly sent: string | null;
  readonly failed: boolean;
  /**
   * What was on screen at the moment the form opened, read once. Read on every
   * render it would change under the person while they are deciding whether to
   * send it - and it is exactly what they are being asked to agree to.
   */
  readonly route: string;
  readonly locale: string;
  readonly theme: string;
  readonly viewport: string;
  readonly events: readonly { readonly kind: string; readonly count: number }[];
};

function opened(): Filled {
  const selection = window.getSelection();
  return {
    message: "",
    parts: {
      release: true,
      route: true,
      localeAndTheme: true,
      viewport: true,
      events: true,
      requestId: true,
    },
    excerpt: selection?.toString().trim() ?? "",
    attachExcerpt: false,
    sending: false,
    sent: null,
    failed: false,
    route: window.location.pathname,
    locale: document.documentElement.lang,
    theme: document.documentElement.getAttribute("data-theme") ?? "",
    viewport: `${String(window.innerWidth)}×${String(window.innerHeight)}`,
    events: peekEvents().map((event) => ({ kind: event.kind, count: event.count })),
  };
}

type Row = {
  readonly key: keyof ReportParts;
  readonly label: string;
  readonly value: string;
};

export function ReportDialog() {
  const t = useTranslations("feedback");
  const open = useReportStore((state) => state.open);
  const requestId = useReportStore((state) => state.requestId);
  const close = useReportStore((state) => state.closeReport);

  const [filled, setFilled] = React.useState<Filled | null>(null);
  const [wasOpen, setWasOpen] = React.useState(false);

  /*
   * The form is filled out when it opens and not before. It is done while
   * rendering rather than in an effect: an effect runs after the panel is on
   * screen, so the first frame would show the person an empty list of what is
   * about to be sent about them.
   */
  if (open && !wasOpen) {
    setWasOpen(true);
    setFilled(opened());
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  function change(over: Partial<Filled>): void {
    setFilled((held) => (held === null ? held : { ...held, ...over }));
  }

  const rows: readonly Row[] =
    filled === null
      ? []
      : [
          { key: "release", label: t("row.release"), value: RELEASE },
          { key: "route", label: t("row.route"), value: filled.route },
          {
            key: "localeAndTheme",
            label: t("row.localeAndTheme"),
            value: `${filled.locale} · ${filled.theme === "" ? t("themeSystem") : filled.theme}`,
          },
          { key: "viewport", label: t("row.viewport"), value: filled.viewport },
          {
            key: "events",
            label: t("row.events"),
            value:
              filled.events.length === 0
                ? t("noEvents")
                : filled.events
                    .map((event) => `${event.kind} ×${String(event.count)}`)
                    .join(", "),
          },
          ...(requestId === null || requestId === ""
            ? []
            : [
                {
                  key: "requestId" as const,
                  label: t("row.requestId"),
                  value: requestId,
                },
              ]),
        ];

  async function send(): Promise<void> {
    if (filled === null) return;
    change({ sending: true, failed: false });
    const reportId = await sendReport({
      message: filled.message,
      ...(filled.attachExcerpt && filled.excerpt !== ""
        ? { excerpt: filled.excerpt }
        : {}),
      ...(requestId === null ? {} : { requestId }),
      parts: filled.parts,
    });
    change({ sending: false, failed: reportId === null, sent: reportId });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-xl" data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>

        {filled === null ? null : filled.sent === null ? (
          <>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t("messageLabel")}
              <Textarea
                value={filled.message}
                rows={3}
                placeholder={t("messagePlaceholder")}
                data-testid="report-message"
                onChange={(event) => change({ message: event.target.value })}
              />
            </label>

            <div className="rounded-lg border">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2 text-sm font-medium">
                <span>{t("willSend")}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {t("untickAny")}
                </span>
              </div>
              <ul className="flex flex-col">
                {rows.map((row) => (
                  <li key={row.key} className="border-b last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={filled.parts[row.key]}
                        data-testid={`report-part-${row.key}`}
                        onCheckedChange={(checked) =>
                          change({
                            parts: { ...filled.parts, [row.key]: checked === true },
                          })
                        }
                      />
                      <span className="w-28 shrink-0 text-muted-foreground">
                        {row.label}
                      </span>
                      {/* A value here is a quantity or an identifier, so it is
                          set in the mono face and can be read character by
                          character. */}
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">
                        {row.value}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {/* The fragment, offered only when there is one. It is off by
                default and shown in full: what would be attached is what the
                person selected, and they are looking at those characters while
                they decide. */}
            {filled.excerpt === "" ? null : (
              <div className="rounded-lg border">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    checked={filled.attachExcerpt}
                    data-testid="report-excerpt"
                    onCheckedChange={(checked) =>
                      change({ attachExcerpt: checked === true })
                    }
                  />
                  <span>{t("attachExcerpt")}</span>
                </label>
                {filled.attachExcerpt ? (
                  <p className="max-h-24 overflow-auto border-t px-3 py-2 font-mono text-xs whitespace-pre-wrap">
                    {filled.excerpt}
                  </p>
                ) : null}
              </div>
            )}

            <p className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <ShieldCheckIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <span>{t("promise")}</span>
            </p>

            {filled.failed ? (
              <p
                role="alert"
                className="text-sm text-critical"
                data-testid="report-failed"
              >
                {t("failed")}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" size="sm" variant="outline" onClick={close}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="report-send"
                aria-busy={filled.sending}
                onClick={() => void send()}
              >
                {filled.sending ? t("sending") : t("send")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* The identifier of the case, and it stays on screen: it is what the
             person quotes to support, and support finds the case by it. */
          <>
            <p className="text-sm" data-testid="report-sent">
              {t("sent")}
            </p>
            <p className="font-mono text-base" data-testid="report-id">
              {filled.sent}
            </p>
            <DialogFooter>
              <Button type="button" size="sm" onClick={close}>
                {t("close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
