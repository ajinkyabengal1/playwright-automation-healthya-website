import { expect, Page } from "@playwright/test";

export type AssessmentEmailResult = {
  assessmentUrl: string;
  passcode: string;
};

export async function openAssessmentFromYopmail(
  page: Page,
  inbox: string,
): Promise<AssessmentEmailResult> {
  await page.goto(`https://yopmail.com/en/?login=${encodeURIComponent(inbox)}`, {
    waitUntil: "domcontentloaded",
  });

  const mailFrame = page.frameLocator('#ifmail');

  const subjectPatterns = [
    /assessment/i,
    /start assessment/i,
    /online health/i,
  ];

  // Click latest likely assessment email in inbox list frame.
  const inboxFrame = page.frameLocator('#ifinbox');
  const rows = inboxFrame.locator('div.m, div.lm, button, a').filter({ hasText: /assessment|health/i });
  const rowCount = await rows.count().catch(() => 0);
  if (rowCount > 0) {
    await rows.first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  const bodyText = await mailFrame.locator('body').innerText().catch(() => "");
  const passcodeMatch = bodyText.match(/Passcode\s*[:\-]?\s*([A-Z0-9]{4,8})/i);
  const passcode = passcodeMatch?.[1] || "";
  expect(passcode, "Passcode not found in Yopmail email body").not.toBe("");

  const startLink = mailFrame
    .locator('a:has-text("Start Assessment"), button:has-text("Start Assessment"), a:has-text("Start")')
    .first();
  await expect(startLink).toBeVisible({ timeout: 20_000 });

  const [popup] = await Promise.all([
    page.context().waitForEvent("page"),
    startLink.click(),
  ]);
  await popup.waitForLoadState("domcontentloaded");

  const url = popup.url();
  expect(url, "Assessment URL did not open from email").toContain("patient_flow");

  return { assessmentUrl: url, passcode };
}

export async function fillDobAndPasscodeIfVisible(
  page: Page,
  opts: { day: string; month: string; year: string; passcode: string },
): Promise<void> {
  const fillIf = async (selectors: string[], value: string) => {
    for (const sel of selectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible().catch(() => false)) {
        await el.fill(value);
        return true;
      }
    }
    return false;
  };

  await fillIf(['input[name*="day" i]', 'input[placeholder*="DD" i]'], opts.day);
  await fillIf(['input[name*="month" i]', 'input[placeholder*="MM" i]'], opts.month);
  await fillIf(['input[name*="year" i]', 'input[placeholder*="YYYY" i]'], opts.year);
  await fillIf(
    ['input[name*="passcode" i]', 'input[placeholder*="passcode" i]', 'input[id*="passcode" i]'],
    opts.passcode,
  );

  const continueBtn = page
    .locator('button:has-text("Continue"), button:has-text("Submit"), button:has-text("Get Started"), button:has-text("Start")')
    .first();
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click().catch(() => {});
    await page.waitForTimeout(1200);
  }
}
