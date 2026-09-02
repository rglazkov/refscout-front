import { expect, test } from "@playwright/test";

import { fillOf, openTheSettings } from "../support/select";

/**
 * What the pointer does to the drop-down and to the rows of its open list.
 *
 * It lives here rather than in `shared` because hover is a state a touch screen
 * does not have: Tailwind emits the hover rules behind `@media (hover: hover)`,
 * so on a phone they are not merely unused, they are not there. A test for a
 * state a width does not have belongs to the width that has it.
 */
test("the closed control lights under the pointer, and deeper when pressed", async ({
  page,
}) => {
  const trigger = await openTheSettings(page);
  const idle = await fillOf(trigger);

  await trigger.hover();
  await expect.poll(() => fillOf(trigger)).not.toBe(idle);
  const hovering = await fillOf(trigger);

  // Pressed is a third colour rather than the hover colour again. The pointer
  // is over the control in both moments, so a fill shared with hover would say
  // nothing about the press that opened the list.
  await trigger.click();
  await expect(trigger).toHaveAttribute("data-state", "open");
  await expect.poll(() => fillOf(trigger)).not.toBe(hovering);
});

test("the row under the pointer is lit, and the row it left is not", async ({ page }) => {
  const trigger = await openTheSettings(page);
  await trigger.click();

  const rows = page.getByRole("option");
  const first = rows.first();
  const second = rows.nth(1);

  await first.hover();
  const lit = await fillOf(first);
  expect(lit).not.toBe(await fillOf(second));

  // Moving on takes the highlight with it, or the list ends up lit end to end
  // and stops saying which row a press would choose.
  await second.hover();
  await expect.poll(() => fillOf(second)).toBe(lit);
  await expect.poll(() => fillOf(first)).not.toBe(lit);
});
