import type { FlowConfig, PaymentMethod } from "./flow-configs";

/**
 * Payment-step focused scenarios. Each scenario:
 *   1. Picks a random Sanity condition
 *   2. Drives the journey end-to-end (booking with simple defaults)
 *   3. Exercises one specific payment variation on the payment page
 */
export type PaymentScenarioId = "P1" | "P2";

export interface PaymentScenarioDef {
  id: PaymentScenarioId;
  /** Dashboard-friendly label */
  label: string;
  paymentMethod: PaymentMethod;
  /** Booking is just a means to reach the payment step here */
  booking: FlowConfig["booking"];
}

const SIMPLE_BOOKING: FlowConfig["booking"] = {
  appointmentType: "Video",
  useNextAvailableSlot: true,
  autoMoveToNextDate: true,
  maxDateAttempts: 10,
};

export const PAYMENT_SCENARIOS: PaymentScenarioDef[] = [
  {
    id: "P1",
    label: "select existing saved card (fallback to new card if none)",
    paymentMethod: "saved-card",
    booking: SIMPLE_BOOKING,
  },
  {
    id: "P2",
    label: "create a new card and use it to confirm payment",
    paymentMethod: "new-card",
    booking: SIMPLE_BOOKING,
  },
];
