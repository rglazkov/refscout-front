"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { install } from "@/lib/telemetry";

/**
 * Where the observability of the product is attached to the page, and where the
 * control that lets a person report something stands.
 *
 * A separate client module is needed for the same reason the working screen has
 * one: `ssr: false` cannot be asked for inside a server component, and the
 * footer of every page is a server component. Loading the feature is deferred
 * with it, so the words and the form arrive after the page rather than inside
 * it.
 */
const ReportProblem = dynamic(
  () =>
    import("@/features/feedback/report-problem").then((module) => module.ReportProblem),
  { ssr: false },
);

export function FeedbackMount() {
  React.useEffect(() => {
    /*
     * The collectors, and the one thing the sender cannot work out for itself.
     *
     * Which server answers is a switch, and telemetry obeys it - but it may not
     * import the API layer at all: it is the one module that sends without
     * anybody pressing a button, and the rule that it can reach neither the
     * texts nor the module holding them is held by a test rather than by care.
     * So the two halves are joined here, in the shell, which knows both. The
     * import is inside the callback and the callback is only called when a
     * batch is actually due, so a page nothing went wrong on loads none of it.
     */
    install(async () => {
      const { startApiSource } = await import("@/lib/api");
      await startApiSource();
    });
  }, []);

  return <ReportProblem />;
}
