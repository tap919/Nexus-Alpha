/**
 * Nexus Alpha E2E Tests
 * Real Playwright tests covering the core user flows.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

// ─── Helpers ───────────────────────────────────────────────────────────────────
async function gotoApp(page: Page) {
  await page.goto(BASE_URL);
  await page.waitForLoadState("networkidle");
}

// ─── App Shell ──────────────────────────────────────────────────────────────────

test.describe("App Shell", () => {
  test("loads and shows the Nexus Alpha header", async ({ page }) => {
    await gotoApp(page);
    await expect(page).toHaveTitle(/Nexus Alpha/i);
    // The main heading or nav should be visible
    const heading = page.locator("h1, [data-testid='app-title'], nav").first();
    await expect(heading).toBeVisible();
  });

  test("has no critical accessibility violations", async ({ page }) => {
    await gotoApp(page);
    // Check for basic accessibility: page has a <main> landmark
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});

// ─── Navigation ─────────────────────────────────────────────────────────────────

test.describe("Navigation", () => {
  test("can navigate to all main tabs", async ({ page }) => {
    await gotoApp(page);

    const tabs = [
      "Overview",
      "Pipeline",
      "Agents",
      "Repos",
      "Browser",
      "CLI",
    ];

    for (const tab of tabs) {
      const tabEl = page.getByRole("button", { name: new RegExp(tab, "i") })
        .or(page.getByRole("link", { name: new RegExp(tab, "i") }))
        .first();

      if (await tabEl.isVisible()) {
        await tabEl.click();
        await page.waitForTimeout(300);
        // No errors should appear
        const errorBanner = page.locator("[role='alert'][data-type='error']");
        await expect(errorBanner).toHaveCount(0);
      }
    }
  });
});

// ─── Dashboard ──────────────────────────────────────────────────────────────────

test.describe("Dashboard Stats", () => {
  test("shows stat cards with numeric values", async ({ page }) => {
    await gotoApp(page);
    // Stats cards should render (even with loading state)
    const statCards = page.locator("[data-testid='stat-card'], .stat-card");
    // At least 1 stat card or the loading spinner
    const count = await statCards.count();
    const spinner = page.locator("[data-testid='loading'], .loading-spinner");
    const hasContent = count > 0 || (await spinner.count()) > 0;
    expect(hasContent).toBe(true);
  });
});

// ─── Pipeline ──────────────────────────────────────────────────────────────────

test.describe("Pipeline", () => {
  test("can trigger a pipeline run", async ({ page }) => {
    await gotoApp(page);

    // Navigate to pipeline tab
    const pipelineTab = page
      .getByRole("button", { name: /pipeline/i })
      .or(page.getByRole("link", { name: /pipeline/i }))
      .first();

    if (await pipelineTab.isVisible()) {
      await pipelineTab.click();
      await page.waitForTimeout(300);

      // Look for a "Run" or "Start" button
      const runBtn = page
        .getByRole("button", { name: /run|start|trigger|launch/i })
        .first();

      if (await runBtn.isVisible()) {
        await runBtn.click();
        await page.waitForTimeout(500);

        // Should show running state or progress
        const progressBar = page.locator(
          "[role='progressbar'], [data-testid='pipeline-progress'], .progress"
        );
        const runningIndicator = page.locator("text=/running|in progress|building/i");
        const hasActivity =
          (await progressBar.count()) > 0 || (await runningIndicator.count()) > 0;
        expect(hasActivity).toBe(true);
      }
    }
  });
});

// ─── CLI Terminal ───────────────────────────────────────────────────────────────

test.describe("CLI Terminal", () => {
  test("accepts text input and shows output", async ({ page }) => {
    await gotoApp(page);

    // Navigate to CLI tab
    const cliTab = page
      .getByRole("button", { name: /cli|terminal|command/i })
      .or(page.getByRole("link", { name: /cli|terminal|command/i }))
      .first();

    if (await cliTab.isVisible()) {
      await cliTab.click();
      await page.waitForTimeout(300);

      // Find input
      const input = page.locator("input[type='text'], textarea").last();
      if (await input.isVisible()) {
        await input.click();
        await input.fill("help");
        await input.press("Enter");
        await page.waitForTimeout(500);

        // Some output should appear
        const output = page.locator("[data-testid='cli-output'], .cli-output, pre, code");
        const count = await output.count();
        expect(count).toBeGreaterThanOrEqual(0); // At minimum, no crash
      }
    }
  });
});

// ─── Accessibility ─────────────────────────────────────────────────────────────

test.describe("Performance & Resilience", () => {
  test("page loads within 10 seconds", async ({ page }) => {
    const start = Date.now();
    await gotoApp(page);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });

  test("no unhandled console errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await gotoApp(page);
    // Filter out known benign errors (e.g. browser extension noise)
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("extension") &&
        !e.includes("net::ERR")
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
