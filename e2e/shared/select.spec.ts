import { expect, test } from "@playwright/test";

import { fillOf, openTheSettings } from "../support/select";

/**
 * The drop-down and the rows of its open list are controls, and they look like
 * controls.
 *
 * This is why the list is drawn in the page rather than by the platform: the
 * `<option>` elements of a native `<select>` belong to the operating system, and
 * `cursor` and `:hover` on them are ignored by every engine. A choice of a
 * companion, of a key format and of an order of entries is made from such a
 * list, so the list is ours - and being ours is exactly what has to be checked,
 * because a native one would pass a test written against its closed control
 * alone.
 *
 * What the pointer does to them is a separate suite, under `desktop`: hover is
 * a state a touch screen does not have, so a test for it belongs to the width
 * that has one rather than to both with an exclusion.
 */
test("the control and every row of its list carry the pointer", async ({ page }) => {
  const trigger = await openTheSettings(page);
  await expect(trigger).toHaveCSS("cursor", "pointer");

  await trigger.click();
  const rows = page.getByRole("option");
  await expect(rows).not.toHaveCount(0);

  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    await expect(rows.nth(index)).toHaveCSS("cursor", "pointer");
  }
});

test("an open list says so on the control it came from", async ({ page }) => {
  const trigger = await openTheSettings(page);
  const idle = await fillOf(trigger);

  await trigger.click();
  await expect(trigger).toHaveAttribute("data-state", "open");

  // Said by colour, which is how every state of every control in the product is
  // said: a control that changed shape under the finger would be a second
  // language for the same thing.
  await expect.poll(() => fillOf(trigger)).not.toBe(idle);
});

test("choosing from the list closes it and answers on the control", async ({ page }) => {
  const trigger = await openTheSettings(page);
  await trigger.click();

  const chosen = page.getByRole("option").nth(1);
  const label = (await chosen.innerText()).trim();
  await chosen.click();

  await expect(trigger).toHaveAttribute("data-state", "closed");
  await expect(trigger).toContainText(label);
});
