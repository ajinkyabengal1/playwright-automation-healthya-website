import { test, Page } from "@playwright/test";
import { QuestionnairePage } from "../page-objects/QuestionnairePage";
import { dismissCookieConsent } from "../helpers/cookie-consent";

function detectConditionFromText(text: string): string | null {
  const t = (text || "").toLowerCase();
  if (/shingles|herpes zoster/.test(t)) return "shingles";
  if (/weight management|weight loss|bmi|obesity|semaglutide|wegovy|mounjaro/.test(t)) return "weight management";
  if (/erectile dysfunction|premature ejaculation|ed treatment|sexual health for men/.test(t)) return "erectile-dysfunction";
  return null;
}

async function fillMuiDatePicker(page: Page, day: string, month: string, year: string) {
  const picker = page.locator('.MuiPickersTextField-root').first();
  await picker.click();
  await page.keyboard.type(day.padStart(2, "0"), { delay: 80 });
  await page.keyboard.type(month.padStart(2, "0"), { delay: 80 });
  await page.keyboard.type(year, { delay: 80 });
}

test.describe("Pasted Link Logged-In Flow", () => {
  test("enters DOB + PIN then runs questionnaire from START_URL", async ({
    page,
  }) => {
    const startUrl = process.env.START_URL;
    const pin = (process.env.TD_PIN ?? "").trim();
    const dobDay = (process.env.TD_DOB_DAY ?? "").trim();
    const dobMonth = (process.env.TD_DOB_MONTH ?? "").trim();
    const dobYear = (process.env.TD_DOB_YEAR ?? "").trim();

    console.log(`[loggedin] START_URL=${startUrl ? "set" : "MISSING"} | DOB=${dobDay}/${dobMonth}/${dobYear} | PIN=${pin ? `len=${pin.length}` : "EMPTY"}`);

    test.skip(!startUrl, "START_URL not provided");
    test.skip(!pin, "TD_PIN is empty — restart server after adding PIN in dashboard");
    test.skip(!dobDay || !dobMonth || !dobYear, "DOB not fully provided");

    await page.goto(startUrl!, { waitUntil: "domcontentloaded" });
    await dismissCookieConsent(page);

    // Bail out early if the link has expired
    const bodyText = await page.locator("body").innerText().catch(() => "");
    if (/link is expired/i.test(bodyText)) {
      console.log("⚠ Link is Expired — stopping test.");
      test.skip(true, "Link is Expired — this consultation link is no longer available.");
      return;
    }

    // Wait for DOB+PIN auth gate
    await page.locator('.MuiPickersTextField-root').first().waitFor({ state: "visible", timeout: 15_000 });

    await fillMuiDatePicker(page, dobDay, dobMonth, dobYear);

    // PIN — ant-design controlled input
    const pinField = page.locator('input.ant-input[placeholder="Enter Pin Number"]').first();
    await pinField.waitFor({ state: "visible", timeout: 5_000 });
    await pinField.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
    await pinField.pressSequentially(pin, { delay: 60 });

    console.log(`[loggedin] PIN field after fill: "${await pinField.inputValue()}"`);

    const continueBtn = page.locator('button.submitbtn:has-text("Continue"), button.healthya-button:has-text("Continue")').first();
    await continueBtn.waitFor({ state: "visible", timeout: 5_000 });
    await continueBtn.click();
    await dismissCookieConsent(page);

    // Detect condition from page text so QuestionnairePage uses correct rule set
    await page.waitForTimeout(1500);
    const pageText = await page.locator("body").innerText().catch(() => "");
    const conditionKey = detectConditionFromText(pageText);
    if (conditionKey) {
      process.env.OVERRIDE_ACTIVE_CONDITION = conditionKey;
      console.log(`[loggedin] Auto-detected condition: "${conditionKey}"`);
    } else {
      console.log("[loggedin] Could not auto-detect condition — using generic strategy");
    }

    const questionnaire = new QuestionnairePage(page);
    await questionnaire.waitForPage();
    await questionnaire.answerAllQuestions();
  });
});
