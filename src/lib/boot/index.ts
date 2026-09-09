/**
 * What happens once, as the application starts.
 *
 * Three things, in this order: the store behind the texts becomes the durable
 * one and everything written last time is read back; the stores start writing
 * themselves down as they change; and this tab asks for the right to be the one
 * that writes. They are gathered here rather than spread over the screens
 * because the order between them matters and because a screen is the wrong
 * place to decide when an application starts.
 */
export { restoredBodies, restoreSession } from "./restore";
export { watchState } from "./subscribe";
export { useRestoredSession } from "./use-restored";
