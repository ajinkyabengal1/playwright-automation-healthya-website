# Healthya Special Automation

This is a dedicated project for **Healthya pharmacy automation** with two primary workflows:

1. **API Link Journey Flow**
- Paste API link (e.g. `https://dev-api.healthya.co.uk/...`)
- Resolve and open `patient_flow` UI
- Click **Get Started**
- Continue end-to-end journey automation

2. **Yopmail Assessment Flow**
- Open Yopmail inbox
- Open latest assessment email
- Click **Start Assessment**
- Copy passcode from email
- Load UI and auto-fill DOB + passcode
- Continue journey automation

## Setup

```bash
cd healthya-special-automation
npm install
```

Create `.env` (optional):

```bash
BASE_URL=https://dev.healthya.co.uk/
YOPMAIL_INBOX=lloyd.p2
```

## Run

```bash
npm run dashboard
```

Or run tests directly:

```bash
npm run test:api-link
npm run test:yopmail
```

## Notes

- API-link dashboard run uses direct `patient_flow` start (no `/conditions` bootstrap).
- Yopmail flow expects an assessment email with **Start Assessment** and **Passcode**.
