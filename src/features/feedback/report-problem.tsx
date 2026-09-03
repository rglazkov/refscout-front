"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { FlagIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  breadcrumb,
  collectionRefused,
  install,
  setCollectionRefused,
  subscribeToCollection,
} from "@/lib/telemetry";
import { useReportStore } from "@/stores";

/**
 * "Report a problem", and the switch that turns automatic collection off.
 *
 * The form itself is fetched when it is opened. It is a screen nobody sees on
 * an ordinary visit, and every page of the site carries this footer, so loading
 * it up front would put a form for describing a failure into the weight of the
 * pricing page.
 */
const ReportDialog = dynamic(
  () => import("./report-dialog").then((module) => module.ReportDialog),
  { ssr: false },
);

/**
 * The key combination that opens the form from anywhere.
 *
 * Automatic collection catches what the code can recognise, and a person
 * looking at a screen that is wrong in a way no exception describes has to be
 * able to say so without hunting for a control. Alt and Shift together are
 * unclaimed by browsers and produce no character, so the combination cannot be
 * pressed by accident while somebody is typing into the editor.
 */
const HOTKEY_CODE = "KeyR";

/** Opens the form. Placed in every state of an error the product can show. */
export function ReportProblemButton({
  requestId,
  variant = "ghost",
  className,
}: {
  /** The request the failure was about, so support can find it in the logs. */
  readonly requestId?: string;
  readonly variant?: "ghost" | "outline";
  readonly className?: string;
}) {
  const t = useTranslations("feedback");
  const openReport = useReportStore((state) => state.openReport);

  return (
    <Button
      type="button"
      size="sm"
      variant={variant}
      className={className}
      data-testid="report-problem"
      onClick={() => {
        breadcrumb("open-report", "started");
        openReport(requestId);
      }}
    >
      <FlagIcon aria-hidden="true" />
      {t("report")}
    </Button>
  );
}

/**
 * What stands in the footer of every page: the way to report a problem, and the
 * way to stop the automatic reports.
 *
 * Both belong together and both belong here. A product that collects anything
 * at all owes the person the sentence "we collect, and this is where you turn
 * it off" in a place they can find without reading the privacy policy - and
 * putting such a switch in later costs more than putting it in now.
 *
 * This is also where the collectors are attached to the page. It is the one
 * component the shell renders on every address, which is exactly the reach an
 * uncaught exception has.
 */
export function ReportProblem() {
  const t = useTranslations("feedback");
  const openReport = useReportStore((state) => state.openReport);
  const open = useReportStore((state) => state.open);

  /*
   * Once the form has been opened it stays mounted, so that closing it plays
   * its exit rather than vanishing: a panel that disappears between one frame
   * and the next reads as a fault rather than as a dismissal.
   */
  const [everOpened, setEverOpened] = React.useState(false);
  if (open && !everOpened) setEverOpened(true);

  React.useEffect(() => {
    install();
  }, []);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (!event.altKey || !event.shiftKey || event.code !== HOTKEY_CODE) return;
      event.preventDefault();
      breadcrumb("open-report", "started");
      openReport();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openReport]);

  /*
   * The box shows the choice made in this browser, and it is read from where
   * that choice is kept rather than copied into a piece of state here: the same
   * switch stands in the footer of every page, and two copies of it would
   * disagree the moment somebody used one of them.
   *
   * It is not the whole answer to "is anything being collected". The receiver
   * can stop collection in its reply to a batch, and that is our decision
   * rather than the person's, so it does not move their switch - unticking this
   * one is a choice they made and it stays where they left it.
   */
  const refused = React.useSyncExternalStore(
    subscribeToCollection,
    collectionRefused,
    () => false,
  );

  return (
    <>
      <label className="flex cursor-pointer items-center gap-2">
        <Checkbox
          checked={!refused}
          data-testid="collection-switch"
          onCheckedChange={(checked) => setCollectionRefused(checked !== true)}
        />
        {t("collect")}
      </label>

      <ReportProblemButton />

      {/* Fetched with the first press, so a page nobody had trouble on never
          carries a form for describing trouble. */}
      {everOpened ? <ReportDialog /> : null}
    </>
  );
}
