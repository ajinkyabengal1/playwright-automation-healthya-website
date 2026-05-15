# Healthya Special Automation

This project is a dedicated Playwright-based E2E automation suite for **Healthya pharmacy** workflows. It supports dynamic journey orchestration, an interactive dashboard, and specific flows for API-linked consultations and Yopmail-based assessments.

## Project Overview

- **Purpose:** Automate Healthya patient journeys (NHS, Private, Lifestyle) from various entry points.
- **Main Technologies:** [Playwright](https://playwright.dev/), TypeScript, Node.js, Express (for the dashboard).
- **Architecture:** 
    - **Page Object Model (POM):** Located in `tests/page-objects/`.
    - **Dynamic Orchestration:** `tests/helpers/run-flow.ts` uses a state-machine-like loop to detect the current step (Landing, Signup, Questionnaire, Booking, etc.) based on visual indicators and then invokes the appropriate POM methods.
    - **Interactive Dashboard:** `dashboard.js` provides a web UI to trigger tests, override test data, and analyze Healthya links.

## Building and Running

### Prerequisites
- Node.js (v18+)
- `pnpm` (preferred) or `npm`

### Setup
```bash
npm install
```

### Environment Variables (`.env`)
Create a `.env` file in the root directory:
```bash
BASE_URL=https://dev.healthya.co.uk/
YOPMAIL_INBOX=lloyd.p2
```

### Key Commands
- **Run Dashboard:** `npm run dashboard` (Starts the server at `http://localhost:7890`)
- **Run All Tests:** `npm run test`
- **API Link Flow:** `npm run test:api-link`
- **Yopmail Flow:** `npm run test:yopmail`
- **Playwright UI:** `npm run test:ui`

## Development Conventions

### Test Structure
- **E2E Specs:** `tests/e2e/*.spec.ts`
- **Page Objects:** `tests/page-objects/*.ts`
- **Fixtures & Data:** `tests/fixtures/` contains configurations for different booking scenarios, pharmacies, and default test data.

### Dynamic Flow Orchestration
The core logic resides in `tests/helpers/run-flow.ts`. Instead of static linear tests, it uses `detectCurrentStep(page)` to identify where the patient is in the journey and executes the corresponding logic. 

**Key Steps detected:**
- `landing`: Intro page with "Get Started".
- `guest_continue`: "Continue as Guest" prompt.
- `questionnaire_submit`: Questionnaire forms.
- `sign_up`: PDS or contact details forms.
- `appointment_booking`: Booking slots.
- `drug_selection`: Product/Drug choice.
- `cart`: Shopping cart and checkout.
- `shipping_address`: Address and payment method selection.
- `payment`: Credit card entry and 3DS.
- `thank_you`: Successful order confirmation.

### Adding New Features
1. **New Page:** Create a new POM in `tests/page-objects/`.
2. **Detection:** Add visual indicators for the new step in `detectCurrentStep` within `tests/helpers/run-flow.ts`.
3. **Action:** Update the `switch(step)` loop in `runConditionFlowImpl` to handle the new step using your new POM.

## Dashboard Features
- **Link Analysis:** Resolves short links and detects which step they lead to.
- **Test Data Overrides:** Allows temporary modification of user/payment data for a specific run without editing files.
- **Artifacts:** Displays videos, traces, and screenshots from previous runs.
