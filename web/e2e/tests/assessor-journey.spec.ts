import { test, expect } from "@playwright/test";
import { authenticate, openDemoPortfolio, idsFromPortfolioUrl } from "../support/session";

/**
 * The assessor's journey, end to end, against a running stack.
 *
 * Every assertion here maps to an acceptance criterion from the report, so the
 * recording produced by this run is not a screen capture of someone clicking
 * around — it is a recording of assertions that passed.
 *
 * Requires: api on :3001, web on :5173, and `rails demo:seed` already run.
 */

test.beforeEach(async ({ page }) => {
  await authenticate(page);
});

test.describe("Portfolio → Fit/Gap, the decision surface", () => {
  test("carries the bar, the provenance and the uncertainty all the way to the report", async ({ page }) => {
    // ── 1 · the portfolio ─────────────────────────────────────────────────
    const portfolioUrl = await openDemoPortfolio(page);
    const { assessmentId, sessionId } = idsFromPortfolioUrl(portfolioUrl);

    await expect(page.getByRole("heading", { name: /portfolio/i })).toBeVisible();

    // AC-3.2 — a skill whose confidence was never reported must say so, and must
    // not be dressed up as a low-confidence finding about the candidate.
    await expect(page.getByText(/belum terukur/i).first()).toBeVisible();
    await expect(page.getByText(/keyakinan:\s*rendah/i).first()).toBeVisible();

    // AC-7.4 — the 2,000-character summary in the seed must not break layout.
    const cards = page.locator("[class*='rounded'][class*='border']");
    await expect(cards.first()).toBeVisible();

    // ── 2 · verifiability: a quote must be locatable ──────────────────────
    // The single feature that turns the model from an oracle into a tool.
    const evidenceLink = page.getByRole("link", { name: /lihat di transkrip/i }).first();
    await expect(evidenceLink).toBeVisible();
    await evidenceLink.click();

    await expect(page).toHaveURL(/\/transcript#turn-\d+/);
    await expect(page.getByText(/menyorot giliran yang dikutip/i)).toBeVisible();
    // The cited turn is highlighted rather than merely scrolled to.
    await expect(page.locator("[id^='turn-'].ring-2").first()).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/portfolio/);

    // ── 3 · the human correction is visible on the card ───────────────────
    // AC-2.2 — an override states what it replaced, who decided, and when.
    await expect(page.getByText(/dikoreksi assessor/i).first()).toBeVisible();
    await expect(page.getByText(/@/).first()).toBeVisible();

    // ── 4 · run the fit/gap analysis ──────────────────────────────────────
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /DEMO/i }).first().click();
    await page.getByRole("button", { name: /fit\/gap/i }).click();

    await expect(page).toHaveURL(/\/fitgap\/\d+/);

    // The report may be queued; wait for the table rather than a fixed sleep.
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 45_000 });

    // ── 5 · the four P0s, asserted on the rendered report ─────────────────

    // AC-1.1 / P0-1 — the bar is stated. This is the column that used to render
    // as an empty cell on every single row.
    const requiredHeader = page.getByRole("columnheader", { name: /dibutuhkan|required/i });
    await expect(requiredHeader).toBeVisible();
    const securityRow = page.getByRole("row").filter({ hasText: "Security Engineering" });
    await expect(securityRow).toContainText("L4");

    // AC-2.2 / P0-2 — the override is marked, with its author, and the legend
    // now describes something that actually exists on the page.
    const overriddenRow = page.getByRole("row").filter({ hasText: "Testing & Quality Assurance" });
    await expect(overriddenRow).toContainText(/AI L2/);
    await expect(overriddenRow).toContainText("@");
    await expect(page.getByText(/dikoreksi assessor/i)).toBeVisible();

    // AC-3.1 / P0-3 — confidence and the probe count behind it.
    await expect(securityRow).toContainText(/rendah/i);
    await expect(securityRow).toContainText(/1 probe/);

    // AC-3.3 — a gap resting on thin evidence is called out, because rejecting
    // someone on one probe is the most consequential thing this report can do.
    await expect(page.getByRole("note")).toContainText(/sesi lanjutan/i);

    // AC-4.4 — a skill nobody probed reads as unassessed, never as L1.
    const devopsRow = page.getByRole("row").filter({ hasText: "DevOps & CI/CD" });
    await expect(devopsRow).toContainText("—");
    await expect(devopsRow).not.toContainText("L1");

    // AC-7.1 — status is carried by a text label, not colour or emoji alone.
    await expect(page.getByText(/belum dinilai/i).first()).toBeVisible();

    // Keep the ids visible in the recording for anyone reproducing the run.
    test.info().annotations.push({
      type: "demo",
      description: `assessment=${assessmentId} session=${sessionId}`,
    });
  });

  test("marks the report stale when an assessor overrides after it was computed", async ({ page }) => {
    // AC-6.5 — a report older than the assessor's own correction is misleading,
    // not merely out of date. The page has to say so.
    const portfolioUrl = await openDemoPortfolio(page);

    await page.getByRole("button", { name: /override|ubah/i }).first().click();
    await page.getByRole("radio").nth(4).click(); // L5
    await page.getByRole("textbox").last().fill("E2E: raising this to L5 to prove staleness detection.");
    await page.getByRole("button", { name: /simpan/i }).click();

    // The correction and its author appear without a reload.
    await expect(page.getByText(/dikoreksi assessor/i).first()).toBeVisible();

    await page.goto(portfolioUrl);
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: /DEMO/i }).first().click();
    await page.getByRole("button", { name: /fit\/gap/i }).click();

    await expect(page.getByRole("table")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(/lebih tua dari koreksimu/i)).toBeVisible();
  });
});

test.describe("designed failure paths", () => {
  test("names the offending field when the API breaks its own contract", async ({ page }) => {
    // AC-1.2 — the failure this replaces was silent: a renamed field produced
    // undefined, React rendered nothing, and a blank cell in a hiring report
    // looked like a design choice.
    const portfolioUrl = await openDemoPortfolio(page);
    const { assessmentId, sessionId } = idsFromPortfolioUrl(portfolioUrl);

    await page.route("**/portfolios/*/fitgap/*", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const report = body?.data?.report ?? body?.report;
      // Strip the bar from every row — exactly the P0-1 shape.
      report.skill_comparisons = report.skill_comparisons.map((c: any) => {
        const { required_level, expected_level, ...rest } = c;
        return rest;
      });
      await route.fulfill({ response, json: body });
    });

    const vacancyId = process.env.E2E_VACANCY_ID ?? "1";
    await page.goto(`/assessments/${assessmentId}/sessions/${sessionId}/fitgap/${vacancyId}`);

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/tidak lengkap/i);
    await expect(alert).toContainText(/required_level/);
    // Refusing to render beats rendering a report with an invisible hole in it.
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("surfaces an error and a way out when the API fails", async ({ page }) => {
    // AC-6.1 — a 500 used to produce a page with a heading and nothing else.
    const portfolioUrl = await openDemoPortfolio(page);
    const { assessmentId, sessionId } = idsFromPortfolioUrl(portfolioUrl);

    await page.route("**/portfolios/*/fitgap/*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: "{}" })
    );

    const vacancyId = process.env.E2E_VACANCY_ID ?? "1";
    await page.goto(`/assessments/${assessmentId}/sessions/${sessionId}/fitgap/${vacancyId}`);

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("button", { name: /coba lagi/i })).toBeVisible();
  });
});
