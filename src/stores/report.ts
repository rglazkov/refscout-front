"use client";

import { create } from "zustand";

/**
 * Whether the report form is open, and what it was opened about.
 *
 * It is a store rather than a piece of state inside the footer because the form
 * is reachable from three places that do not contain one another: the footer of
 * every page, every state of an error the product can end up in, and a key
 * combination that works wherever the person happens to be. A control that
 * lifts its own state would give each of those its own copy of the form, and
 * two of them could be open at once.
 *
 * The identifier of the request comes with the request to open. A failed check
 * knows which one it was, and that identifier is the whole reason support can
 * find the case in the logs afterwards - so it travels from the message that
 * offered the report rather than being asked of the person.
 */
export type ReportState = {
  readonly open: boolean;
  readonly requestId: string | null;
  readonly openReport: (requestId?: string) => void;
  readonly closeReport: () => void;
};

export const useReportStore = create<ReportState>()((set) => ({
  open: false,
  requestId: null,
  openReport: (requestId) => set({ open: true, requestId: requestId ?? null }),
  closeReport: () => set({ open: false, requestId: null }),
}));
