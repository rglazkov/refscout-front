import type { BrowserContext } from "@playwright/test";

/**
 * Keeps the mock's service worker off the scope, so a test about the offline
 * shell is asking about the shell.
 *
 * A scope belongs to one service worker. In a build wired to the mock, the
 * contract's own bodies are served from a worker registered at the root scope,
 * and that registration is started on every page - the account control in the
 * header starts it, and that control is on the legal pages too. So a test that
 * registers the shell at the same scope is not testing the shell: measured, the
 * mock replaces it about a second later, and every question asked afterwards is
 * asked of a registration that is no longer the shell's.
 *
 * The failure that comes of it is worse than a red test. `waiting` is a slot,
 * not a name: with both scripts contending for one scope, one of them ends up
 * waiting behind the other, and a check that only reads the state finds
 * "installed" and goes green on the wrong worker. So the shell is given the
 * scope to itself, and the checks below name the script they expect.
 *
 * Refusing the registration rather than unregistering afterwards is what makes
 * it stick: the mock is started once per document, so a page that is reloaded
 * would otherwise put it straight back. The refusal is a rejection rather than
 * a promise left pending, and the difference is the whole screen: a source that
 * will not start is something the application is built to carry on without, but
 * one that never answers holds the workspace at nothing drawn, with somebody's
 * manuscript in the storage behind it.
 *
 * A test that needs the mock first can bring its document in and call this
 * before it takes the scope: pages already open are covered as well as the ones
 * opened afterwards. Both are needed, and the second one is what a busy machine
 * finds out. The mock is started when the screen mounts and registers whenever
 * that call gets its turn, so on a page that is already open the registration
 * may still be ahead of the shell rather than behind it - and a shell put on the
 * scope before that lands is taken off it a moment later.
 */
export async function keepTheMockOffTheScope(context: BrowserContext): Promise<void> {
  const refuse = () => {
    // A page that is not on a document yet has no service workers to speak of,
    // and every context starts on one.
    if (!("serviceWorker" in navigator)) return;
    const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.register = (
      url: string | URL,
      options?: RegistrationOptions,
    ) =>
      String(url).includes("mockServiceWorker")
        ? Promise.reject(
            new Error("the shell holds this scope for the length of this test"),
          )
        : register(url, options);
  };

  await context.addInitScript(refuse);
  for (const page of context.pages()) await page.evaluate(refuse);
}
