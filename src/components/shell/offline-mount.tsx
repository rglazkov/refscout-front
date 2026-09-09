"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
// The switch itself rather than a second copy of the comparison behind it: the
// module is a constant and a starter, and the starter's own imports are inside
// the function, so a page that never runs the mock carries none of it.
import { apiSource } from "@/lib/api/source";
import {
  applyUpdate,
  registerShell,
  useUpdateWaiting,
  watchConnection,
} from "@/lib/offline";

/**
 * Where the offline shell is attached to the page, and where a build that is
 * waiting says so.
 *
 * Both belong on every page rather than on the working screen alone: the shell
 * has to be in the cache before the network goes, and by then somebody may have
 * been reading the privacy policy. Registration itself waits for the load
 * event, so nothing here is on the critical path of a first visit.
 */
export function OfflineMount() {
  const t = useTranslations("workspace.offline");
  const waiting = useUpdateWaiting();

  React.useEffect(() => {
    /*
     * A scope belongs to one service worker, and in a build wired to the mock
     * the scope is already taken: the contract's own bodies are served from a
     * worker in this tab, and registering a second script at the same scope
     * replaces the first. So the two are mutually exclusive by construction -
     * the mock is a development artefact and the shell is the product - and the
     * comparison is against a value the bundler inlines, so a build for the
     * stand contains no branch at all.
     */
    if (apiSource === "stand") registerShell(process.env.NEXT_PUBLIC_BASE_PATH ?? "");
    watchConnection();
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      data-testid="update-waiting"
      className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-2 text-sm"
    >
      <span>{t("updateReady")}</span>
      <Button type="button" size="sm" variant="outline" onClick={applyUpdate}>
        {t("updateApply")}
      </Button>
    </div>
  );
}
