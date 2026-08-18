import { Page, expect } from "@playwright/test";

/**
 * The app reads its bearer token from localStorage, falling back to
 * VITE_DEV_TOKEN (see stores/authAtom.ts). E2E injects it before any script
 * runs, so the very first navigation is already authenticated and no login
 * screen appears in the recording.
 */
export async function authenticate(page: Page) {
  const token = process.env.E2E_TOKEN;
  if (!token) {
    throw new Error(
      "E2E_TOKEN is not set. Mint one with:\n" +
        "  cd api && bundle exec rails runner " +
        `'puts JsonWebToken.encode({user_id: 1, role: "admin", scheme: "test-corp"})'`
    );
  }

  await page.addInitScript((t) => {
    window.localStorage.setItem("auth_token", t as string);
  }, token);
}

const DEMO_ASSESSMENT = process.env.E2E_ASSESSMENT ?? "DEMO — Frontend Engineer";

/**
 * Walks from the assessment list to the demo session's portfolio.
 *
 * Deliberately navigates rather than deep-linking to a hardcoded id: the path a
 * real assessor takes is part of what this test is meant to prove, and it keeps
 * the suite working against any freshly seeded database.
 */
export async function openDemoPortfolio(page: Page) {
  await page.goto("/assessments");

  const row = page.getByText(DEMO_ASSESSMENT, { exact: false }).first();
  await expect(
    row,
    `Demo assessment not found. Run: cd api && bundle exec rails demo:seed`
  ).toBeVisible();
  await row.click();

  // The invite page lists the sessions for this assessment.
  await expect(page).toHaveURL(/\/assessments\/\d+\/invite/);

  const portfolioLink = page
    .getByRole("link", { name: /portfolio|hasil|result/i })
    .or(page.getByRole("button", { name: /portfolio|hasil|result/i }))
    .first();

  await expect(
    portfolioLink,
    "No finished session on the demo assessment — re-run demo:seed"
  ).toBeVisible();
  await portfolioLink.click();

  await expect(page).toHaveURL(/\/sessions\/\d+\/portfolio/);
  return page.url();
}

/** Reads the numeric ids out of the current portfolio URL. */
export function idsFromPortfolioUrl(url: string) {
  const m = url.match(/\/assessments\/(\d+)\/sessions\/(\d+)\/portfolio/);
  if (!m) throw new Error(`Unexpected portfolio URL: ${url}`);
  return { assessmentId: m[1], sessionId: m[2] };
}
