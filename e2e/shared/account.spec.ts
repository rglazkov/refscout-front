import { expect, test, type Page } from "@playwright/test";

/**
 * The account page in a real browser.
 *
 * Three claims are only answerable here. Leaving for the payment provider is a
 * real navigation, so the warning about the buffer has to stop it before it
 * happens rather than report it afterwards. Signing out has to empty a browser
 * rather than a store in a test - the reason the button exists is a shared
 * computer. And the page must ask for a card number nowhere: buying access is a
 * redirect, and a field for one here would be a field the product does not have.
 */
const MANUSCRIPT = `\documentclass{article}
\begin{document}
Dense retrieval is usually left to a frozen encoder.
\end{document}
`;

async function bringDocument(page: Page) {
  await page.getByRole("button", { name: "Paste text" }).click();
  const overlay = page.getByRole("dialog");
  await overlay.getByRole("textbox").click();
  await page.keyboard.type(MANUSCRIPT);
  await overlay.getByRole("button", { name: "Add to buffer" }).click();
  await expect(page.getByTestId("document-card")).toHaveCount(1);
}

/**
 * The header link rather than a fresh load of the address. Inside the
 * application this is one navigation without a reload, which is why the buffer
 * is still there when the account page opens - and why leaving for another
 * domain is a different matter entirely.
 */
async function openAccount(page: Page) {
  // By its place rather than by its word: what it says depends on whether
  // anybody is signed in, and this is a test about the navigation.
  await page.getByTestId("account-link").click();
  await expect(page.getByTestId("account-screen")).toBeVisible();
}

test("the account page holds no payment form", async ({ page }) => {
  await page.goto("/account/");

  await expect(page.getByTestId("account-screen")).toBeVisible();
  // No card number, and no password either: signing in goes through a provider,
  // and a reset arrives as a link to an address on the server.
  await expect(page.locator("input[type=password]")).toHaveCount(0);
  await expect(page.locator("input[autocomplete*='cc-']")).toHaveCount(0);
});

test("leaving for the payment provider asks first while the buffer holds a document", async ({
  page,
}) => {
  await page.goto("/");
  await bringDocument(page);
  await openAccount(page);

  await page.getByTestId("account-billing").click();

  // The browser has not gone anywhere. The extracted text is the only copy of
  // the document there is, and leaving comes back to a fresh page without it.
  await expect(page.getByTestId("leaving-site")).toBeVisible();
  await expect(page).toHaveURL(/\/account\//);
});

test("declining the warning leaves the buffer exactly as it was", async ({ page }) => {
  await page.goto("/");
  await bringDocument(page);
  await openAccount(page);

  await page.getByTestId("account-billing").click();
  await page.getByRole("button", { name: "Stay here" }).click();
  await expect(page.getByTestId("leaving-site")).toHaveCount(0);

  // Answering "not yet" costs nothing: the document is where it was left.
  await page.getByRole("link", { name: /home/i }).click();
  await expect(page.getByTestId("document-card")).toHaveCount(1);
});

test("signing out empties the buffer this browser was holding", async ({ page }) => {
  await page.goto("/");
  await bringDocument(page);
  await openAccount(page);

  await page.getByTestId("account-sign-out").click();
  // The way back in is what the page shows now, so the sign-out has happened
  // rather than merely been asked for.
  await expect(page.getByTestId("sign-in-google")).toBeVisible();

  await page.getByRole("link", { name: /home/i }).click();
  await expect(page.getByTestId("document-card")).toHaveCount(0);
});
