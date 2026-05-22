import { expect, test } from "@playwright/test";
import { BookingPage } from "../page-objects/BookingPage";
import { TEST_USER, BOOKING_PREFERENCES } from "../fixtures/test-data";
import { runConditionFlow } from "../helpers/run-flow";
import type { FlowConfig } from "../fixtures/flow-configs";

function envFlag(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (!v) return fallback;
  return v.trim().toLowerCase() === "true";
}

function buildTimeRange(
  startTime: string | undefined,
  durationMinutesRaw: string | undefined,
): string | undefined {
  const start = (startTime || "").trim();
  const duration = Number((durationMinutesRaw || "").trim());
  if (!start || !Number.isFinite(duration) || duration <= 0) return undefined;

  const m = start.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return undefined;

  const h12 = Number(m[1]);
  const mm = Number(m[2]);
  const ap = m[3].toUpperCase();
  if (h12 < 1 || h12 > 12 || mm < 0 || mm > 59) return undefined;

  let hours24 = h12 % 12;
  if (ap === "PM") hours24 += 12;

  const totalStart = hours24 * 60 + mm;
  const totalEnd = totalStart + duration;
  const endHours24 = Math.floor((totalEnd % (24 * 60)) / 60);
  const endMins = totalEnd % 60;
  const endAp = endHours24 >= 12 ? "PM" : "AM";
  const endH12 = endHours24 % 12 === 0 ? 12 : endHours24 % 12;
  const end = `${endH12}:${String(endMins).padStart(2, "0")} ${endAp}`;

  return `${start} - ${end}`;
}

test.describe("patientSignupNextAPI status=803 retry booking", () => {
  test("retries booking and completes appointment successfully", async ({
    page,
    baseURL,
  }) => {
    const startUrl = process.env.START_URL;
    test.skip(!startUrl, "START_URL not provided");

    const force803 = envFlag("TD_FORCE_SIGNUP_NEXT_803", false);
    let injected803Count = 0;
    let patientSignupNextSeenCount = 0;
    let saw803 = false;
    let saw200 = false;

    await page.route("**/*", async (route) => {
      const reqUrl = route.request().url().toLowerCase();
      const isSignupNextLike =
        reqUrl.includes("patientsignupnextapi") ||
        reqUrl.includes("patient-signup-next") ||
        reqUrl.includes("signupnext");
      if (!isSignupNextLike) {
        await route.continue();
        return;
      }

      try {
        patientSignupNextSeenCount += 1;
        const upstream = await route.fetch();
        const text = await upstream.text();
        let payload: unknown;

        try {
          payload = JSON.parse(text);
        } catch {
          await route.fulfill({ response: upstream });
          return;
        }

        const asRecord =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : null;

        if (!asRecord) {
          await route.fulfill({ response: upstream });
          return;
        }

        const detectedStatus = Number(
          asRecord.status ??
            ((asRecord.data as Record<string, unknown> | undefined)?.status ??
              upstream.status()),
        );
        if (detectedStatus === 803) saw803 = true;
        if (detectedStatus === 200) saw200 = true;

        if (force803 && injected803Count === 0) {
          asRecord.status = 803;
          if (
            asRecord.data &&
            typeof asRecord.data === "object" &&
            asRecord.data !== null
          ) {
            (asRecord.data as Record<string, unknown>).status = 803;
          }
          injected803Count += 1;
          saw803 = true;
        }

        await route.fulfill({
          response: upstream,
          headers: {
            ...upstream.headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify(asRecord),
        });
      } catch {
        await route.continue();
      }
    });

    const envAppointmentType = process.env.TD_BOOKING_APPOINTMENT_TYPE as
      | "Video"
      | "Face to Face"
      | "Phone call"
      | undefined;
    const envPreferredMonth = process.env.TD_BOOKING_PREFERRED_MONTH?.trim();
    const envPreferredDate = process.env.TD_BOOKING_PREFERRED_DATE?.trim();
    const envPreferredTime = process.env.TD_BOOKING_PREFERRED_TIME?.trim();
    const envStartTime = process.env.TD_BOOKING_START_TIME?.trim();
    const envDurationMins = process.env.TD_BOOKING_DURATION_MIN?.trim();
    const derivedPreferredTime = buildTimeRange(envStartTime, envDurationMins);
    const resolvedPreferredTime =
      envPreferredTime ?? derivedPreferredTime ?? BOOKING_PREFERENCES.preferredTime;

    const hasManualSlotInputs = Boolean(
      envPreferredMonth ||
        envPreferredDate ||
        envPreferredTime ||
        derivedPreferredTime,
    );

    const useNextAvailable = envFlag(
      "TD_BOOKING_USE_NEXT_AVAILABLE",
      !hasManualSlotInputs,
    );

    const flowConfig: FlowConfig = {
      name: "Pasted Link Flow - patientSignupNextAPI 803 retry booking",
      conditionJourneyType: "private",
      conditionName: "pasted-link",
      booking: {
        appointmentType:
          envAppointmentType ?? BOOKING_PREFERENCES.appointmentType,
        useNextAvailableSlot: useNextAvailable,
        preferredMonth: envPreferredMonth || undefined,
        preferredDate: envPreferredDate || "23 May",
        preferredTime: resolvedPreferredTime,
        autoMoveToNextDate: true,
        maxDateAttempts: 10,
        dateSelectionStrategy: "first",
      },
      paymentMethod: "auto",
    };

    try {
      await runConditionFlow(page, flowConfig, TEST_USER, baseURL);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Time slot .* not available/i.test(msg)) {
        console.log(
          "[retry-booking] Preferred time unavailable — retrying booking with first available slot fallback",
        );
        const booking = new BookingPage(page);
        await booking.completeBooking({
          ...flowConfig.booking,
          preferredTime: undefined,
          useNextAvailableSlot: false,
          dateSelectionStrategy: "first",
        });
      } else {
        throw err;
      }
    }

    if (force803) {
      expect(patientSignupNextSeenCount).toBeGreaterThan(0);
      expect(injected803Count).toBe(1);
    }

    if (patientSignupNextSeenCount > 0 && saw803) {
      const continuedFlowIndicators = [
        ".appointment-type-radio-group",
        ".rota-slot",
        'button:has-text("Book Now")',
        ':has-text("Booking Confirmed")',
        ':has-text("booking confirmed")',
        ':has-text("Appointment Confirmed")',
        ':has-text("Successfully booked")',
      ];
      let continued = false;
      for (const sel of continuedFlowIndicators) {
        const visible = await page
          .locator(sel)
          .first()
          .isVisible({ timeout: 1000 })
          .catch(() => false);
        if (visible) {
          continued = true;
          break;
        }
      }
      expect(continued).toBeTruthy();
    } else if (patientSignupNextSeenCount > 0) {
      expect(saw200).toBeTruthy();
    }
  });
});
