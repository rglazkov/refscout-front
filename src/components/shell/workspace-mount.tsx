"use client";

import dynamic from "next/dynamic";

/**
 * The mount point of the workspace screen. A separate client module is needed
 * because ssr: false is not allowed in a server component, and the dynamic
 * loading rule requires exactly that: pdf.js and the workers are pulled in
 * here, and a page somebody merely opened must not carry the weight of them.
 */
const Workspace = dynamic(() => import("@/features/buffer/workspace"), {
  ssr: false,
});

export function WorkspaceMount() {
  return <Workspace />;
}
