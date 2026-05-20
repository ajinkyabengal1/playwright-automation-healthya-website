import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.BASE_URL || "https://dev.healthya.co.uk/",
    trace: "on",
    screenshot: "only-on-failure",
    video: "on",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "healthya",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
