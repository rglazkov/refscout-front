/**
 * Who is signed in, and the token every mutating request carries.
 *
 * The session itself is a cookie the browser holds and this code never sees:
 * it is `HttpOnly`, so one cross-site script cannot read it and walk away with
 * the account. What does come back in the body is the CSRF token, which is
 * sent again in a header on every mutating request - the cookie proves the
 * session, and the header proves the request came from our own page.
 */
export const oauthProviders = ["google", "github", "orcid"] as const;

export type OauthProvider = (typeof oauthProviders)[number];

export type AccountUser = {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
  readonly createdAt: string;
};

/** An anonymous principal is an ordinary answer, not a failure: `user` is null. */
export type Session = {
  readonly user: AccountUser | null;
  readonly csrfToken: string;
};
