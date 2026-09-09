#!/usr/bin/env node
/**
 * Capture the screenshots used by the client guide and the presenter runbook.
 *
 * The demo must already be running (button 1) and staged, because several
 * figures show records that `demo-control/stage-demo.sh` creates -- the
 * published notices and their Hindi translation among them. Playwright is not
 * a project dependency; it is only needed when the figures are refreshed:
 *
 *     npm install playwright && npx playwright install chromium
 *     node scripts/capture-guide-screenshots.mjs [--only=name,name]
 *
 * Every shot is taken at the same viewport so the figures sit consistently in
 * the documents. Pages are given a moment to settle, because most of them
 * fetch their data after the first paint.
 *
 * Each entry may carry `steps`, run after navigation and before the shot, so a
 * figure can show a screen in a state a bare URL cannot reach -- a verified
 * hash chain, a notice switched to Hindi, a detail page opened from its list.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

// Playwright is deliberately not a dependency of this repo. Install it
// wherever is convenient and point PLAYWRIGHT_DIR at that folder; without
// the variable, a plain `playwright` next to this script is used.
const playwright = await import(
  process.env.PLAYWRIGHT_DIR
    ? pathToFileURL(
        path.join(process.env.PLAYWRIGHT_DIR, "node_modules", "playwright", "index.js"),
      ).href
    : "playwright"
);
// The CommonJS build reaches ESM as a default export.
const { chromium } = playwright.chromium ? playwright : playwright.default;

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, "docs", "demo-runbook", "images");
const APP = "http://localhost:5173";

const STAFF = { email: "admin@acmeretail.demo", password: "Password123!" };
const VIEWPORT = { width: 1440, height: 900 };

const only = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .replace("--only=", "")
  .split(",")
  .filter(Boolean);

/**
 * name -> { url, as, height, steps }.
 *
 * `as`     picks which login the page needs ("staff", "principal", "none").
 * `height` trims the viewport for a sparse page, so the figure is not mostly
 *          empty background in the document.
 * `steps`  is an ordered list of actions applied before the shot:
 *            { click: selector }              click and wait for the settle
 *            { clickText: text }              click the first matching link/button
 *            { clickButton: name }            click a button by its accessible name
 *            { clickCardLink: { heading, link } }  click a link inside the card with that heading
 *            { clickCardButton: { heading, button } }  click a button inside that card
 *            { fill: selector, value: v }     type into an input
 *            { select: selector, value: v }   set a <select> and fire change
 *            { scrollTo: selector }           bring an element into view
 *            { scrollToText: text }           bring the first matching text into view
 *            { scrollToHeading: text }        bring a heading into view (exact role match)
 *            { waitFor: selector }            wait for an element to appear
 *            { waitForHeading: text }         wait for a heading to appear
 *
 * The six Windows shell figures (docker-running, folder-windows, prepare-,
 * start-, stop-, demo-proof-windows) and prisma-studio are captured by hand:
 * they are not pages of this application.
 */
const SHOTS = {
  // --- Sign-in and discovery -------------------------------------------------
  "login": { url: "/login", as: "none", height: 700 },
  "dashboard": { url: "/app", as: "staff" },
  "data-sources": { url: "/app/data-sources", as: "staff" },
  "review-queue": { url: "/app/review", as: "staff" },
  "principals-rahul": {
    url: "/app/principals", as: "staff",
    steps: [
      { fill: 'input[placeholder*="Search name"]', value: "Rahul" },
      { waitFor: 'a[href^="/app/principals/"]' },
      { click: 'a[href^="/app/principals/"]' },
      { waitFor: "h1" },
    ],
  },
  "registers": { url: "/app/registers", as: "staff", height: 520 },

  // --- Notices ---------------------------------------------------------------
  "notices-list": { url: "/app/notices", as: "staff", height: 700 },
  "notice-published": {
    url: "/app/notices", as: "staff",
    steps: [
      { click: '[data-notice-code="MARKETING_OPTIN"]' },
      { waitFor: "#notice-view-language" },
      { scrollTo: "#notice-view-language" },
    ],
  },
  "notice-hindi": {
    url: "/app/notices", as: "staff",
    steps: [
      { click: '[data-notice-code="MARKETING_OPTIN"]' },
      { waitFor: "#notice-view-language" },
      { select: "#notice-view-language", value: "hi" },
      { scrollTo: "#notice-view-language" },
    ],
  },

  // --- The individual portal -------------------------------------------------
  "portal-home": { url: "/me", as: "principal" },
  "portal-recipients": { url: "/me/recipients", as: "principal", height: 570 },
  "portal-messages": { url: "/me/messages", as: "principal", height: 760 },
  "portal-nomination": { url: "/me/nomination", as: "principal", height: 860 },
  "portal-requests": { url: "/me/requests", as: "principal" },
  "portal-privacy-hindi": {
    url: "/me/privacy", as: "principal",
    steps: [
      { waitFor: "#notice-language" },
      { select: "#notice-language", value: "hi" },
      // The marketing notice is the translated one; the account notice would
      // fall back to English and show the wrong thing entirely.
      { clickCardButton: { heading: "Marketing opt-in", button: "Read this notice" } },
      { scrollToText: "Privacy notices" },
    ],
  },

  // --- Rights requests -------------------------------------------------------
  "requests-list": { url: "/app/requests", as: "staff" },
  "request-detail": { url: "/app/requests/REQ-000001", as: "staff" },

  // --- Consent, retention, children -----------------------------------------
  "consents-dashboard": { url: "/app/consents", as: "staff" },
  "retention": { url: "/app/retention", as: "staff", height: 720 },
  "retention-erasure-engine": {
    url: "/app/retention", as: "staff",
    steps: [{ scrollToHeading: "Tasks by state" }],
  },
  "children": { url: "/app/children", as: "staff" },

  // --- Messaging -------------------------------------------------------------
  "messaging-campaigns": { url: "/app/messaging/campaigns", as: "staff", height: 580 },
  "campaign-recipients": {
    url: "/app/messaging/campaigns", as: "staff",
    steps: [
      { clickCardLink: { heading: "Monsoon sale", link: "Open campaign" } },
      { waitForHeading: "Delivery status" },
      { scrollToHeading: "Delivery status" },
    ],
  },

  // --- Breach, Government request, SDF --------------------------------------
  "breach-detail": {
    url: "/app/breaches", as: "staff",
    steps: [
      { click: 'a[href^="/app/breaches/"]:not([href$="/new"])' },
      { waitForHeading: "Obligations" },
    ],
  },
  // The breach page is barely taller than the viewport, so a second
  // whole-page shot would just repeat breach-detail. Take the clocks close-up.
  "breach-clocks": {
    url: "/app/breaches", as: "staff",
    cardShot: "Obligations",
    steps: [
      { click: 'a[href^="/app/breaches/"]:not([href$="/new"])' },
      { waitForHeading: "Obligations" },
    ],
  },
  "information-requests": { url: "/app/information-requests", as: "staff" },
  "sdf-register": { url: "/app/sdf", as: "staff" },
  "sdf-gaps": { url: "/app/sdf/gaps", as: "staff", height: 470 },

  // --- Evidence --------------------------------------------------------------
  // The chain figure must show a *verified* chain, so the button is pressed
  // and its result waited for before the shot is taken.
  "audit-chain": {
    url: "/app/audit", as: "staff",
    steps: [
      { clickButton: "Verify hash chain" },
      { waitFor: '[role="status"], [role="alert"]' },
      { scrollToHeading: "Hash-chain verification" },
    ],
  },
  // A whole-page shot here would only repeat audit-chain, so this figure is
  // the export card on its own -- which is what its caption describes.
  "evidence-pack": {
    url: "/app/audit", as: "staff",
    cardShot: "Access log export",
  },
};

async function signIn(page, { email, password }, loginPath) {
  await page.goto(`${APP}${loginPath}`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("login"), { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function applyStep(page, step) {
  if (step.click) {
    await page.click(step.click, { timeout: 15000 });
  } else if (step.clickText) {
    await page.getByText(step.clickText, { exact: false }).first().click({ timeout: 15000 });
  } else if (step.clickButton) {
    // Buttons are matched by role, not text: getByText can resolve to a
    // wrapping element that is not actionable, which times out instead of
    // clicking.
    await page.getByRole("button", { name: step.clickButton, exact: false }).first()
      .click({ timeout: 15000 });
  } else if (step.clickCardLink) {
    // Detail pages are reached through a generic "Open" link, so the card is
    // identified by its heading. The heading and the link are siblings inside
    // the card, not nested, so climb to the nearest ancestor holding both.
    const card = page
      .getByRole("heading", { name: step.clickCardLink.heading, exact: false })
      .first()
      .locator("xpath=ancestor::div[.//a][1]");
    await card.getByRole("link", { name: step.clickCardLink.link, exact: false }).first()
      .click({ timeout: 15000 });
  } else if (step.clickCardButton) {
    // Matched by text, not heading role: a card's title is not always marked
    // up as a heading (the portal's notice list uses a plain paragraph).
    const card = page
      .getByText(step.clickCardButton.heading, { exact: false })
      .first()
      .locator("xpath=ancestor::div[.//button][1]");
    await card.getByRole("button", { name: step.clickCardButton.button, exact: false }).first()
      .click({ timeout: 15000 });
  } else if (step.fill) {
    await page.fill(step.fill, step.value, { timeout: 15000 });
  } else if (step.select) {
    await page.selectOption(step.select, step.value, { timeout: 15000 });
  } else if (step.waitFor) {
    await page.waitForSelector(step.waitFor, { timeout: 15000 });
  } else if (step.waitForHeading) {
    // A list page and its detail page often share an <h1>, so waiting on the
    // tag alone passes without navigating. Wait for a heading only the
    // destination has.
    await page.getByRole("heading", { name: step.waitForHeading, exact: true }).first()
      .waitFor({ timeout: 15000 });
  } else if (step.scrollTo) {
    await page.locator(step.scrollTo).first().scrollIntoViewIfNeeded({ timeout: 15000 });
  } else if (step.scrollToText) {
    await page.getByText(step.scrollToText, { exact: false }).first()
      .scrollIntoViewIfNeeded({ timeout: 15000 });
  } else if (step.scrollToHeading) {
    // Headings are matched by role so a passing mention of the same word in
    // body copy cannot win and leave the page unscrolled.
    await page.getByRole("heading", { name: step.scrollToHeading, exact: true }).first()
      .scrollIntoViewIfNeeded({ timeout: 15000 });
  }
  await page.waitForTimeout(900);
}

async function shoot(page, name, { url, height, steps = [], cardShot }) {
  const target = url.startsWith("http") ? url : `${APP}${url}`;
  await page.setViewportSize({ ...VIEWPORT, height: height || VIEWPORT.height });
  await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);
  for (const step of steps) await applyStep(page, step);
  const file = path.join(OUT, `${name}.png`);
  if (cardShot) {
    // A close-up of one card. Used where a whole-viewport shot would repeat
    // the figure beside it, because the page is barely taller than the
    // viewport and scrolling moves almost nothing.
    await page
      .getByRole("heading", { name: cardShot, exact: true })
      .first()
      .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
      .screenshot({ path: file });
  } else {
    await page.screenshot({ path: file });
  }
  console.log(`  ${name}.png`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const wanted = Object.entries(SHOTS).filter(([n]) => !only.length || only.includes(n));
  const unknown = only.filter((n) => !(n in SHOTS));
  if (unknown.length) {
    console.error(`Unknown shot name(s): ${unknown.join(", ")}`);
    process.exit(1);
  }
  const failures = [];

  for (const as of ["staff", "principal", "none"]) {
    const group = wanted.filter(([, s]) => s.as === as);
    if (!group.length) continue;
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    if (as === "staff") {
      console.log("Signing in to the staff console...");
      await signIn(page, STAFF, "/login");
    } else if (as === "principal") {
      const email = process.env.PRINCIPAL_EMAIL || "aman.sharma@gmail.com";
      console.log(`Signing in to the individual portal as ${email}...`);
      await signIn(page, { email, password: "Password123!" }, "/me/login");
    } else {
      console.log("Capturing signed-out pages...");
    }
    // One failing figure must not cost the whole run: the remaining shots are
    // still captured and every failure is reported together at the end.
    for (const [name, shot] of group) {
      try {
        await shoot(page, name, shot);
      } catch (error) {
        failures.push({ name, message: error.message.split("\n")[0] });
        console.error(`  ${name}.png FAILED: ${error.message.split("\n")[0]}`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nWritten to ${OUT}`);
  if (failures.length) {
    console.error(`\n${failures.length} figure(s) failed:`);
    for (const failure of failures) console.error(`  - ${failure.name}: ${failure.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
