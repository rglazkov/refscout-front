import { THEME_STORAGE_KEY } from "./script";

export { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./script";

/** The two positions of the toggle. "System" is not one of them (M0.2.4). */
export const themes = ["light", "dark"] as const;

export type Theme = (typeof themes)[number];

/**
 * The theme currently on screen. Asked of the document rather than of storage:
 * until a choice has been made the theme is decided by @media
 * (prefers-color-scheme) in the tokens, and the browser is the only one that
 * knows the answer.
 */
export function resolveTheme(): Theme {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const listeners = new Set<() => void>();

/** The switch in progress, so an overlapping one does not clear the attribute early. */
let switching = 0;

/**
 * Swaps the theme with transitions muted (§14). Every colour on the page
 * changes at once, and each component carrying a bare `transition-*` utility
 * would otherwise interpolate on its own: hundreds of colours crossing over out
 * of step, which reads as a rendering fault rather than as a transition. The
 * rule that mutes them lives in the base layer of `globals.css`.
 *
 * The reflow between applying and releasing is what makes it work: it forces
 * the new colours to be computed while the attribute is still on, so lifting it
 * afterwards changes nothing and starts nothing. The timer is a backstop for
 * the tab that is not on screen - `storage` events arrive in a hidden tab,
 * where requestAnimationFrame does not run until it is looked at again.
 */
function withoutTransitions(apply: () => void): void {
  const root = document.documentElement;
  const token = ++switching;
  root.setAttribute("data-theme-switching", "");

  apply();
  // Reading a laid-out property forces the style recalculation to happen now.
  void root.offsetHeight;

  const release = (): void => {
    if (token === switching) root.removeAttribute("data-theme-switching");
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(release);
  });
  setTimeout(release, 100);
}

/**
 * Puts the choice another tab made onto this document, which is the same thing
 * the inline script does on load: the attribute, or nothing at all when the
 * choice has been cleared and the page goes back to following the system.
 *
 * Notifying React alone would not be enough and would not even show: the theme
 * on screen is decided by the attribute and by @media in the tokens, and
 * resolveTheme reads that attribute. Without this the second tab re-renders to
 * exactly the value it already had, and the theme silently fails to travel.
 */
function applyStoredTheme(value: string | null): void {
  withoutTransitions(() => {
    const root = document.documentElement;
    if (value === "dark" || value === "light") root.setAttribute("data-theme", value);
    else root.removeAttribute("data-theme");
  });
}

/**
 * The subscription for useSyncExternalStore. The theme can change three ways:
 * a click here, a click in another tab, and a change in the environment -
 * until the user has chosen anything, the page follows the system.
 */
export function subscribeToTheme(listener: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  // `storage` fires in the other tabs of this origin, never in the one that
  // wrote. A null key means storage was cleared wholesale.
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyStoredTheme(event.key === null ? null : event.newValue);
    listener();
  };

  // The environment changing theme under a page that has made no choice is a
  // change of theme like any other, and is not animated either. Here the colours
  // come from @media in the tokens, so the swap is the browser's and this
  // handler can only catch it: arriving a moment late is harmless, because
  // muting a transition midway leaves the interface at the end state (§14).
  const onSystemChange = (): void => {
    withoutTransitions(() => {});
    listener();
  };

  listeners.add(listener);
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The only function that writes the theme choice to localStorage. That keeps
 * the list of what is persisted between sessions small enough to survey and to
 * check with the persisted-state shape test (§13, M0.4.3).
 */
export function chooseTheme(theme: Theme): void {
  withoutTransitions(() => {
    document.documentElement.setAttribute("data-theme", theme);
  });
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Private mode or storage disabled: the theme simply will not outlive the tab.
  }
  for (const listener of listeners) listener();
}
