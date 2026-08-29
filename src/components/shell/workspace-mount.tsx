"use client";

import dynamic from "next/dynamic";

/**
 * The mount point of the workspace screen. A separate client module is needed
 * because ssr: false is not allowed in a server component, and the dynamic
 * loading rule (M0.9.4) requires exactly that: pdf.js and the workers arrive
 * here in M2, and a page somebody merely opened must not pull them in.
 */
const Workspace = dynamic(() => import("@/features/buffer/workspace"), {
  ssr: false,
});

export function WorkspaceMount() {
  return <Workspace />;
}
