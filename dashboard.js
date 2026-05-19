const express = require("express");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const xlsx = require("xlsx");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "dashboard-public")));
app.use("/test-results", express.static(path.join(__dirname, "test-results")));

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(
  "/trace-viewer",
  express.static(
    path.join(__dirname, "node_modules/playwright-core/lib/vite/traceViewer"),
  ),
);

const TEST_DATA_PATH = path.join(__dirname, "tests/fixtures/test-data.ts");
const PHARMACIES_PATH = path.join(__dirname, "tests/fixtures/pharmacies.ts");

// ── Pharmacy + test discovery ─────────────────────────────────────────────────

function readPharmacies() {
  const src = fs.readFileSync(PHARMACIES_PATH, "utf8");
  const list = [];
  const lines = src.split("\n");
  let cur = null;
  for (const line of lines) {
    const nameM = line.match(/\bname\s*:\s*["']([^"']+)["']/);
    const urlM = line.match(/\bbaseURL\s*:\s*["']([^"']+)["']/);
    const skipM = line.match(/\bciSkip\s*:\s*(true|false)/);
    const projM = line.match(/\bsanityProjectId\s*:\s*["']([^"']+)["']/);
    if (nameM) cur = { name: nameM[1], baseURL: "", ciSkip: false };
    if (cur && urlM) cur.baseURL = urlM[1];
    if (cur && skipM) cur.ciSkip = skipM[1] === "true";
    if (cur && projM) cur.sanityProjectId = projM[1];
    if (cur && cur.baseURL && /^\s*\},?\s*$/.test(line)) {
      list.push({ ...cur });
      cur = null;
    }
  }
  return list;
}

let _testListCache = null;
let _testListCacheAt = 0;
const TEST_LIST_TTL_MS = 30_000;
let lastRunStartTime = 0;
const activeProcs = new Map();
const completedRunIds = new Set();
const MAX_RUN_MS = 10 * 60 * 1000;

function flattenSuites(suites, parentTitles = [], depth = 0) {
  const out = [];
  for (const s of suites || []) {
    const titles =
      depth === 0 ? parentTitles : [...parentTitles, s.title].filter(Boolean);
    for (const spec of s.specs || []) {
      out.push({
        title: spec.title,
        fullTitle: [...titles, spec.title].filter(Boolean).join(" > "),
        file: spec.file || s.file || "",
        line: spec.line || 0,
      });
    }
    if (s.suites) out.push(...flattenSuites(s.suites, titles, depth + 1));
  }
  return out;
}

function listTests() {
  if (_testListCache && Date.now() - _testListCacheAt < TEST_LIST_TTL_MS) {
    return Promise.resolve(_testListCache);
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "pnpm",
      ["exec", "playwright", "test", "--list", "--reporter=json"],
      {
        cwd: __dirname,
        env: { ...process.env },
      },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("close", () => {
      try {
        const json = JSON.parse(out);
        const all = flattenSuites(json.suites || []);
        const seen = new Set();
        const unique = [];
        for (const t of all) {
          const key = `${t.file}::${t.fullTitle}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(t);
          }
        }
        _testListCache = unique;
        _testListCacheAt = Date.now();
        resolve(unique);
      } catch (e) {
        reject(new Error(`Failed to list tests: ${e.message}\n${err}`));
      }
    });
  });
}

// ── Flow configs ──────────────────────────────────────────────────────────────
const FLOW_CONFIGS = [
  {
    name: "NHS — next available slot",
    group: "NHS",
    conditionJourneyType: "nhs",
  },
  {
    name: "NHS — specific date and time",
    group: "NHS",
    conditionJourneyType: "nhs",
  },
  {
    name: "Private — next available slot, new card",
    group: "Private",
    conditionJourneyType: "private",
  },
  {
    name: "Private — next available slot, saved card",
    group: "Private",
    conditionJourneyType: "private",
  },
  {
    name: "Private — specific date, new card",
    group: "Private",
    conditionJourneyType: "private",
  },
  {
    name: "Private — specific date, saved card",
    group: "Private",
    conditionJourneyType: "private",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function readTestData() {
  const src = fs.readFileSync(TEST_DATA_PATH, "utf8");

  const get = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m ? m[1] : "";
  };
  const getEnv = (tdKey) => {
    const m = src.match(new RegExp(`${tdKey}\\s*\\|\\|\\s*"([^"]*)"`));
    return m ? m[1] : "";
  };
  const getNum = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*(\\d+)`));
    return m ? parseInt(m[1]) : 0;
  };
  const getBool = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*(true|false)`));
    return m ? m[1] === "true" : false;
  };

  const activeCondBlock = src.match(/ACTIVE_CONDITION\s*=\s*\{([^}]+)\}/s);
  let journeyType = "nhs";
  if (activeCondBlock) {
    const uncommented = activeCondBlock[1]
      .split("\n")
      .find((l) => l.includes("journeyType") && !l.trim().startsWith("//"));
    if (uncommented) {
      const jm = uncommented.match(/"(nhs|private|lifestyle)"/);
      if (jm) journeyType = jm[1];
    }
  }

  return {
    user: {
      gender: getEnv("TD_GENDER"),
      firstName: getEnv("TD_FIRST_NAME"),
      lastName: getEnv("TD_LAST_NAME"),
      postcode: getEnv("TD_POSTCODE"),
      email: getEnv("TD_EMAIL"),
      confirmEmail: getEnv("TD_CONFIRM_EMAIL") || getEnv("TD_EMAIL"),
      phone: getEnv("TD_PHONE"),
      confirmPhone: getEnv("TD_CONFIRM_PHONE") || getEnv("TD_PHONE"),
      guardianName: getEnv("TD_GUARDIAN_NAME"),
      dobDay: getEnv("TD_DOB_DAY"),
      dobMonth: getEnv("TD_DOB_MONTH"),
      dobYear: getEnv("TD_DOB_YEAR"),
      password: getEnv("TD_PASSWORD"),
      confirmPassword: getEnv("TD_CONFIRM_PASSWORD"),
      triggerContactRecovery: getEnv("TD_TRIGGER_CONTACT_RECOVERY") === "true",
      newPhone: getEnv("TD_NEW_PHONE") || getEnv("TD_PHONE"),
      confirmNewPhone:
        getEnv("TD_CONFIRM_NEW_PHONE") ||
        getEnv("TD_NEW_PHONE") ||
        getEnv("TD_PHONE"),
      newEmail: getEnv("TD_NEW_EMAIL") || getEnv("TD_EMAIL"),
      confirmNewEmail:
        getEnv("TD_CONFIRM_NEW_EMAIL") ||
        getEnv("TD_NEW_EMAIL") ||
        getEnv("TD_EMAIL"),
    },
    payment: {
      cardholderName: getEnv("TD_CARD_HOLDER"),
      cardNumber: getEnv("TD_CARD_NUMBER"),
      expiryDate: getEnv("TD_CARD_EXPIRY"),
      securityCode: getEnv("TD_CARD_CVV"),
    },
    condition: { journeyType },
    booking: {
      appointmentType: get("appointmentType"),
      useNextAvailableSlot: getBool("useNextAvailableSlot"),
      preferredMonth: get("preferredMonth"),
      preferredDate: get("preferredDate"),
      preferredTime: get("preferredTime"),
      autoMoveToNextDate: getBool("autoMoveToNextDate"),
      maxDateAttempts: getNum("maxDateAttempts"),
    },
    drug: {
      strength: get("strength"),
      packSize: get("packSize"),
    },
    cart: {
      quantityAction: get("quantityAction"),
      quantityClicks: getNum("quantityClicks"),
      deleteProduct: getBool("deleteProduct"),
      couponCode: (() => {
        const m = src.match(/couponCode:\s*"([^"]*)"/);
        return m ? m[1] : "";
      })(),
      action: (() => {
        const m = src.match(/CART_PREFERENCES[\s\S]*?action:\s*"([^"]*)"/);
        return m ? m[1] : "Proceed To Checkout";
      })(),
    },
    shipping: {
      shippingMode: getEnv("TD_SHIP_MODE"),
      addressType: getEnv("TD_SHIP_ADDRESS_TYPE"),
      addressLine1: getEnv("TD_SHIP_ADDRESS1"),
      addressLine2: getEnv("TD_SHIP_ADDRESS2"),
      townCity: getEnv("TD_SHIP_CITY"),
      postalCode: getEnv("TD_SHIP_POSTCODE"),
      addressAction: getEnv("TD_SHIP_ADDRESS_ACTION"),
      paymentMethod: getEnv("TD_PAYMENT_METHOD"),
    },
    thankYou: {
      action: (() => {
        const m = src.match(/THANK_YOU_PREFERENCES[\s\S]*?action:\s*"([^"]*)"/);
        return m ? m[1] : "My Orders";
      })(),
    },
  };
}

// ── Playwright UI process ─────────────────────────────────────────────────────

const UI_PORT = 8081;
let uiProc = null;
let uiReady = false;

function launchUI() {
  if (uiProc) return { already: true };

  uiReady = false;
  uiProc = spawn(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--ui",
      `--ui-host=127.0.0.1`,
      `--ui-port=${UI_PORT}`,
    ],
    { cwd: __dirname, env: { ...process.env } },
  );

  const onData = (chunk) => {
    const text = chunk.toString();
    if (
      text.includes("listening") ||
      text.includes(String(UI_PORT)) ||
      text.includes("Listening")
    ) {
      uiReady = true;
    }
  };

  uiProc.stdout.on("data", onData);
  uiProc.stderr.on("data", onData);

  setTimeout(() => {
    uiReady = true;
  }, 4000);

  uiProc.on("close", () => {
    uiProc = null;
    uiReady = false;
  });

  return { started: true };
}

function stopUI() {
  if (!uiProc) return { already: true };
  uiProc.kill();
  uiProc = null;
  uiReady = false;
  return { stopped: true };
}

// ── Artifact discovery ────────────────────────────────────────────────────────

function findArtifactsAfter(since) {
  const dir = path.join(__dirname, "test-results");
  const artifacts = { videos: [], traces: [], screenshots: [] };
  if (!fs.existsSync(dir)) return artifacts;

  function scan(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs >= since) {
            const url =
              "/" + path.relative(__dirname, full).replace(/\\/g, "/");
            if (entry.name.endsWith(".webm")) artifacts.videos.push(url);
            else if (entry.name === "trace.zip") artifacts.traces.push(url);
            else if (/\.(png|jpg|jpeg)$/i.test(entry.name))
              artifacts.screenshots.push(url);
          }
        } catch (_) {}
      }
    }
  }

  scan(dir);
  return artifacts;
}

function findArtifactsInDir(dir) {
  const artifacts = { videos: [], traces: [], screenshots: [] };
  if (!fs.existsSync(dir)) return artifacts;

  function scan(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile()) {
        const url = "/" + path.relative(__dirname, full).replace(/\\/g, "/");
        if (entry.name.endsWith(".webm")) artifacts.videos.push(url);
        else if (entry.name === "trace.zip") artifacts.traces.push(url);
        else if (/\.(png|jpg|jpeg)$/i.test(entry.name))
          artifacts.screenshots.push(url);
      }
    }
  }

  scan(dir);
  return artifacts;
}

async function resolveHealthyaLink(input) {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Link is required");

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    throw new Error("Invalid URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https links are supported");
  }

  const extractPatientFlowFromText = (text) => {
    if (!text) return null;
    const direct = text.match(
      /https?:\/\/dev\.healthya\.co\.uk\/patient_flow\?[^\s"'<>]+/i,
    );
    if (direct?.[0]) return direct[0];

    const metaRefresh = text.match(/url\s*=\s*(https?:\/\/[^\s"'<>]+)/i);
    if (metaRefresh?.[1]) return metaRefresh[1];

    const jsLocation = text.match(
      /(location\.href|location\.replace|window\.location)\s*[:=(]\s*["'](https?:\/\/[^"']+)["']/i,
    );
    if (jsLocation?.[2]) return jsLocation[2];

    return null;
  };

  try {
    const res = await fetch(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      headers: { "user-agent": "playwright-dashboard/1.0" },
    });
    let resolved = res.url || parsed.toString();
    const contentType = res.headers.get("content-type") || "";

    if (/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      const body = await res.text().catch(() => "");
      const extracted = extractPatientFlowFromText(body);
      if (extracted) resolved = extracted;
    }

    const resolvedUrl = new URL(resolved);
    return {
      input: parsed.toString(),
      resolved: resolvedUrl.toString(),
      baseURL: resolvedUrl.origin,
    };
  } catch (_) {
    return {
      input: parsed.toString(),
      resolved: parsed.toString(),
      baseURL: parsed.origin,
    };
  }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    return JSON.parse(Buffer.from(pad, "base64").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function journeysForStep(step) {
  switch (step) {
    case "appointment_booking":
      return ["booking", "user_journey"];
    case "payment":
      return ["payment", "booking", "user_journey"];
    case "sign_up":
      return ["user_journey", "nhs", "private", "lifestyle"];
    case "questionnaire_submit":
      return ["condition_rules", "nhs", "private", "lifestyle", "user_journey"];
    default:
      return [];
  }
}

// ── OPTIMISED: detectFlowFromResolvedUrl ──────────────────────────────────────
// Key changes vs original:
//  1. waitUntil "domcontentloaded" only — never "networkidle" (was the #1 cause of 30-45s waits)
//  2. Single goto with a reasonable 20s timeout; no sequential retry goto
//  3. No hardcoded waitForTimeout sleeps — replaced with race-based waitForSelector
//  4. Selector timeouts slashed: landing selector 3s, post-click 2s
//  5. hasVisible uses Promise.any across all selectors simultaneously (parallel),
//     with a single 1s timeout ceiling instead of 400ms × up to 5 elements × 4 groups
//  6. Get-started click only if selector is already attached (no extra wait)
// ─────────────────────────────────────────────────────────────────────────────
async function detectFlowFromResolvedUrl(url) {
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Block heavy assets — we only need HTML/JS to detect the page shape
  await page.route(
    /\.(woff2?|ttf|eot|otf|mp4|webm|svg|png|jpe?g|gif|ico|css)(\?.*)?$/i,
    (route) => route.abort(),
  );

  try {
    // domcontentloaded is enough; networkidle can hang for 30-45 s on SPAs
    await page
      .goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 })
      .catch(() => {});

    // Wait for the page to paint something useful — max 3 s, resolve early if found
    await page
      .waitForSelector(
        '.introduction-wrapper, [class*="questionnaire"], input[type="email"], input[name="first_name"], .rota-slot, input[autocomplete="cc-number"]',
        { timeout: 3_000 },
      )
      .catch(() => {});

    // Extract journey prediction from rendered text (no extra sleep needed)
    const predictedJourney = await page
      .evaluate(() => {
        const introWrapper = document.querySelector(".introduction-wrapper");
        const searchContext = introWrapper || document.body;
        const text = (
          searchContext.innerText ||
          searchContext.textContent ||
          ""
        ).toLowerCase();

        const pointPatterns = [
          {
            label: "Sign Up",
            patterns: [
              "receive advice",
              "treatment",
              "personal details",
              "contact details",
              "sign up",
              "register",
              "create account",
            ],
          },
          {
            label: "Questionnaire",
            patterns: [
              "checking your symptoms",
              "medical questions",
              "assessment",
              "questionnaire",
              "clinical questions",
              "medical history",
            ],
          },
          {
            label: "Booking",
            patterns: [
              "book your appointment",
              "select a slot",
              "choose a time",
              "appointment time",
              "booking",
              "schedule",
              "appointment date",
            ],
          },
        ];

        const points = [];
        for (const point of pointPatterns) {
          for (const p of point.patterns) {
            const idx = text.indexOf(p);
            if (idx !== -1) {
              points.push({ label: point.label, idx });
              break;
            }
          }
        }
        points.sort((a, b) => a.idx - b.idx);
        return points.length ? points.map((p) => p.label).join(" -> ") : null;
      })
      .catch(() => null);

    // Click "Get Started" only when the button is already in the DOM (no extra wait)
    const getStartedSel =
      'button:has-text("Get Started"), a:has-text("Get Started"), button:has-text("Start"), a:has-text("Start")';
    let clickedGetStarted = false;

    if (predictedJourney) {
      const getStartedBtn = page.locator(getStartedSel).first();
      const visible = await getStartedBtn.isVisible().catch(() => false);
      if (visible) {
        await getStartedBtn.click().catch(() => {});
        clickedGetStarted = true;
        // Wait for the next meaningful element — max 2 s, no fixed sleep
        await page
          .waitForSelector(
            'input[type="email"], input[name="first_name"], .rota-slot, input[autocomplete="cc-number"], [class*="questionnaire"], input[type="radio"]',
            { timeout: 2_000 },
          )
          .catch(() => {});
      }
    } else {
      console.log(
        "Landing page detected but no journey data found in text; skipping Get Started click per requirement.",
      );
    }

    // ── Parallel visibility checks — one Promise.race per group ──────────────
    const anyVisible = async (selectors, timeoutMs = 1_000) => {
      try {
        await Promise.race([
          ...selectors.map((sel) =>
            page
              .locator(sel)
              .first()
              .waitFor({ state: "visible", timeout: timeoutMs }),
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), timeoutMs),
          ),
        ]);
        return true;
      } catch (_) {
        return false;
      }
    };

    // Run all four checks in parallel rather than sequentially
    const [isPayment, isBooking, isSignup, isQuestionnaire] = await Promise.all(
      [
        anyVisible([
          ':text("Complete your payment")',
          'input[autocomplete="cc-number"]',
          'button:has-text("Pay")',
        ]),
        anyVisible([
          ".appointment-type-radio-group",
          ".rota-slot",
          'button:has-text("Book Now")',
          ':text("Appointment type")',
          ':text("Book your appointment")',
        ]),
        anyVisible([
          'input[type="email"]',
          'input[name="first_name"]',
          ':text("Enter your contact details")',
          'button:has-text("Sign Up")',
        ]),
        anyVisible([
          ':text("Questionnaires")',
          "input[type=radio]",
          "input[type=checkbox]",
          "textarea",
          '[class*="questionnaire"]',
        ]),
      ],
    );

    let step = "unknown";
    if (isPayment) step = "payment";
    else if (isBooking) step = "appointment_booking";
    else if (isSignup) step = "sign_up";
    else if (isQuestionnaire) step = "questionnaire_submit";

    return {
      step,
      predictedJourney,
      currentUrl: page.url(),
      title: await page.title().catch(() => ""),
      clickedGetStarted,
    };
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/api/test-data", (req, res) => {
  try {
    res.json(readTestData());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/test-data", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/flow-configs", (_req, res) => {
  res.json(FLOW_CONFIGS);
});

app.get("/api/pharmacies", (_req, res) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    res.json(readPharmacies());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/tests", async (_req, res) => {
  try {
    const tests = await listTests();
    res.json(tests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/upload-links", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      return res
        .status(400)
        .json({ error: "File upload error: " + err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const links = new Set();
      const urlPattern = /https?:\/\/[^\s"'<>]+/g;

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

        data.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (cell && typeof cell === "string") {
                const matches = cell.match(urlPattern);
                if (matches) {
                  matches.forEach((link) => links.add(link));
                }
              }
            });
          }
        });
      });

      res.json({ links: Array.from(links) });
    } catch (e) {
      res.status(500).json({ error: "Failed to parse file: " + e.message });
    }
  });
});

app.get("/api/resolve-healthya-link", async (req, res) => {
  try {
    const result = await resolveHealthyaLink(req.query.url);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/analyze-healthya-link", async (req, res) => {
  try {
    const resolved = await resolveHealthyaLink(req.query.url);
    const parsed = new URL(resolved.resolved);
    const token = parsed.searchParams.get("token") || "";
    const conditionToken = parsed.searchParams.get("condition_url_token") || "";
    const tokenPayload = decodeJwtPayload(token);
    const conditionTokenPayload = decodeJwtPayload(conditionToken);
    const detected = await detectFlowFromResolvedUrl(resolved.resolved);

    res.json({
      ...resolved,
      pathname: parsed.pathname,
      query: Object.fromEntries(parsed.searchParams.entries()),
      tokenPayload,
      conditionTokenPayload,
      detected,
      suggestedJourneys: journeysForStep(detected.step),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "Failed to analyze link" });
  }
});

// SSE stream for running tests
app.get("/api/run-tests", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (type, data) => {
    try {
      res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      if (typeof res.flush === "function") res.flush();
    } catch (_) {}
  };

  const runId =
    req.query.runId ||
    `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (completedRunIds.has(runId)) {
    send("done", {
      code: 0,
      success: true,
      reconnect: true,
      passed: "",
      failed: "",
      skipped: "",
      artifacts: { videos: [], traces: [] },
    });
    res.end();
    return;
  }

  const grep = req.query.grep;
  const project = req.query.project;
  const file = req.query.file;
  const line = req.query.line;
  const label = req.query.label;
  const tdOverridesB64 = req.query.td;
  const baseURL =
    typeof req.query.baseURL === "string" ? req.query.baseURL.trim() : "";
  const startUrl =
    typeof req.query.startUrl === "string" ? req.query.startUrl.trim() : "";
  const grepArg = grep
    ? grep
        .split(" > ")
        .pop()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    : null;
  const parts = [];
  if (project) parts.push(project);
  if (baseURL) parts.push(baseURL);
  if (startUrl) parts.push("patient_flow");
  parts.push(
    label || (file ? `${file}${line ? ":" + line : ""}` : "all tests"),
  );
  send("start", `Starting Playwright — ${parts.join(" · ")}...`);

  const runStartTime = Date.now();
  lastRunStartTime = runStartTime;

  const tdEnv = {};
  if (tdOverridesB64) {
    try {
      const td = JSON.parse(
        Buffer.from(tdOverridesB64, "base64").toString("utf8"),
      );
      const u = td.user || {};
      const p = td.payment || {};
      const sh = td.shipping || {};
      const set = (key, val) => {
        if (val != null && String(val).trim() !== "") tdEnv[key] = String(val);
      };
      set("TD_FIRST_NAME", u.firstName);
      set("TD_LAST_NAME", u.lastName);
      set("TD_GENDER", u.gender);
      set("TD_EMAIL", u.email);
      set("TD_CONFIRM_EMAIL", u.confirmEmail);
      set("TD_PHONE", u.phone);
      set("TD_CONFIRM_PHONE", u.confirmPhone);
      set("TD_POSTCODE", u.postcode);
      set("TD_GUARDIAN_NAME", u.guardianName);
      set("TD_PASSWORD", u.password);
      set("TD_CONFIRM_PASSWORD", u.confirmPassword);
      set("TD_DOB_DAY", u.dobDay);
      set("TD_DOB_MONTH", u.dobMonth);
      set("TD_DOB_YEAR", u.dobYear);
      set("TD_CARD_HOLDER", p.cardholderName);
      set("TD_CARD_NUMBER", p.cardNumber);
      set("TD_CARD_EXPIRY", p.expiryDate);
      set("TD_CARD_CVV", p.securityCode);
      set("TD_SHIP_MODE", sh.shippingMode);
      set("TD_SHIP_ADDRESS_TYPE", sh.addressType);
      set("TD_SHIP_ADDRESS1", sh.addressLine1);
      set("TD_SHIP_ADDRESS2", sh.addressLine2);
      set("TD_SHIP_CITY", sh.townCity);
      set("TD_SHIP_POSTCODE", sh.postalCode);
      set("TD_SHIP_ADDRESS_ACTION", sh.addressAction);
      set("TD_PAYMENT_METHOD", sh.paymentMethod);
      set("TD_TRIGGER_CONTACT_RECOVERY", String(u.triggerContactRecovery));
      set("TD_NEW_PHONE", u.newPhone);
      set("TD_CONFIRM_NEW_PHONE", u.confirmNewPhone);
      set("TD_NEW_EMAIL", u.newEmail);
      set("TD_CONFIRM_NEW_EMAIL", u.confirmNewEmail);
      const overrideCount = Object.keys(tdEnv).length;
      if (overrideCount > 0) {
        const summary = Object.entries(tdEnv)
          .map(([k, v]) => `${k.replace("TD_", "")}="${v}"`)
          .join(", ");
        send("log", `📋 Test data overrides (${overrideCount}): ${summary}`);
      }
    } catch (err) {
      send("log", `⚠ Could not parse test data overrides: ${err.message}`);
    }
  }

  const runOutputDir = path.join(__dirname, "test-results", `run-${runId}`);
  const args = [
    "exec",
    "playwright",
    "test",
    "--reporter=list",
    `--output=${runOutputDir}`,
  ];
  const effectiveProject = project || "helathya";
  if (effectiveProject) args.push(`--project=${effectiveProject}`);
  if (file) {
    args.push(line ? `${file}:${line}` : file);
    if (grepArg) args.push("--grep", grepArg);
  } else if (grepArg) {
    args.push("--grep", grepArg);
  }

  const proc = spawn("pnpm", args, {
    cwd: __dirname,
    env: {
      ...process.env,
      ...tdEnv,
      ...(baseURL ? { BASE_URL: baseURL } : {}),
      ...(startUrl ? { START_URL: startUrl } : {}),
    },
    detached: true,
  });
  activeProcs.set(runId, { proc, startTime: runStartTime });

  let stdout = "";
  let stderr = "";
  let finished = false;

  const heartbeat = setInterval(() => send("ping", null), 15_000);

  const killTimeout = setTimeout(() => {
    if (!finished) {
      send(
        "log",
        `⚠ Process timed out after ${MAX_RUN_MS / 60000} minutes — killing.`,
      );
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch (_) {
        try {
          proc.kill("SIGKILL");
        } catch (_2) {}
      }
    }
  }, MAX_RUN_MS);

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    text.split("\n").forEach((line) => {
      if (line.trim()) send("log", line);
    });
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    text.split("\n").forEach((line) => {
      if (line.trim()) send("log", line);
    });
  });

  proc.on("exit", (code) => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    clearTimeout(killTimeout);
    activeProcs.delete(runId);
    completedRunIds.add(runId);
    if (completedRunIds.size > 500) {
      const [oldest] = completedRunIds;
      completedRunIds.delete(oldest);
    }
    try {
      proc.stdout.destroy();
    } catch (_) {}
    try {
      proc.stderr.destroy();
    } catch (_) {}
    setTimeout(() => {
      const passed = (stdout.match(/\d+ passed/)?.[0] || "").trim();
      const failed = (stdout.match(/\d+ failed/)?.[0] || "").trim();
      const skipped = (stdout.match(/\d+ skipped/)?.[0] || "").trim();
      const artifacts = findArtifactsInDir(runOutputDir);
      send("done", {
        code,
        passed,
        failed,
        skipped,
        success: code === 0,
        artifacts,
      });
      res.end();
    }, 1500);
  });

  req.on("close", () => {
    if (!finished) {
      activeProcs.delete(runId);
      try {
        process.kill(-proc.pid, "SIGKILL");
      } catch (_) {
        try {
          proc.kill();
        } catch (_2) {}
      }
    }
    clearInterval(heartbeat);
    clearTimeout(killTimeout);
  });
});

app.get("/api/latest-artifacts", (req, res) => {
  res.json(findArtifactsAfter(lastRunStartTime - 1000));
});

app.post("/api/stop-test", (req, res) => {
  const { runId } = req.body || {};
  if (runId) {
    const entry = activeProcs.get(runId);
    if (!entry) return res.json({ stopped: false, reason: "run not found" });
    try {
      process.kill(-entry.proc.pid, "SIGKILL");
    } catch (_) {
      try {
        entry.proc.kill("SIGKILL");
      } catch (_2) {}
    }
    activeProcs.delete(runId);
    return res.json({ stopped: true });
  }
  let count = 0;
  for (const [, entry] of activeProcs) {
    try {
      process.kill(-entry.proc.pid, "SIGKILL");
    } catch (_) {
      try {
        entry.proc.kill("SIGKILL");
      } catch (_2) {}
    }
    count++;
  }
  activeProcs.clear();
  res.json({ stopped: count > 0, count });
});

app.post("/api/launch-ui", (_req, res) => {
  res.json({ ...launchUI(), port: UI_PORT });
});

app.post("/api/stop-ui", (_req, res) => {
  res.json({ ...stopUI() });
});

app.get("/api/ui-status", (_req, res) => {
  res.json({ running: !!uiProc, ready: uiReady, port: UI_PORT });
});

app.get("/api/last-result", (req, res) => {
  const lastRun = path.join(__dirname, "test-results/.last-run.json");
  if (fs.existsSync(lastRun)) {
    res.json(JSON.parse(fs.readFileSync(lastRun, "utf8")));
  } else {
    res.json(null);
  }
});

// ── Serve dashboard ───────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard-public/index.html"));
});

const PORT = 7890;
app.listen(PORT, () => {
  console.log(`\n  Dashboard running at http://localhost:${PORT}\n`);
});
