import { type Transition } from "motion/react";

/**
 * JavaScript mirrors of the CSS motion tokens in `tokens.css` (spec §14).
 * Motion expects seconds and numeric bezier tuples, so it cannot consume the
 * CSS custom properties directly. Keeping every JS transition here prevents
 * components from inventing almost-the-same timings of their own.
 */
const easeOut = [0.2, 0.8, 0.25, 1] as const;
const easeIn = [0.4, 0, 1, 1] as const;
const easeMorph = [0.4, 0, 0.2, 1] as const;

export const motionTransition = {
  fast: { duration: 0.11, ease: easeOut },
  standard: { duration: 0.16, ease: easeOut },
  slow: { duration: 0.2, ease: easeOut },
  gather: { duration: 0.24, ease: easeOut },
  morph: { duration: 0.26, ease: easeMorph },
  exit: { duration: 0.14, ease: easeIn },
} satisfies Readonly<Record<string, Transition>>;

export const motionMs = {
  morph: 260,
} as const;

export const motionEasing = {
  morph: "cubic-bezier(.4, 0, .2, 1)",
} as const;
