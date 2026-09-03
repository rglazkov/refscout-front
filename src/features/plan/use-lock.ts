"use client";

import * as React from "react";

import { type ModuleId } from "@/lib/domain";
import { track } from "@/lib/telemetry";
import { useEntitlementsStore, useUiStore } from "@/stores";

import { lockOf } from "./compute";

/**
 * Pressing a lock, wherever it is drawn - on the card and in the plan below it.
 *
 * One handler for both, so a press produces exactly one event and both places
 * report the same reason. What people try to buy is the one thing the funnel
 * cannot be reconstructed from anything else: a lock pressed and abandoned
 * leaves no request behind it.
 */
export function useLockPress(): (module: ModuleId) => void {
  const openPaywall = useUiStore((state) => state.openPaywall);

  return React.useCallback(
    (module: ModuleId) => {
      const { reason } = lockOf(useEntitlementsStore.getState().entitlements, module);
      track("blocked_action", {
        code: `ACTION_BLOCKED:check.${module}.${reason ?? "unknown"}`,
      });
      openPaywall(module);
    },
    [openPaywall],
  );
}
