import { test } from "@playwright/test";
import { TEST_USER } from "../fixtures/test-data";
import { runConditionFlow } from "../helpers/run-flow";
import type { FlowConfig } from "../fixtures/flow-configs";

test.describe("Pasted Link Flow", () => {
  test("runs directly from START_URL and continues dynamic flow", async ({
    page,
    baseURL,
  }) => {
    const startUrl = process.env.START_URL;
    test.skip(!startUrl, "START_URL not provided");

    const flowConfig: FlowConfig = {
      name: "Pasted Link Direct Flow",
      // Branch behavior inside runConditionFlow depends on this type for some steps.
      // Private is the safest default for healthya patient_flow token links.
      conditionJourneyType: "private",
      conditionName: "pasted-link",
      booking: {
        appointmentType: "Video",
        useNextAvailableSlot: true,
        autoMoveToNextDate: true,
        maxDateAttempts: 10,
      },
      paymentMethod: "auto",
    };

    await runConditionFlow(page, flowConfig, TEST_USER, baseURL);
  });
});

