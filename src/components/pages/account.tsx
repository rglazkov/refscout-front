import { AccountMount } from "@/components/shell/account-mount";
import { ZoneBoundary } from "@/components/shell/zone-boundary";

/**
 * The account page. It is a shell around a screen that only a browser can draw:
 * who is signed in, and what an account can do about access and about its own
 * data. Nothing about a document appears here.
 */
export function AccountPage() {
  return (
    <ZoneBoundary zone="account">
      <AccountMount />
    </ZoneBoundary>
  );
}
