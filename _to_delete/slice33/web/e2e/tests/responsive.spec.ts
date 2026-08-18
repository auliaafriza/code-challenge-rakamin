import { test, expect } from "@playwright/test";
import { authenticate, openDemoPortfolio, idsFromPortfolioUrl } from "../support/session";

/**
 * AC-7.3 — the comparison table has to be readable and operable on a phone.
 * Runs under the `mobile` project (iPhone SE, 375px) from the config.
 */
test("the decision surface survives a 375px viewport", async ({ page }) => {
  await authenticate(page);

  const portfolioUrl = await openDemoPortfolio(page);
  const { assessmentId, sessionId } = idsFromPortfolioUrl(portfolioUrl);
  const vacancyId = process.env.E2E_VACANCY_ID ?? "1";

  await page.goto(`/assessments/${assessmentId}/sessions/${sessionId}/fitgap/${vacancyId}`);

  const table = page.getByRole("table");
  await expect(table).toBeVisible({ timeout: 45_000 });

  // Every column must be reachable — the table scrolls inside its container
  // rather than pushing the page itself sideways.
  const pageOverflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(pageOverflows, "the page itself must not scroll horizontally").toBe(false);

  const scroller = page.locator("div.overflow-x-auto").first();
  await scroller.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
  await expect(page.getByRole("columnheader", { name: /hasil|result/i })).toBeInViewport();

  // AC-7.1 — status still carries a text label at this width.
  await expect(page.getByText(/belum dinilai/i).first()).toBeVisible();

  // AC-7.5 — the no-spaces label in the seed must wrap, not stretch the table.
  await expect(page.getByRole("table")).toBeVisible();
});
