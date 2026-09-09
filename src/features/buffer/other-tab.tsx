"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { brand } from "../../../brand.config";
import { claimHere, useTabRole, useWriteRefused } from "@/lib/tabs";

/**
 * The tab that is not the one working with the buffer.
 *
 * A curtain is honester than a block that says nothing. Somebody who opened a
 * second tab by accident is told why this one is not working and is given the
 * one press that brings the work here - and their buffer is not in danger
 * either way, because the tab that has it is still holding it.
 *
 * The second sentence is for the case where the role went while this tab was
 * being typed into. A refused write is a state of the screen and not a line in
 * a console: it names the edit as unsaved, because the alternative is a tab
 * that goes on looking as if it were working.
 */
export function OtherTabCurtain() {
  const t = useTranslations("workspace.tabs");
  const role = useTabRole();
  const refused = useWriteRefused();

  if (role === "writer") return null;

  return (
    <div
      role="status"
      data-testid="other-tab"
      data-role={role}
      className="mt-6 rounded-xl border border-warning-border bg-warning-soft p-4"
    >
      <p className="font-medium">{t("title", { brandName: brand.name })}</p>
      <p className="mt-1 text-sm">{refused ? t("refusedBody") : t("body")}</p>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        data-testid="work-here"
        onClick={claimHere}
      >
        {t("here")}
      </Button>
    </div>
  );
}
