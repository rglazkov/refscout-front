"use client";

import * as React from "react";

import { type ModuleId, type Place } from "@/lib/domain";

import {
  placesInDocument,
  placesOfIssue,
  placesVersion,
  subscribeToPlaces,
  type PlacedFinding,
} from "./session";

/**
 * How a screen reads the places without knowing where they are kept.
 *
 * The resolver runs when an answer arrives and when the text settles after
 * being edited, neither of which is a render, so what a component subscribes to
 * is a number that changes with every pass. A card that has not changed
 * compares equal to what it drew before and is left alone, which matters here
 * more than usual: a dissertation's results are thousands of rows, and a pass
 * that redrew all of them would be felt.
 */
function useVersion(): number {
  return React.useSyncExternalStore(subscribeToPlaces, placesVersion, () => 0);
}

export function useIssuePlaces(
  docId: string,
  module: ModuleId,
  issueId: string,
): readonly Place[] {
  const version = useVersion();
  return React.useMemo(
    () => placesOfIssue(docId, module, issueId),
    // The version is what the answer depends on: the same three identifiers
    // give a different list after a pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId, module, issueId, version],
  );
}

/** Every place that falls in one document, in the order they occur in it. */
export function useDocumentPlaces(docId: string): readonly PlacedFinding[] {
  const version = useVersion();
  return React.useMemo(
    () => placesInDocument(docId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId, version],
  );
}
