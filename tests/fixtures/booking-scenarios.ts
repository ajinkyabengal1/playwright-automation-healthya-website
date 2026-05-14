import type { FlowConfig } from "./flow-configs";

/**
 * Booking-step focused scenarios. Each scenario picks a random Sanity condition,
 * runs the full journey through to the booking step, and exercises one
 * specific booking-page variation.
 *
 * Scenarios that hit a "not available on this condition" wall (e.g. appointment
 * type missing/disabled, or no instant-book slot) cause the spec to retry the
 * same scenario against the next random condition.
 */
export type BookingScenarioId =
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6";

export interface BookingScenarioDef {
  id: BookingScenarioId;
  /** Dashboard-friendly label */
  label: string;
  /** Booking section of FlowConfig + a few extra knobs honoured by BookingPage */
  booking: FlowConfig["booking"];
  /** Payment to use for any post-booking checkout step that may appear */
  paymentMethod: FlowConfig["paymentMethod"];
}

const COMMON = {
  autoMoveToNextDate: true,
  maxDateAttempts: 10,
};

export const BOOKING_SCENARIOS: BookingScenarioDef[] = [
  {
    id: "B1",
    label: "appointment type Video",
    booking: {
      ...COMMON,
      appointmentType: "Video",
      useNextAvailableSlot: true,
      strictAppointmentType: true,
    },
    paymentMethod: "auto",
  },
  {
    id: "B2",
    label: "appointment type Phone call",
    booking: {
      ...COMMON,
      appointmentType: "Phone call",
      useNextAvailableSlot: true,
      strictAppointmentType: true,
    },
    paymentMethod: "auto",
  },
  {
    id: "B3",
    label: "appointment type Face to Face",
    booking: {
      ...COMMON,
      appointmentType: "Face to Face",
      useNextAvailableSlot: true,
      strictAppointmentType: true,
    },
    paymentMethod: "auto",
  },
  {
    id: "B4",
    label: "next available slot = true",
    booking: {
      ...COMMON,
      appointmentType: "Video",
      useNextAvailableSlot: true,
    },
    paymentMethod: "auto",
  },
  {
    id: "B5",
    label: "next available slot = false → first available date + slot",
    booking: {
      ...COMMON,
      appointmentType: "Video",
      useNextAvailableSlot: false,
      dateSelectionStrategy: "first",
    },
    paymentMethod: "auto",
  },
  {
    id: "B6",
    label: "next available slot = false → random month / week / slot",
    booking: {
      ...COMMON,
      appointmentType: "Video",
      useNextAvailableSlot: false,
      dateSelectionStrategy: "random",
    },
    paymentMethod: "auto",
  },
];
