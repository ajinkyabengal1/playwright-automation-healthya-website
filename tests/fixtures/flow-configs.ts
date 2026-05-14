export type PaymentMethod = "new-card" | "saved-card" | "auto";

export interface FlowConfig {
  name: string;
  conditionJourneyType: "nhs" | "private" | "lifestyle";
  conditionName: string;
  /** When set, bypasses the /conditions page lookup and navigates directly to this href. */
  conditionHref?: string;
  /**
   * Overrides which questionnaire rule set the QuestionnairePage applies for
   * this test. Must match a key understood by QuestionnairePage.answerByConditionRules
   * (e.g. "shingles", "weight management", "erectile-dysfunction").
   * Set as `OVERRIDE_ACTIVE_CONDITION` env var for the duration of this run.
   */
  questionnaireRulesKey?: string;
  booking: {
    appointmentType: "Video" | "Face to Face" | "Phone call";
    useNextAvailableSlot: boolean;
    preferredMonth?: string;
    preferredDate?: string;
    preferredTime?: string;
    autoMoveToNextDate: boolean;
    maxDateAttempts: number;
    /** When true, throw if the requested appointmentType is unavailable/disabled. */
    strictAppointmentType?: boolean;
    /** When useNextAvailableSlot=false, controls how the date+slot is picked. */
    dateSelectionStrategy?: "first" | "random";
  };
  paymentMethod: PaymentMethod;
}

export const FLOW_CONFIGS: FlowConfig[] = [
  {
    name: "NHS — next available slot",
    conditionJourneyType: "nhs",
    conditionName: "shingles",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: true,
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "auto",
  },
  {
    name: "NHS — specific date and time",
    conditionJourneyType: "nhs",
    conditionName: "shingles",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: false,
      preferredMonth: "May 2026",
      preferredDate: "9 May",
      preferredTime: "07:00 AM",
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "auto",
  },
  {
    name: "Private — next available slot, new card",
    conditionJourneyType: "private",
    conditionName: "weight management",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: true,
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "new-card",
  },
  {
    name: "Private — next available slot, saved card",
    conditionJourneyType: "private",
    conditionName: "weight management",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: true,
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "saved-card",
  },
  {
    name: "Private — specific date, new card",
    conditionJourneyType: "private",
    conditionName: "weight management",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: false,
      preferredMonth: "May 2026",
      preferredDate: "9 May",
      preferredTime: "07:00 AM",
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "new-card",
  },
  {
    name: "Private — specific date, saved card",
    conditionJourneyType: "private",
    conditionName: "weight management",
    booking: {
      appointmentType: "Video",
      useNextAvailableSlot: false,
      preferredMonth: "May 2026",
      preferredDate: "9 May",
      preferredTime: "07:00 AM",
      autoMoveToNextDate: true,
      maxDateAttempts: 10,
    },
    paymentMethod: "saved-card",
  },
];
