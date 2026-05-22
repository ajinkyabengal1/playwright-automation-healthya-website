import { Page, expect, test } from "@playwright/test";
import {
  TEST_USER,
  CART_PREFERENCES,
  DRUG_SELECTION_PREFERENCES,
  SHIPPING_ADDRESS_PREFERENCES,
  THANK_YOU_PREFERENCES,
} from "../fixtures/test-data";
import { FlowConfig } from "../fixtures/flow-configs";
import { ConditionsPage } from "../page-objects/ConditionsPage";
import { ConditionDetailPage } from "../page-objects/ConditionDetailPage";
import { GuestContinuePage } from "../page-objects/GuestContinuePage";
import { QuestionnairePage } from "../page-objects/QuestionnairePage";
import { SignupPage } from "../page-objects/SignupPage";
import { ProductSignupPage } from "../page-objects/ProductSignupPage";
import { DrugSelectionPage } from "../page-objects/DrugSelectionPage";
import { CartPage } from "../page-objects/CartPage";
import { ShippingAddressPage } from "../page-objects/ShippingAddressPage";
import { ThankYouPage } from "../page-objects/ThankYouPage";
import { BookingPage } from "../page-objects/BookingPage";
import { PaymentPage } from "../page-objects/PaymentPage";
import { LandingPage } from "../page-objects/LandingPage";

type JourneyStep =
  | "landing"
  | "guest_continue"
  | "product_signup"
  | "questionnaire_submit"
  | "sign_up"
  | "appointment_booking"
  | "drug_selection"
  | "cart"
  | "shipping_address"
  | "thank_you"
  | "payment"
  | "success"
  | "gender_not_supported"
  | "dead_end"
  | "unknown";

function setupApiDebugLogging(page: Page): void {
  const enabled = (process.env.TD_API_DEBUG || "").trim().toLowerCase() === "true";
  if (!enabled) return;

  let counter = 0;
  const MAX_BODY_CHARS = 1500;
  const MAX_EVENTS = 250;

  const isApiLike = (url: string, resourceType: string): boolean => {
    const u = url.toLowerCase();
    return (
      resourceType === "xhr" ||
      resourceType === "fetch" ||
      u.includes("/api/") ||
      u.includes("graphql") ||
      u.includes("patient")
    );
  };

  page.on("response", async (response) => {
    try {
      if (counter >= MAX_EVENTS) return;
      const req = response.request();
      if (!isApiLike(response.url(), req.resourceType())) return;
      counter += 1;

      const url = response.url();
      const method = req.method();
      const status = response.status();

      let reqBody = req.postData() || "";
      if (reqBody.length > MAX_BODY_CHARS) {
        reqBody = `${reqBody.slice(0, MAX_BODY_CHARS)}...<truncated>`;
      }

      let resBody = "";
      const ctype = (response.headers()["content-type"] || "").toLowerCase();
      if (
        ctype.includes("application/json") ||
        ctype.includes("text/") ||
        ctype.includes("application/problem+json")
      ) {
        resBody = await response.text().catch(() => "");
        if (resBody.length > MAX_BODY_CHARS) {
          resBody = `${resBody.slice(0, MAX_BODY_CHARS)}...<truncated>`;
        }
      } else {
        resBody = `<non-text response: ${ctype || "unknown"}>`;
      }

      console.log(`[API ${counter}] ${method} ${status} ${url}`);
      if (reqBody) console.log(`[API ${counter}] request: ${reqBody}`);
      console.log(`[API ${counter}] response: ${resBody || "<empty>"}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[API] logger error: ${msg}`);
    }
  });
}

function detectQuestionnaireRulesKeyFromText(text: string): string | null {
  const t = (text || "").toLowerCase();

  // Shingles detection: require the word "shingles" in a heading/title context
  // (e.g. "Shingles Vaccine", "shingles assessment") but NOT just as a checkbox
  // option label (e.g. "Shingles" in "Please list all vaccines...").
  // We check for "shingles" appearing near condition/assessment/treatment context
  // OR "herpes zoster" which is specific to shingles conditions.
  if (
    /herpes zoster/.test(t) ||
    /shingles\s*(vaccination|vaccine|assessment|treatment|consultation|service|condition|questionnaire)/i.test(t) ||
    /(assessment|treatment|consultation|service|condition|questionnaire)\s*(for|about|regarding)?\s*shingles/i.test(t)
  ) {
    return "shingles";
  }

  if (
    /weight management|weight loss|bmi|obesity|semaglutide|wegovy|mounjaro/.test(
      t,
    )
  ) {
    return "weight management";
  }

  if (
    /erectile dysfunction|premature ejaculation|ed treatment|sexual health for men/.test(
      t,
    )
  ) {
    return "erectile-dysfunction";
  }

  return null;
}

async function checkLinkExpired(page: Page): Promise<void> {
  const bodyText = await page.locator("body").innerText().catch(() => "");
  if (/link is expired/i.test(bodyText)) {
    console.log("⚠ Link is Expired — stopping test.");
    test.skip(true, "Link is Expired — this consultation link is no longer available.");
  }
}

async function detectCurrentStep(page: Page): Promise<JourneyStep> {
  const currentUrl = page.url();

  const hasVisibleIndicator = async (selectors: string[]) => {
    for (const sel of selectors) {
      const nodes = page.locator(sel);
      const count = await nodes.count().catch(() => 0);
      const maxToCheck = Math.min(count, 5);
      for (let i = 0; i < maxToCheck; i++) {
        const visible = await nodes
          .nth(i)
          .isVisible({ timeout: 300 })
          .catch(() => false);
        if (visible) return true;
      }
    }
    return false;
  };

  // 0. Landing / intro page (must be before booking detection).
  const landingIndicators = [
    "text=/welcome to healthya preconsult/i",
    ".introduction-wrapper",
    '.introduction-wrapper button:has-text("Get Started")',
    'button.healthya-button:has-text("Get Started")',
  ];
  if (
    /\/patient_flow/i.test(currentUrl) &&
    (await hasVisibleIndicator(landingIndicators))
  ) {
    return "landing";
  }

  // 1. Cart step
  const cartIndicators = [
    "text=/shopping\\s*cart/i",
    'button:has-text("Proceed To Checkout")',
    'button:has-text("Continue Shopping")',
    'input[placeholder*="coupon" i]',
  ];
  if (await hasVisibleIndicator(cartIndicators)) return "cart";

  // 2. Shipping address step (must be before payment)
  const shippingAddressIndicators = [
    "text=/shipping address/i",
    "text=/select delivery address/i",
    "text=/payment method/i",
    'button:has-text("Save Address")',
  ];
  if (await hasVisibleIndicator(shippingAddressIndicators))
    return "shipping_address";

  // 3. Thank-you order page (must run before generic success)
  const thankYouIndicators = [
    "text=/thank you for your order!/i",
    "text=/your order has been successfully placed/i",
    'a:has-text("My Orders")',
  ];
  if (await hasVisibleIndicator(thankYouIndicators)) return "thank_you";

  const successIndicators = [
    ':has-text("Booking Confirmed")',
    ':has-text("booking confirmed")',
    ':has-text("Appointment Confirmed")',
    ':has-text("appointment confirmed")',
    ':has-text("Thank you for booking")',
    ':has-text("You can safely close")',
    ':has-text("Successfully booked")',
    '[class*="BookingAppointmentSuccess"]',
    '[class*="booking-appointment-success"]',
  ];
  if (await hasVisibleIndicator(successIndicators)) return "success";

  // Gender-specific ineligibility popup/page — should gracefully end flow.
  const genderNotSupportedIndicators = [
    "text=/this condition is not your gender specific/i",
    "text=/you can close this window/i",
    "text=/service unavailable/i",
    "text=/private option isn.?t available currently/i",
    "text=/you can safely close this page or return home/i",
    'button:has-text("Back to Home")',
    'a:has-text("Back to Home")',
  ];
  if (await hasVisibleIndicator(genderNotSupportedIndicators))
    return "gender_not_supported";

  // Dead-end states: condition routed to self-care / referral / ineligible.
  const deadEndIndicators = [
    ':has-text("You\'ve reached Self care")',
    ':has-text("You\'ve reached self care")',
    ':has-text("Reached Self Care")',
    'a:has-text("End Assessment")',
    'button:has-text("End Assessment")',
    ':has-text("Refer to your GP")',
    ':has-text("Refer to a GP")',
    ':has-text("Speak to your GP")',
    ':has-text("Go to A&E")',
    ':has-text("Call 999")',
    ':has-text("Call 111")',
    ':has-text("See a pharmacist")',
    ':has-text("Not suitable for online consultation")',
    ':has-text("This service is not available")',
    ':has-text("Unfortunately we cannot")',
    ':has-text("not eligible for this service")',
    ':has-text("You are not eligible")',
  ];
  if (await hasVisibleIndicator(deadEndIndicators)) return "dead_end";

  const bookingIndicators = [
    ".appointment-type-radio-group",
    ".rota-slot",
    'button:has-text("Book Now")',
    'button:has-text("Continue to Payment")',
    'button:has-text("Continue to payment")',
    'button:has-text("Continue To Payment")',
    'button:has-text("Continue to Payement")',
    ':text("Appointment type")',
    ':text("Schedule your appointment")',
    ':text("Select appointment session type")',
  ];
  if (await hasVisibleIndicator(bookingIndicators))
    return "appointment_booking";

  // Drug selection step (lifestyle medication flow)
  const drugSelectionIndicators = [
    "text=/what.?s your preference\\?/i",
    ".drug-selection-section",
    ".product-box-ui",
    'button:has-text("Choose this Option")',
  ];
  if (await hasVisibleIndicator(drugSelectionIndicators))
    return "drug_selection";

  // Product checkout signup (strict — heading + checkout context)
  const productSignupHeadingVisible = await hasVisibleIndicator([
    "text=/enter your personal details/i",
    "text=/enter your contact details/i",
  ]);
  const productSignupContextVisible = await hasVisibleIndicator([
    "text=/order summary/i",
    ".summary-box",
    ".checkout-product-box",
    "form[name='signup-form']",
  ]);
  if (
    productSignupHeadingVisible &&
    (productSignupContextVisible || /checkout/i.test(currentUrl))
  ) {
    return "product_signup";
  }

  const paymentIndicators = [
    ':text("Complete your payment")',
    ':text("Enter your card details here")',
    ':text("Select a saved card")',
    'input[autocomplete="cc-name"]',
    'input[autocomplete="cc-number"]',
    'input[autocomplete="cc-exp"]',
    'input[autocomplete="cc-csc"]',
    ':text("3dsecure.io")',
    ':text("Pass challenge")',
    ':text("Token fee")',
    'button:has-text("Pay £")',
    'button:has-text("Pay")',
  ];
  if (await hasVisibleIndicator(paymentIndicators)) return "payment";

  if (
    /payment|checkout|card|3dsecure|challenge/i.test(currentUrl) &&
    !(await hasVisibleIndicator(successIndicators)) &&
    !(await hasVisibleIndicator(shippingAddressIndicators))
  ) {
    return "payment";
  }

  // Continue-as-guest step (must be before signup detection)
  const guestContinueIndicators = [
    'button:has-text("Continue as Guest")',
    'button:has-text("Continue as guest")',
    'a:has-text("Continue as Guest")',
    'a:has-text("Continue as guest")',
    "text=/continue\\s+as\\s+guest/i",
  ];
  if (await hasVisibleIndicator(guestContinueIndicators))
    return "guest_continue";

  const signupIndicators = [
    'input[name="first_name"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="phone number" i]',
    'input[placeholder*="Enter your email address" i]',
    'input[placeholder*="Enter password" i]',
    ':text("Enter your contact details")',
    ':text("Patient details")',
    ':text("Personal details")',
    ':text("Contact details")',
    ':text("Enter your details")',
    'button:has-text("Sign Up")',
  ];
  if (await hasVisibleIndicator(signupIndicators)) return "sign_up";

  const questionnaireIndicators = [
    ':text("Questionnaires")',
    ':text("Important Notice")',
    ':text("Do you have these symptoms?")',
    ':text("I do not have these symptoms")',
    ':text("I do have these symptoms")',
    ".ant-radio-wrapper",
    ".ant-radio-button-wrapper",
    'button:has-text("Save")',
    'button:has-text("Next")',
    '[class*="question"]',
    '[class*="questionnaire"]',
    "input[type=radio]",
    "input[type=checkbox]",
    "textarea",
    ".ant-picker",
  ];
  if (await hasVisibleIndicator(questionnaireIndicators))
    return "questionnaire_submit";

  return "unknown";
}

async function handleTerminalBackToHomePopup(page: Page): Promise<boolean> {
  const popupSignals = [
    "text=/this condition is not your gender specific/i",
    "text=/service unavailable/i",
    "text=/private option isn.?t available currently/i",
    "text=/you can safely close this page or return home/i",
    "text=/you can close this window/i",
    ".ant-modal-content",
    ".ant-modal-header-expand h4",
  ];

  let hasSignal = false;
  for (const sig of popupSignals) {
    const visible = await page
      .locator(sig)
      .first()
      .isVisible({ timeout: 300 })
      .catch(() => false);
    if (visible) {
      hasSignal = true;
      break;
    }
  }
  if (!hasSignal) return false;

  const modalBackBtn = page
    .locator(
      '.ant-modal-content button:has-text("Back to Home"), .ant-modal-content [role="button"]:has-text("Back to Home")',
    )
    .first();
  const globalBackBtn = page
    .locator(
      'button:has-text("Back to Home"), a:has-text("Back to Home"), [role="button"]:has-text("Back to Home"), text=/back to home/i',
    )
    .first();

  const modalVisible = await modalBackBtn
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  const backBtn = modalVisible ? modalBackBtn : globalBackBtn;
  const visible = await backBtn.isVisible({ timeout: 1500 }).catch(() => false);
  if (!visible) return false;

  await backBtn.click({ timeout: 3000 }).catch(async () => {
    await backBtn.click({ force: true, timeout: 3000 }).catch(() => {});
  });
  await page.waitForTimeout(300);
  return true;
}

async function handleDeadEndTerminalActions(page: Page): Promise<boolean> {
  const endAssessmentBtn = page
    .locator(
      [
        "button.end-assessment-button",
        'button:has-text("End Assessment")',
        'a:has-text("End Assessment")',
        'button:has-text("End Assesment")',
        'a:has-text("End Assesment")',
        "text=/end asses?sment/i",
      ].join(", "),
    )
    .first();
  const endVisible = await endAssessmentBtn
    .isVisible({ timeout: 1200 })
    .catch(() => false);
  if (endVisible) {
    await endAssessmentBtn.click({ timeout: 3000 }).catch(async () => {
      await endAssessmentBtn.click({ force: true, timeout: 3000 }).catch(
        () => {},
      );
    });
    await page.waitForTimeout(300);
    return true;
  }

  return handleTerminalBackToHomePopup(page);
}

async function clickBookPrivateConsultationIfVisible(
  page: Page,
): Promise<boolean> {
  const cta = page
    .locator(
      [
        ".reached-modal button.book-private-consultation-button",
        ".ant-modal-healthya button.book-private-consultation-button",
        'button:has-text("Book Private Consultation")',
        'button:has-text("Book Private Consulation")',
        'button:has-text("Book Private Counsultation")',
      ].join(", "),
    )
    .first();

  const visible = await cta.isVisible({ timeout: 800 }).catch(() => false);
  if (!visible) return false;

  await cta.scrollIntoViewIfNeeded().catch(() => {});
  await cta.click({ timeout: 3000 }).catch(async () => {
    await cta.click({ force: true, timeout: 3000 }).catch(async () => {
      await cta.evaluate((el: HTMLElement) => el.click()).catch(() => {});
    });
  });
  await page.waitForTimeout(1000);
  return true;
}

async function gotoStartUrlWithRetry(page: Page, startUrl: string): Promise<void> {
  const attempts: Array<{
    waitUntil: "domcontentloaded" | "commit";
    timeout: number;
    label: string;
  }> = [
    { waitUntil: "domcontentloaded", timeout: 30_000, label: "domcontentloaded/30s" },
    { waitUntil: "domcontentloaded", timeout: 45_000, label: "domcontentloaded/45s" },
    { waitUntil: "commit", timeout: 20_000, label: "commit/20s" },
  ];

  let lastErr: unknown = null;
  for (const a of attempts) {
    try {
      console.log(`↻ START_URL goto attempt (${a.label})`);
      await page.goto(startUrl, { waitUntil: a.waitUntil, timeout: a.timeout });
      return;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`⚠ START_URL goto attempt failed (${a.label}): ${msg}`);
    }
  }

  // Sometimes navigation timeout happens while browser already moved to the target.
  const current = page.url();
  if (current && /patient_flow/i.test(current)) {
    console.log(
      `⚠ START_URL navigation timed out but current URL is patient_flow (${current}) — continuing`,
    );
    return;
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error("START_URL navigation failed after retries");
}

export async function runConditionFlow(
  page: Page,
  config: FlowConfig,
  user: typeof TEST_USER,
  projectBaseURL?: string,
): Promise<void> {
  setupApiDebugLogging(page);

  const conditionsPage = new ConditionsPage(page);
  const detailPage = new ConditionDetailPage(page);
  const guestContinuePage = new GuestContinuePage(page);
  const questionnaire = new QuestionnairePage(page);
  const signup = new SignupPage(page);
  const productSignup = new ProductSignupPage(page);
  const drugSelection = new DrugSelectionPage(page);
  const cart = new CartPage(page);
  const shippingAddress = new ShippingAddressPage(page);
  const thankYou = new ThankYouPage(page);
  const booking = new BookingPage(page);
  const payment = new PaymentPage(page);
  const landingPage = new LandingPage(page);

  const baseUrl = (projectBaseURL ?? process.env.BASE_URL ?? "http://localhost:4005").replace(/\/$/, "");

  const previousRulesOverride = process.env.OVERRIDE_ACTIVE_CONDITION;
  if (config.questionnaireRulesKey) {
    process.env.OVERRIDE_ACTIVE_CONDITION = config.questionnaireRulesKey;
    console.log(
      `↳ Questionnaire rules override: "${config.questionnaireRulesKey}"`,
    );
  }

  try {
    await runConditionFlowImpl(
      page,
      config,
      user,
      baseUrl,
      conditionsPage,
      detailPage,
      guestContinuePage,
      questionnaire,
      signup,
      productSignup,
      drugSelection,
      cart,
      shippingAddress,
      thankYou,
      booking,
      payment,
      landingPage,
    );
  } finally {
    if (config.questionnaireRulesKey) {
      if (previousRulesOverride === undefined) {
        delete process.env.OVERRIDE_ACTIVE_CONDITION;
      } else {
        process.env.OVERRIDE_ACTIVE_CONDITION = previousRulesOverride;
      }
    }
  }
}

async function runConditionFlowImpl(
  page: Page,
  config: FlowConfig,
  user: typeof TEST_USER,
  baseUrl: string,
  conditionsPage: ConditionsPage,
  detailPage: ConditionDetailPage,
  guestContinuePage: GuestContinuePage,
  questionnaire: QuestionnairePage,
  signup: SignupPage,
  productSignup: ProductSignupPage,
  drugSelection: DrugSelectionPage,
  cart: CartPage,
  shippingAddress: ShippingAddressPage,
  thankYou: ThankYouPage,
  booking: BookingPage,
  payment: PaymentPage,
  landingPage: LandingPage,
): Promise<void> {
  const isLifestyle = config.conditionJourneyType === "lifestyle";
  const startUrl = process.env.START_URL?.trim();
  let runtimeRulesOverrideApplied = false;

  if (startUrl) {
    console.log(`✔ Direct patient flow start URL: ${startUrl}`);
    await gotoStartUrlWithRetry(page, startUrl);
    await checkLinkExpired(page);
    const landingDetected = await landingPage.isVisible();
    if (landingDetected) {
      const journey = await landingPage.detectJourneyFlow();
      if (journey) {
        console.log(`✔ Landing page detected with journey: ${journey} — clicking Get Started`);
        await landingPage.clickGetStartedIfVisible();
      } else {
        console.log("⚠ Landing page detected but no journey data found; skipping Get Started click per requirements.");
      }
    } else {
      await landingPage.clickGetStartedIfVisible();
    }
    await guestContinuePage.continueAsGuestIfVisible();
    await page.waitForTimeout(1200);

    if (!config.questionnaireRulesKey) {
      const pageText = await page.locator("body").innerText().catch(() => "");
      const detectedRulesKey = detectQuestionnaireRulesKeyFromText(pageText);
      if (detectedRulesKey) {
        process.env.OVERRIDE_ACTIVE_CONDITION = detectedRulesKey;
        runtimeRulesOverrideApplied = true;
        console.log(
          `↳ Auto-detected condition rules from page: "${detectedRulesKey}"`,
        );
      } else {
        console.log(
          "↳ Could not auto-detect condition rules from page text; using generic questionnaire strategy",
        );
      }
    }
  }

  // ── Step 1: Resolve condition href ────────────────────────────────────────
  let conditionHref: string;
  let pharmacySlug: string;

  const conditionDetailPath = process.env.CONDITION_DETAIL_PATH;

  if (startUrl) {
    conditionHref = "";
    pharmacySlug = "";
  } else if (conditionDetailPath) {
    conditionHref = conditionDetailPath;
    pharmacySlug = conditionsPage.extractPharmacySlug(conditionDetailPath);
    console.log(`✔ Direct condition path: ${conditionDetailPath}`);
  } else if (config.conditionHref) {
    conditionHref = config.conditionHref;
    pharmacySlug = conditionsPage.extractPharmacySlug(conditionHref);
    console.log(
      `✔ Using pre-resolved href (${config.conditionName}): ${conditionHref}`,
    );
  } else {
    if (isLifestyle) {
      // Lifestyle treatments live on /lifestyle-treatments but cards link
      // to /conditions/{slug}#productSection (NOT /lifestyle-treatments/{slug}).
      await page.goto(`${baseUrl}/lifestyle-treatments`);
      await page
        .locator(
          'button:has-text("Accept All"), button:has-text("Accept Cookies")',
        )
        .first()
        .click()
        .catch(() => {});
      await page
        .locator('a[href*="/conditions/"][href*="#productSection"]')
        .first()
        .waitFor({ state: "visible", timeout: 20_000 });

      const links = page.locator(
        'a[href*="/conditions/"][href*="#productSection"]',
      );
      const count = await links.count();
      let found: string | null = null;
      const target = config.conditionName.toLowerCase();
      for (let i = 0; i < count; i++) {
        const href = await links.nth(i).getAttribute("href");
        const text =
          (await links.nth(i).innerText().catch(() => "")) || "";
        if (!href) continue;
        if (
          href.toLowerCase().includes(target) ||
          text.toLowerCase().includes(target)
        ) {
          found = href;
          break;
        }
      }
      if (!found) {
        throw new Error(
          `Lifestyle condition "${config.conditionName}" not found on /lifestyle-treatments`,
        );
      }
      conditionHref = found;
      pharmacySlug = conditionsPage.extractPharmacySlug(conditionHref);
      console.log(
        `✔ Selected lifestyle condition (${config.conditionName}): ${conditionHref}`,
      );
    } else {
      await conditionsPage.goto();
      await conditionsPage.waitForConditions();
      conditionHref = await conditionsPage.getConditionHrefByName(
        config.conditionName,
      );
      pharmacySlug = conditionsPage.extractPharmacySlug(conditionHref);
      console.log(
        `✔ Selected ${config.conditionJourneyType} condition (${config.conditionName}): ${conditionHref}`,
      );
    }
  }

  // ── Step 2: Set cookie + navigate to detail page ──────────────────────────
  const cookieOrigin = page.url().startsWith("http")
    ? new URL(page.url()).origin
    : baseUrl;

  if (!startUrl && pharmacySlug) {
    await page.context().addCookies([
      { name: "selected-corporate-id", value: pharmacySlug, url: cookieOrigin },
    ]);
  }

  if (!startUrl) {
    const detailUrl = conditionHref.startsWith("http")
      ? conditionHref
      : `${baseUrl}${conditionHref}`;
    await page.goto(detailUrl);
    await detailPage.waitForDetailPage();

    // ── Step 3: Eligibility form ──────────────────────────────────────────────
    await detailPage.fillEligibilityForm({
      gender: user.gender,
      day: user.dob.day,
      month: user.dob.month,
      year: user.dob.year,
    });

    // ── Step 4: Start Assessment ──────────────────────────────────────────────
    await detailPage.clickStartAssessment();
    await guestContinuePage.continueAsGuestIfVisible();
    await page
      .waitForURL("**/questionnaire**", { timeout: 15_000 })
      .catch(() => {});
    await page.waitForLoadState("domcontentloaded");
  }

  console.log(`✔ Post-assessment URL: ${page.url()}`);

  // ── Steps 5–N: Dynamic journey loop ──────────────────────────────────────
  const MAX_ITERATIONS = 40;
  const stepVisits: Record<string, number> = {};
  const MAX_STEP_VISITS = 6;
  let flowCompleted = false;
  let endedByAssessment = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (flowCompleted) break;
    await page.waitForTimeout(1500);

    if (await handleTerminalBackToHomePopup(page)) {
      console.log(
        '✔ Terminal popup detected — clicked "Back to Home" and ending flow',
      );
      flowCompleted = true;
      break;
    }

    let step = await detectCurrentStep(page);
    console.log(
      `🔍 [${config.name}] Iteration ${i + 1}: detected step = "${step}"`,
    );

    if (step === "success") {
      console.log("✔ Booking success state reached!");
      break;
    }

    if (step === "dead_end") {
      if (await clickBookPrivateConsultationIfVisible(page)) {
        console.log(
          '✔ Dead-end detected but Book Private Consultation clicked — continuing flow',
        );
        continue;
      }
      const handledTerminal = await handleDeadEndTerminalActions(page);
      console.log(
        handledTerminal
          ? "✔ Dead-end terminal state handled (End Assessment/Back to Home) — ending flow gracefully"
          : "✔ Dead-end terminal state reached — ending flow gracefully",
      );
      flowCompleted = true;
      break;
    }

    if (step === "gender_not_supported") {
      console.log(
        '✔ Gender-specific ineligibility popup detected — clicking "Back to Home" and ending flow',
      );
      const backBtn = page
        .locator('button:has-text("Back to Home"), a:has-text("Back to Home")')
        .first();
      const visible = await backBtn.isVisible().catch(() => false);
      if (visible) {
        await backBtn.click().catch(() => {});
      }
      flowCompleted = true;
      break;
    }

    if (step === "unknown") {
      await page.waitForTimeout(500);
      step = await detectCurrentStep(page);
      if (step === "unknown") await page.waitForTimeout(1200);
      step = await detectCurrentStep(page);

      if (step === "unknown" && (await handleTerminalBackToHomePopup(page))) {
        console.log(
          '✔ Terminal popup detected during unknown-step retry — clicked "Back to Home" and ending flow',
        );
        flowCompleted = true;
        break;
      }

      if (
        step === "unknown" &&
        /payment|checkout|card|3dsecure|challenge/i.test(page.url())
      ) {
        step = "payment";
        console.log('↻ URL fallback forced step = "payment"');
      }

      if (step === "unknown") {
        console.log(`⚠ Unknown step at URL: ${page.url()} — stopping loop`);
        break;
      }
    }

    stepVisits[step] = (stepVisits[step] ?? 0) + 1;
    if (stepVisits[step] > MAX_STEP_VISITS) {
      console.log(
        `⚠ Stuck: step "${step}" visited ${stepVisits[step]} times — stopping`,
      );
      break;
    }

    switch (step) {
      case "landing": {
        console.log("→ Handling landing step (Get Started)");
        const journey = await landingPage.detectJourneyFlow();
        if (journey) {
          console.log(`✔ Detected journey: ${journey} — clicking Get Started`);
          const clicked = await landingPage.clickGetStartedIfVisible();
          if (!clicked) {
            console.log("⚠ Landing detected but Get Started not clickable yet");
          }
        } else {
          console.log("⚠ Landing detected but no journey data found; skipping click per requirements.");
        }
        await page.waitForTimeout(1200);
        break;
      }

      case "guest_continue": {
        console.log("→ Handling continue-as-guest step");
        await guestContinuePage.continueAsGuestIfVisible();
        await page.waitForTimeout(800);
        break;
      }

      case "product_signup": {
        console.log("→ Handling product signup step");
        await productSignup.completeProductSignupFlow({
          firstName: user.firstName,
          lastName: user.lastName,
          postcode: user.postcode,
          gender: user.gender,
          dobIso: user.dob.iso,
          phone: user.phone,
          email: user.email,
          password: user.password,
          confirmPassword: user.confirmPassword,
          confirmPhone: user.confirmPhone,
          confirmEmail: user.confirmEmail,
          country: user.country,
        });
        break;
      }

      case "questionnaire_submit": {
        console.log("→ Handling questionnaire step");
        if (!config.questionnaireRulesKey && !runtimeRulesOverrideApplied) {
          const pageText = await page.locator("body").innerText().catch(() => "");
          const detectedRulesKey = detectQuestionnaireRulesKeyFromText(pageText);
          if (detectedRulesKey) {
            process.env.OVERRIDE_ACTIVE_CONDITION = detectedRulesKey;
            runtimeRulesOverrideApplied = true;
            console.log(
              `↳ Auto-detected condition rules at questionnaire: "${detectedRulesKey}"`,
            );
          }
        }
        try {
          console.log("→ [run-flow] questionnaire.waitForPage() start");
          await questionnaire.waitForPage();
          console.log("→ [run-flow] questionnaire.waitForPage() done");
          console.log("→ [run-flow] questionnaire.answerAllQuestions() start");
          await questionnaire.answerAllQuestions();
          console.log("→ [run-flow] questionnaire.answerAllQuestions() done");
          if (questionnaire.wasEndAssessmentClicked()) {
            console.log(
              "✔ End Assessment clicked from NHS111 popup — stopping test flow as requested",
            );
            endedByAssessment = true;
            flowCompleted = true;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(`✗ [run-flow] questionnaire step failed: ${message}`);
          throw err;
        }
        break;
      }

      case "sign_up": {
        console.log("→ Handling sign-up step");

        // Lifestyle / dynamic checkout signup branch
        if (isLifestyle) {
          const handledDynamicCheckoutSignup =
            await signup.completeDynamicCheckoutSignupIfVisible({
              firstName: user.firstName,
              lastName: user.lastName,
              postcode: user.postcode,
              gender: user.gender,
              dobIso: user.dob.iso,
              phone: user.phone,
              email: user.email,
              password: user.password,
              confirmPassword: user.confirmPassword,
              confirmPhone: user.confirmPhone,
              confirmEmail: user.confirmEmail,
              country: user.country,
            });
          if (handledDynamicCheckoutSignup) break;
        }

        const hasNHSForm = await page
          .locator('input[name="first_name"]')
          .isVisible()
          .catch(() => false);

        if (hasNHSForm) {
          await signup.waitForPage();
          await signup.fillNHSPDSForm({
            firstName: user.firstName,
            lastName: user.lastName,
            postcode: user.postcode,
            gender: user.gender,
            dobIso: user.dob.iso,
          });
          if (
            config.conditionJourneyType === "private" ||
            config.conditionJourneyType === "lifestyle"
          ) {
            await signup.submitPrivatePatientInfoForm();
          } else {
            await signup.submitNHSForm();
          }
          await signup.handlePDSResult(
            Boolean(
              (user as { triggerContactRecovery?: boolean })
                .triggerContactRecovery,
            ),
          );
          break;
        }

        const hasEmail = await page
          .locator('input[name="email"], input[type="email"]')
          .first()
          .isVisible()
          .catch(() => false);

        if (hasEmail) {
          const useRecoveryValues = Boolean(
            (user as {
              triggerContactRecovery?: boolean;
              newEmail?: string;
              confirmNewEmail?: string;
              newPhone?: string;
              confirmNewPhone?: string;
            }).triggerContactRecovery,
          );
          const resolvedEmail = useRecoveryValues
            ? (user as { newEmail?: string }).newEmail || user.email
            : user.email;
          const resolvedConfirmEmail = useRecoveryValues
            ? (user as { confirmNewEmail?: string; newEmail?: string })
                .confirmNewEmail ||
              (user as { newEmail?: string }).newEmail ||
              user.confirmEmail
            : user.confirmEmail;
          const resolvedPhone = useRecoveryValues
            ? (user as { newPhone?: string }).newPhone || user.phone
            : user.phone;
          const resolvedConfirmPhone = useRecoveryValues
            ? (user as { confirmNewPhone?: string; newPhone?: string })
                .confirmNewPhone ||
              (user as { newPhone?: string }).newPhone ||
              user.confirmPhone
            : user.confirmPhone;

          await signup.fillContactDetails(
            resolvedEmail,
            resolvedPhone,
            resolvedConfirmEmail,
            resolvedConfirmPhone,
            {
              preferRecoveryModal: useRecoveryValues,
              country: (user as { country?: string }).country,
            },
          );
          await signup.submitAndBook(
            Boolean(
              (user as { triggerContactRecovery?: boolean })
                .triggerContactRecovery,
            ),
          );
          await page.waitForTimeout(3_000);
        }
        break;
      }

      case "appointment_booking": {
        console.log("→ Handling booking step");
        await booking.completeBooking(config.booking);
        break;
      }

      case "drug_selection": {
        console.log("→ Handling drug selection step");
        await drugSelection.waitForPage();
        await drugSelection.chooseDrugOption(DRUG_SELECTION_PREFERENCES);
        break;
      }

      case "cart": {
        console.log("→ Handling cart step");
        await cart.waitForPage();
        await cart.handleCart(CART_PREFERENCES);

        if (await shippingAddress.isVisible()) {
          console.log("→ Shipping address appeared right after cart");
          await shippingAddress.handleShippingAddress(
            SHIPPING_ADDRESS_PREFERENCES,
          );
        }
        break;
      }

      case "shipping_address": {
        console.log("→ Handling shipping address step");
        await shippingAddress.handleShippingAddress(
          SHIPPING_ADDRESS_PREFERENCES,
        );
        break;
      }

      case "thank_you": {
        console.log(
          "✔ Thank-you page detected! Journey completed successfully.",
        );
        await thankYou.handleThankYou(THANK_YOU_PREFERENCES);
        flowCompleted = true;
        break;
      }

      case "payment": {
        console.log("→ Handling payment step");
        await payment.completePayment(user.payment, config.paymentMethod);
        if (payment.isBookingFlowCompleted()) {
          console.log("✔ Payment completed — ending test flow");
          flowCompleted = true;
        }
        break;
      }
    }
  }

  // ── Final assertion ───────────────────────────────────────────────────────
  if (endedByAssessment) {
    console.log(
      "✔ Final assertion skipped: flow intentionally ended via End Assessment",
    );
    return;
  }

  const confirmed = await signup.isBookingConfirmed();
  console.log(`✔ Booking confirmed check: ${confirmed}`);
  expect(page.url()).not.toContain("/conditions");
}
