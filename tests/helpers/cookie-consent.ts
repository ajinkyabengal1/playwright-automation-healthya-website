import { Page } from "@playwright/test";

export async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    const acceptBtn = page
      .locator(
        'button:has-text("Accept All"), button:has-text("Accept Cookies"), button:has-text("Accept all cookies")',
      )
      .first();
    const visible = await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (visible) {
      await acceptBtn.click({ timeout: 3000 });
      console.log("✔ Cookie consent dismissed (Accept All)");
      await page.waitForTimeout(500);
    }
  } catch {
    // Cookie banner not present or already dismissed — continue
  }
}
