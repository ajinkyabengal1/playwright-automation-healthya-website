# Healthya Special Automation — User Guide

**Purpose:** Step-by-step instructions for running automated patient journey tests on the Healthya website using the Playwright Test Dashboard  
**Last updated:** June 2026

---

## What Is This App?

The **Healthya Special Automation Dashboard** is a web-based tool that automatically tests patient journeys on the Healthya pharmacy platform — from clicking "Get Started", through answering questionnaire questions, all the way to booking an appointment or completing a payment.

You do **not** need to write any code. Everything is done through a simple point-and-click interface in your web browser.

---

## Before You Start

### 1. Make sure the server is running

The dashboard runs locally on your computer. Before opening it, someone technical needs to have started the server by running the following command in their terminal:

```
npm run dashboard
```

You will know it is ready when the terminal shows:

```
Dashboard running at http://localhost:3000
```

If you see that, the app is ready to use.

### 2. Open the dashboard

Open any web browser (Chrome recommended) and go to:

```
http://localhost:3000
```

You should see a dark header bar with the 🎭 logo and the title **Playwright Runner**.

---

## The Dashboard at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  🎭 Playwright Runner  [Non-Logged] [Logged In]  [Paste QR/API link] │
│                        ⊕ Add  ↑ Upload  ▶ Run Link  ▶ Run All  ■ Stop  ☀️ │  ← Header
├──────────────────────────────────────────────────────────────────────┤
│  ● Loading tests for healthya…                                       │  ← Status bar
├──────────────────────┬───────────────────────────────────────────────┤
│                      │  🖥  Video player                             │
│  🔍 Search tests     │                                               │
│                      ├───────────────────────────────────────────────┤
│  Link Queue          │  Output │ API │ Artifacts │ Results │ ⚙ Test Data │
│  ──────────          │                                               │
│  Test list           │  (log output / video / settings appear here)  │
│  (left sidebar)      │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

| Area | What it does |
|---|---|
| **Header** | Switch flow mode, paste a patient link, upload a file of links, run tests, stop a run, toggle dark/light mode |
| **Status bar** | Shows what is happening right now — idle, running, and pass/fail/skip counts |
| **Left sidebar** | Search box, link queue, and the full list of available automated tests |
| **Video player** | Plays back a recording of the browser session from the last test that ran |
| **Output tab** | Shows the live step-by-step log as a test runs |
| **API tab** | Shows every network request the test made (mainly for developers) |
| **Artifacts tab** | Stores videos, traces, and screenshots after each run |
| **Results tab** | Browse and delete past test result files |
| **⚙ Test Data tab** | Where you configure the patient details, appointment preferences, payment card, and shipping settings |

---

## Understanding the Two Flow Modes

Before running anything, decide which **flow mode** to use. The two buttons at the top-left of the header control this:

| Button | When to use it |
|---|---|
| **Non-Logged** (default) | The patient is new or not signed in. The tool will go through sign-up, questionnaire, and booking as a guest or new user. |
| **Logged In** | The patient already has an account. You provide a Date of Birth and PIN. The tool will authenticate and continue the journey from where the patient left off. |

> **Which one should I use most of the time?**  
> Use **Non-Logged** unless you specifically need to test the logged-in experience. It covers the full end-to-end journey.

---

## Step-by-Step: Running Your First Test

### Step 1 — Choose How to Start the Journey

There are three ways to kick off a test run. Choose the one that matches what you are trying to do:

---

#### Option A — Paste a Single Patient Link

Use this when someone has shared a direct Healthya patient journey link (a QR code link or an API link starting with `https://...`).

1. Make sure **Non-Logged** is selected in the header (or **Logged In** if the patient already has an account)
2. Click into the **"Paste QR/API link"** input box in the header
3. Paste the link
4. *(Logged In only)* Fill in the **DOB** field (format: `DD-MM-YYYY`, e.g. `15-06-1990`) and the **PIN** field
5. Click **⊕ Add** to add it to the queue — you will see it appear in the Link Queue on the left sidebar
6. Click **▶ Run Link** to start

---

#### Option B — Upload Multiple Links from a File

Use this when you have many patient links to test at once (provided in an Excel or CSV file).

1. Click **↑ Upload** in the header
2. Select your `.xlsx` or `.csv` file — each row should contain one link
3. The links will appear in the **Link Queue** on the left sidebar
4. Click **▶ Run All Links** (inside the queue panel) to run them one after another

---

#### Option C — Run a Pre-Built Test from the List

Use this to run one of the standard automated tests (e.g. a specific condition like Shingles, Weight Management, or Erectile Dysfunction).

1. In the left sidebar, find the test you want to run
2. Use the **🔍 Search** box at the top of the sidebar to filter by name if the list is long
3. Hover over the test name and click the **▶** (play) button that appears
4. To run **all tests** in the list at once, click **▶ Run All** in the header

---

### Step 2 — Configure Test Data (First Time Only)

Before running tests, check that the patient details and preferences are set up correctly. Click the **⚙ Test Data** tab in the bottom panel.

You will see four collapsible sections — click any section header to expand it.

---

#### 👤 User Info

This is the fictional patient the tool uses to fill in forms. The fields marked **NHS** are required for NHS-type journeys.

| Field | Example value | Notes |
|---|---|---|
| First Name | John | Used in all sign-up forms |
| Last Name | Smith | Used in all sign-up forms |
| Email | lloyd.p2@yopmail.com | Does not need to be a real inbox |
| Phone | 447467059973 | UK format — no spaces or + sign |
| Country | United Kingdom | Select from the dropdown |
| Postcode | SW1A 1AA | Must be a valid UK postcode format |
| Gender | Male | Male or Female |
| Guardian Name | Tonny stark | Used only in specific flows |
| DOB Day | 01 | Two digits (e.g. `01`, `15`) |
| DOB Month | 01 | Two digits (e.g. `01`, `06`) |
| DOB Year | 1990 | Four digits (e.g. `1990`) |
| Password | Test@1234 | Used when creating a new account |
| Confirm Password | Test@1234 | Must match Password |

> **NHS toggle:** If you are running an NHS journey, click the **NHS** toggle switch at the top of the User Info section. It will pre-fill all the NHS-required fields with valid sample data.

> **Contact Recovery:** If you want to test the flow where a patient uses a different email or phone for their appointment, tick the **"Trigger contact recovery"** checkbox. New fields will appear for the alternative email and phone number.

---

#### 📅 Appointment

Controls how the tool books an appointment slot.

| Field | Options | What it means |
|---|---|---|
| Appointment Type | Video, Face to Face, Phone call | The type of consultation to book |
| Appointment Time | e.g. `07:00 AM` | Preferred time — only used if not using "next available slot" |
| Start Time | e.g. `07:00 AM` | Alternative start time field |
| Duration (mins) | e.g. `10` | Appointment length in minutes |
| Enable API debug logs | Checkbox (on by default) | Shows detailed network request/response logs in the Output tab. Leave ticked unless the log is too noisy. |

> **Tip:** The tool is set to pick the **next available slot** by default. If you want to test a specific date and time, ask a developer to adjust the booking preferences in the test configuration file.

---

#### 💳 Payment Card

The tool uses a **test payment card** — it does not charge real money. Fill in these fields to use a custom card, or leave them empty to use the system defaults.

| Field | Default value |
|---|---|
| Cardholder Name | Jhon Smith |
| Card Number | 5555 5555 5555 4444 |
| Expiry Date (MM/YY) | 01/32 |
| Security Code | 123 |

> **Note:** These are test card numbers provided by the payment processor for testing purposes. No real transaction takes place.

---

#### 🚚 Shipping

Used for **lifestyle journeys** (e.g. Erectile Dysfunction) where a physical medication is ordered and shipped.

| Field | Options | What it means |
|---|---|---|
| Shipping Mode | Delivery, Pharmacy | Whether the medication is delivered to an address or collected from a pharmacy |
| Address Type | Home, Work, Other | Label for the saved address |
| Address Line 1 | 221B Baker Street | Street address |
| Address Line 2 | *(optional)* | Flat number, building name, etc. |
| Town / City | London | |
| Postal Code | SW1A 1AA | |
| Address Action | Save, Cancel | Whether to save the address or cancel |
| Payment Method | Cash on Delivery, Credit Card | How the order is paid for |

> After filling in any of the above sections, your settings are saved automatically in your browser. They will still be there the next time you open the dashboard.

---

### Step 3 — Watch the Test Run

Once a test starts, several things happen at once:

1. **Status bar** turns blue and shows `Running…`
2. **Video player** shows a live or near-live recording of what the browser is doing
3. **Output tab** fills with a step-by-step log of every action

**Typical steps you will see in the Output log:**

```
✔ Direct patient flow start URL: https://...
✔ Cookie consent dismissed (Accept All)
✔ Landing page detected with journey: Sign Up -> Questionnaire -> Booking — clicking Get Started
→ Handling questionnaire step
→ Handling sign-up step
→ Handling booking step
✔ Booking success state reached!
```

The **URL bar above the video** updates as the browser moves between pages — you can follow along exactly where the automation is at each moment.

---

### Step 4 — Read the Result

When the test finishes, the status bar updates:

| Status colour | Meaning |
|---|---|
| 🟢 Green | Test **passed** — the patient journey completed successfully |
| 🔴 Red | Test **failed** — something went wrong during the journey |
| 🟡 Yellow | Test **skipped** — the run was skipped (e.g. `START_URL` not provided for a link-based test) |

The pass / fail / skip counts are shown at the right end of the status bar.

---

## Understanding Test Outcomes

### When a journey completes successfully ✅

The test log will show one of these messages:

| Log message | What it means |
|---|---|
| `✔ Booking success state reached!` | An appointment was booked — consultation journey complete |
| `✔ Thank-you page detected! Journey completed successfully.` | A medication order was placed — lifestyle journey complete |
| `✔ Payment completed — ending test flow` | Payment step finished and the flow closed |

Nothing further is needed.

---

### When a journey reaches a dead-end ⏹

A dead-end is **not always an error** — it means the questionnaire answers led to a clinical outcome other than booking. The tool handles this gracefully.

| Log message | What it means |
|---|---|
| `✔ Dead-end terminal state reached — ending flow gracefully` | The questionnaire routed to self-care, GP referral, or an ineligible result |
| `✔ Flow intentionally ended via End Assessment` | An NHS 111 emergency popup was detected and the assessment was stopped safely |
| `✔ Gender-specific ineligibility popup detected` | The condition is not available for the patient's gender — the tool clicked "Back to Home" |

These outcomes are expected for certain conditions and certain questionnaire answers. They are not failures.

---

### When a test fails ❌

Click the failed run in the left sidebar. Then:

1. **Watch the video** — the recording shows exactly where the browser stopped
2. **Read the Output tab** — the last few lines will describe the error
3. **Check the Artifacts tab** — a screenshot of the failure moment is saved there

**Common failure reasons:**

| What you see in the log | What it likely means |
|---|---|
| `⚠ Link is Expired — stopping test.` | The patient link has expired. Get a fresh link and paste it again. |
| `⚠ Stuck: step "questionnaire_submit" visited 6 times` | The questionnaire got into a loop. Report the condition name to the development team. |
| `⚠ Unknown step at URL: … — stopping loop` | The browser landed on a page the tool did not recognise. Try running the test again. |
| `net::ERR_NAME_NOT_RESOLVED` | The Healthya website URL is wrong or the site is temporarily down. |
| `Timeout exceeded` | The page took too long to load. Could be a slow connection or a site issue. |

> **What to do when a test fails:** If the same test fails consistently, take a screenshot of the Output tab and report it to the development team along with the condition type you were testing.

---

## The Artifacts Tab — Finding Videos and Traces

After any test run, click the **Artifacts** tab to find:

### 📹 Videos

A full recording of the browser session. Click the filename to play it in the video player above. Use this to replay step-by-step what happened during the test.

### 🔍 Traces

A detailed trace file that records every action, screenshot, and network request frame-by-frame. This is mainly used by developers for in-depth debugging.

### 🖼 Screenshots

Individual screenshots captured automatically at key moments, especially when something goes wrong.

---

## The Results Tab — Browsing Past Runs

Click the **Results** tab to see a list of all saved test result folders on your computer.

- Tick the checkbox next to a result and click **Delete selected** to clean up old runs
- Click **Refresh** to update the list if new results have just finished saving

---

## The API Tab — Network Requests

Click the **API** tab to see every network call the test made — API calls to the booking system, page navigations, and data responses.

This tab is mainly useful for the development team to verify that the right data is being sent and received. As a non-technical user, you can ignore this tab unless someone asks you to share its contents for debugging.

---

## Condition Types — What the Tool Tests

The tool supports three types of Healthya patient journeys. The correct type is detected automatically:

| Journey type | Example condition | Typical flow |
|---|---|---|
| **NHS** | Shingles vaccine | Sign-up → Questionnaire → Appointment booking (free) |
| **Private** | Weight management | Questionnaire → Sign-up → Appointment booking → Payment |
| **Lifestyle** | Erectile dysfunction | Drug selection → Cart → Shipping address → Payment |

---

## Frequently Asked Questions

**Q: The dashboard page will not open. What do I do?**  
A: The server is not running. Ask a developer to run `npm run dashboard` in the project folder. Leave that terminal window open.

**Q: I pasted a link and clicked "Add" but nothing appeared in the Link Queue.**  
A: Make sure the link starts with `http` or `https`. Also check that you clicked the **⊕ Add** button (not just pressed Enter).

**Q: I am using Logged In mode but the test fails immediately.**  
A: Check that the DOB is in the exact format `DD-MM-YYYY` (e.g. `15-06-1990`) and that the PIN is correct. Both are required for the logged-in flow.

**Q: A cookie consent popup appeared and the test stopped.**  
A: Cookie consent is now handled automatically — the tool clicks "Accept All" whenever it appears. If you see `✔ Cookie consent dismissed (Accept All)` in the log, it was handled correctly. If the test still stopped, the issue is something else — check the Output tab for the next error.

**Q: The video player shows a black screen.**  
A: The test may still be processing the video. Wait 10–15 seconds and click **Refresh** in the Artifacts tab. If it remains blank, check the Artifacts tab for a video file you can download and play locally.

**Q: The test ran but chose the wrong appointment type (e.g. Phone call instead of Video).**  
A: Go to **⚙ Test Data → 📅 Appointment** and make sure **Appointment Type** is set to your preference. Click out of the panel — settings are saved automatically.

**Q: The test keeps saying "Stuck: step visited 6 times".**  
A: The tool got into a loop on one step — usually the questionnaire. This typically means the questionnaire has an unexpected new question or screen. Report the condition name and the Output log to the development team.

**Q: Can I run a batch of links at once?**  
A: Yes. Either upload an Excel/CSV file using the **↑ Upload** button, or add each link one by one using **⊕ Add**. Once all links are in the Link Queue, click **▶ Run All Links**.

**Q: How do I switch between dark mode and light mode?**  
A: Click the **☀️ / 🌙** button in the top-right corner of the header.

**Q: What happens if I close the browser while a test is running?**  
A: The test will continue running in the background (the server keeps it going). You can re-open the dashboard at `http://localhost:3000` to see the results. To stop a running test, click **■ Stop** in the header before closing.

---

## Quick Reference Card

| I want to… | I should… |
|---|---|
| Run a test from a patient link | Paste link → **⊕ Add** → **▶ Run Link** |
| Run multiple links at once | **↑ Upload** a file → **▶ Run All Links** |
| Run a standard pre-built test | Find it in the sidebar → hover → click **▶** |
| Run all pre-built tests | Click **▶ Run All** in the header |
| Stop a test mid-run | Click **■ Stop** in the header |
| Change patient details | Click **⚙ Test Data** → expand **👤 User Info** → edit fields |
| Change appointment type | Click **⚙ Test Data** → expand **📅 Appointment** → choose type |
| Change payment card | Click **⚙ Test Data** → expand **💳 Payment Card** → edit fields |
| Watch what the test did | Look at the **Video player** or click **Artifacts** tab |
| See why a test failed | Check **Output** tab or **Artifacts** → screenshot |
| Switch to logged-in mode | Click **Logged In** button in the header |
| Switch to dark / light mode | Click **☀️ / 🌙** in the header |
| Clear the link queue | Click **✕ Clear** inside the Link Queue panel |

---

_For technical issues or to report a bug, contact the development team with a screenshot of the Output tab, the condition or link you were testing, and the flow mode you were using (Non-Logged or Logged In)._
