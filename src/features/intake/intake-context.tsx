"use client";

import * as React from "react";

import { type IntakeApi } from "./use-intake";

/**
 * One intake for the screen, reachable from the card that needs it.
 *
 * A document's ways out live on its own card - a password, another attempt,
 * another file - and the card is three components below the screen that owns
 * intake. Passing five callbacks through the list and the card would make both
 * of them about intake, and the next thing added to intake would touch them
 * again.
 */
const IntakeContext = React.createContext<IntakeApi | null>(null);

export function IntakeProvider({
  value,
  children,
}: {
  readonly value: IntakeApi;
  readonly children: React.ReactNode;
}) {
  return <IntakeContext.Provider value={value}>{children}</IntakeContext.Provider>;
}

/** Null outside the working screen, which is where the buffer cannot be. */
export function useIntakeApi(): IntakeApi | null {
  return React.useContext(IntakeContext);
}
