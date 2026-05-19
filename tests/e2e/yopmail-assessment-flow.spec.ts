import { test } from "@playwright/test";
import { TEST_USER, BOOKING_PREFERENCES } from "../fixtures/test-data";
import { runConditionFlow } from "../helpers/run-flow";
import type { FlowConfig } from "../fixtures/flow-configs";
import {
  fillDobAndPasscodeIfVisible,
  openAssessmentFromYopmail,
} from "../helpers/yopmail-assessment";

const flowConfig: FlowConfig = {
  name: "Yopmail Assessment Journey",
  conditionJourneyType: "private",
  conditionName: "yopmail-assessment",
  booking: {
    appointmentType: BOOKING_PREFERENCES.appointmentType,
    useNextAvailableSlot: true,
    autoMoveToNextDate: true,
    maxDateAttempts: 10,
  },
  paymentMethod: "auto",
};

test.describe("Yopmail Assessment Flow", () => {
  test("open email, click Start Assessment, auto-fill DOB+passcode, continue journey", async ({
    page,
    baseURL,
  }) => {
    const inbox = process.env.YOPMAIL_INBOX || TEST_USER.email.split("@")[0];

    const { assessmentUrl, passcode } = await openAssessmentFromYopmail(page, inbox);

    // Use the newly opened assessment URL as direct run start.
    const prev = process.env.START_URL;
    process.env.START_URL = assessmentUrl;

    await page.goto(assessmentUrl, { waitUntil: "domcontentloaded" });
    await fillDobAndPasscodeIfVisible(page, {
      day: TEST_USER.dob.day,
      month: TEST_USER.dob.month,
      year: TEST_USER.dob.year,
      passcode,
    });

    try {
      await runConditionFlow(page, flowConfig, TEST_USER, baseURL);
    } finally {
      if (prev === undefined) delete process.env.START_URL;
      else process.env.START_URL = prev;
    }
  });
});
