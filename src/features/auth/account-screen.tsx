"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { DownloadIcon, LogInIcon, LogOutIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  ApiError,
  deleteAccount,
  exportAccountData,
  getEntitlements,
  messageKeyFor,
  oauthStartUrl,
  signOut,
} from "@/lib/api";
import { oauthProviders, type Session } from "@/lib/domain";
import { download } from "@/lib/export";

import { useBilling } from "./use-billing";
import { useLeaveSite } from "./leave-site";
import { clearEverything } from "./session";
import { useSession } from "./use-session";

/**
 * The account, and nothing besides it.
 *
 * There is no dashboard here: no list of past checks, no library of documents,
 * no history. Results are not addressable and manuscripts are not kept on our
 * side, so there is nothing for such a page to show. What is here is the four
 * things a person actually comes for - signing in, buying or managing access,
 * taking their data with them, and leaving for good - plus the sentence that
 * says which of those touches the server and which touches this browser.
 */
export function AccountScreen() {
  const t = useTranslations("account");
  const { session, pending } = useSession();

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
      data-testid="account-screen"
    >
      <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
        {session?.user == null ? t("signInTitle") : t("title")}
      </h1>

      {pending ? (
        <p className="text-lg text-muted-foreground">{t("loading")}</p>
      ) : session?.user == null ? (
        <SignIn />
      ) : (
        <SignedIn session={session} />
      )}
    </div>
  );
}

/** The way in. Three providers, one flow, and no password field anywhere. */
function SignIn() {
  const t = useTranslations("account");
  const locale = useLocale();
  const { leave, dialog } = useLeaveSite();

  return (
    <>
      <p className="text-lg text-muted-foreground">{t("signInLead")}</p>

      <div className="flex w-full max-w-[26rem] flex-col gap-3 rounded-xl border border-primary/40 bg-card p-6 shadow-sm">
        {oauthProviders.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outlineOnCard"
            data-testid={`sign-in-${provider}`}
            onClick={() =>
              // The whole flow belongs to the server: the exchange of the code,
              // the `state` and the allowlist of return addresses are things
              // only the server can verify, so the browser is simply sent
              // there, and it comes back to a path on this site.
              leave(() => {
                window.location.assign(oauthStartUrl(provider, `/${locale}/`));
              })
            }
          >
            <LogInIcon aria-hidden="true" />
            {t(`provider.${provider}`)}
          </Button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{t("freeWithoutAccount")}</p>
      {dialog}
    </>
  );
}

function SignedIn({ session }: { readonly session: Session }) {
  const t = useTranslations("account");
  // The words of the payment button belong to the offer, and the pricing card
  // presses the same button: two spellings of "Connect Pro" would be two
  // spellings of the same errand.
  const plan = useTranslations("pricing");
  const errors = useTranslations();
  const queries = useQueryClient();
  const { leave, dialog } = useLeaveSite();
  const [deleting, setDeleting] = React.useState(false);

  // The same question the working screen asks, under the same key: whether paid
  // access is open right now. It is the server's answer, and nothing here works
  // it out from anything else.
  const entitlements = useQuery({
    queryKey: ["entitlements"],
    queryFn: ({ signal }) => getEntitlements({ signal }),
    staleTime: 60_000,
  });

  const forget = React.useCallback(() => {
    /*
     * Reset rather than clear. Both drop every answer the cache was holding -
     * which is the point, because those answers are the analysis of somebody's
     * manuscript - but clearing removes the queries themselves, and a screen
     * whose query has been removed goes on showing the last thing it was
     * handed. Resetting empties them and asks again, so what appears next is
     * the server's answer to a browser that has just signed out.
     */
    clearEverything(() => void queries.resetQueries());
  }, [queries]);

  const leaveOut = useMutation({
    mutationFn: () => signOut(),
    // Whatever the server answered, this browser stops holding anything: a
    // sign-out that failed on the network must not leave somebody's manuscript
    // behind on a shared computer.
    onSettled: forget,
  });

  // The export is written to a file rather than shown: what the server holds
  // about a person is theirs to keep, and a JSON body on screen is not that.
  const exported = useMutation({
    mutationFn: () => exportAccountData(),
    onSuccess: (data) =>
      download(
        JSON.stringify(data, null, 2),
        "refscout-account.json",
        "application/json",
      ),
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: forget,
  });

  const open = entitlements.data?.access === true;
  const billing = useBilling({ leave, open });

  const failure =
    [leaveOut, exported, remove]
      .map((mutation) => mutation.error)
      .find((error) => error !== null) ?? billing.error;

  return (
    <>
      <dl className="flex flex-col gap-1 rounded-xl border bg-card p-6 shadow-sm">
        <dt className="text-sm text-muted-foreground">{t("signedInAs")}</dt>
        {/* An address is an identifier rather than a sentence, so it is set in
            the mono face and can be read character by character. */}
        <dd className="font-mono text-base" data-testid="account-email">
          {session.user?.email}
        </dd>
        <dt className="mt-3 text-sm text-muted-foreground">{t("accessLabel")}</dt>
        <dd data-testid="account-access" data-access={open ? "open" : "closed"}>
          {entitlements.data === undefined
            ? t("accessChecking")
            : open
              ? t("accessOpen")
              : t("accessClosed")}
        </dd>
      </dl>

      {/* Buying access and managing a subscription are the payment provider's
          own pages, and the browser is sent to them. This application has no
          field for a card number and never sees one. */}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          data-testid="account-billing"
          aria-busy={billing.busy}
          onClick={billing.press}
        >
          {open ? plan("manage") : plan("connect")}
        </Button>
        <Button
          type="button"
          variant="outline"
          data-testid="account-sign-out"
          onClick={() => leaveOut.mutate()}
        >
          <LogOutIcon aria-hidden="true" />
          {t("signOut")}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">{t("signOutClears")}</p>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{t("yourData")}</h2>
        {/* Two operations with similar names and different subjects, so they
            are said apart: one removes what our server holds, the other removes
            what this browser holds. */}
        <p className="text-sm text-muted-foreground">{t("yourDataBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outlineOnCard"
            data-testid="account-export"
            aria-busy={exported.isPending}
            onClick={() => exported.mutate()}
          >
            <DownloadIcon aria-hidden="true" />
            {t("exportData")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="account-delete"
            onClick={() => setDeleting(true)}
          >
            <Trash2Icon aria-hidden="true" />
            {t("deleteAccount")}
          </Button>
        </div>
      </section>

      {failure === undefined ? null : (
        <p role="alert" className="text-sm text-critical" data-testid="account-failure">
          {errors(
            messageKeyFor(failure instanceof ApiError ? failure.failure.code : "unknown"),
          )}
        </p>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle")}
        body={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("deleteCancel")}
        onConfirm={() => remove.mutate()}
        testId="delete-account"
      />
      {dialog}
    </>
  );
}
