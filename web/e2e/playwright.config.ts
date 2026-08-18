import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Video is recorded for every run, not only failures. Two reasons: the case
 * study asks for a walkthrough of the real flow, and a recording of an assertion
 * that actually passed is stronger evidence than a screen capture of someone
 * clicking around — the video and the test are the same artefact.
 *
 * Traces are kept on failure so a red run can be opened in the Playwright trace
 * viewer with the DOM, network and console at every step.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./artifacts",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // A failing e2e here means the app is genuinely broken; retrying hides that.
  retries: 0,
  workers: 1,

  reporter: [
    ["list"],
    ["html", { outputFolder: "./report", open: "never" }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    video: { mode: "on", size: { width: 1280, height: 720 } },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
    actionTimeout: 15_000,
    // Slowed down deliberately: this run is meant to be watched by a human.
    launchOptions: { slowMo: Number(process.env.E2E_SLOWMO ?? 250) },
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone SE"] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
