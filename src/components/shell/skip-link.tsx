import { useTranslations } from "next-intl";

/**
 * The first thing in the tab order, and on most visits the only thing nobody
 * sees.
 *
 * Six controls stand between the top of the page and the content on every
 * address here - the logo, two links, the menu, the theme and the account
 * entry - and they are the same six on every one of them. Anybody moving
 * through the page by keyboard walks that row again at each address before
 * reaching what they came for, and a screen reader reads it out each time.
 * This is the way past it, and it is a real link to a real target rather than
 * a script that moves the focus.
 *
 * It is off the top of the viewport rather than hidden: a hidden control is not
 * focusable, and one taking room would be a bar above every page for the sake
 * of a shortcut most people never use. Focus brings it down; leaving it sends
 * it back.
 */
export const MAIN_ID = "content";

export function SkipLink() {
  const t = useTranslations("nav");

  return (
    <a
      href={`#${MAIN_ID}`}
      className="fixed start-4 top-3 z-50 -translate-y-20 rounded-md border bg-card px-4 py-2 text-sm font-medium shadow-[var(--elevation-md)] transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] focus:translate-y-0"
    >
      {t("skipToContent")}
    </a>
  );
}
