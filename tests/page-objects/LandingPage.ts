import { Page } from "@playwright/test";

export class LandingPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async isVisible(): Promise<boolean> {
    if (!/\/patient_flow/i.test(this.page.url())) return false;
    const headingVisible = await this.page
      .locator(".introduction-wrapper h5")
      .first()
      .isVisible()
      .catch(() => false);
    const getStartedVisible = await this.page
      .locator(
        '.introduction-wrapper button.healthya-button:has-text("Get Started"), .introduction-wrapper button:has-text("Get Started")',
      )
      .first()
      .isVisible()
      .catch(() => false);
    return headingVisible || getStartedVisible;
  }

  async detectJourneyFlow(): Promise<string | null> {
    return await this.page.evaluate(() => {
      const introWrapper = document.querySelector(".introduction-wrapper");
      const searchContext = introWrapper || document.body;
      const allText = searchContext.innerText || searchContext.textContent || "";
      const text = allText.toLowerCase();

      const pointPatterns = [
        { label: "Sign Up", patterns: ["receive advice", "treatment", "personal details", "contact details", "sign up", "register", "create account"] },
        { label: "Questionnaire", patterns: ["checking your symptoms", "medical questions", "assessment", "questionnaire", "clinical questions", "medical history"] },
        { label: "Booking", patterns: ["book your appointment", "select a slot", "choose a time", "appointment time", "booking", "schedule", "appointment date"] }
      ];

      const points: { label: string, idx: number }[] = [];

      pointPatterns.forEach(point => {
        for (const p of point.patterns) {
          const idx = text.indexOf(p.toLowerCase());
          if (idx !== -1) {
            points.push({ label: point.label, idx: idx });
            break; 
          }
        }
      });

      points.sort((a, b) => a.idx - b.idx);
      if (points.length === 0) return null;
      return points.map((p) => p.label).join(" -> ");
    });
  }

  async clickGetStartedIfVisible(): Promise<boolean> {
    const container = this.page
      .locator('div:has(> .introduction-wrapper), .introduction-wrapper')
      .first();
    const inContainerBtn = container.locator(
      'button.healthya-button:has-text("Get Started"), button:has-text("Get Started")',
    );
    const fallbackBtn = this.page.locator(
      'button.healthya-button:has-text("Get Started"), button:has-text("Get Started"), a:has-text("Get Started")',
    );

    const btn = (await inContainerBtn.first().isVisible().catch(() => false))
      ? inContainerBtn.first()
      : fallbackBtn.first();

    const visible = await btn.isVisible().catch(() => false);
    if (!visible) return false;
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click().catch(() => {});
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
    await this.page.waitForTimeout(1200);
    return true;
  }
}
