import {
  CheckIcon,
  CodeIcon,
  ColumnsIcon,
  MessageSquareIcon,
  SearchIcon,
  ShieldIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react";

import type { FeatureIcon as FeatureIconName } from "@/lib/content/features";

const icons: Record<FeatureIconName, LucideIcon> = {
  search: SearchIcon,
  code: CodeIcon,
  message: MessageSquareIcon,
  shield: ShieldIcon,
  type: TypeIcon,
  columns: ColumnsIcon,
  check: CheckIcon,
};

/** The icon on a check card. The name comes from the description file's front matter. */
export function FeatureIcon({
  name,
  className,
}: {
  readonly name: FeatureIconName;
  readonly className?: string;
}) {
  const Icon = icons[name];
  return <Icon className={className} aria-hidden="true" />;
}
