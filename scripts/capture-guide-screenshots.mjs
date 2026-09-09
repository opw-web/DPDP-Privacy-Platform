#!/usr/bin/env node
/**
 * Capture the screenshots used by the client guide and the presenter runbook.
 *
 * The demo must already be running (button 1). Playwright is not a project
 * dependency -- it is only needed when the figures are refreshed:
 *
 *     npm install playwright && npx playwright install chromium
 *     node scripts/capture-guide-screenshots.mjs [--only=name,name]
 *
 * Every shot is taken at the same viewport so the figures sit consistently in
 * the documents. Pages are given a moment to settle, because most of them
 * fetch their data after the first paint.
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
 * name -> { url, as, height }. `as` picks which login the page needs;
 * `height` trims the viewport for a sparse page, so the figure is not
 * mostly empty background in the document.
 */
const SHOTS = {
  "registers": { url: "/app/registers", as: "staff", height: 520 },
  "sdf-register": { url: "/app/sdf", as: "staff" },
  "sdf-gaps": { url: "/app/sdf/gaps", as: "staff", height: 470 },
  "messaging-campaigns": { url: "/app/messaging/campaigns", as: "staff", height: 580 },
  "retention-erasure-engine": { url: "/app/retention", as: "staff" },
  "portal-recipients": { url: "/me/recipients", as: "principal", height: 570 },
  "portal-messages": { url: "/me/messages", as: "principal", height: 760 },
  "portal-nomination": { url: "/me/nomination", as: "principal", height: 860 },
};

async function signIn(page, { email, password }, loginPath) {
  await page.goto(`${APP}${loginPath}`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("login"), { timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function shoot(page, name, { url, height }) {
  const target = url.startsWith("http") ? url : `${APP}${url}`;
  await page.setViewportSize({ ...VIEWPORT, height: height || VIEWPORT.height });
  await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ${name}.png`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const wanted = Object.entries(SHOTS).filter(([n]) => !only.length || only.includes(n));

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
    }
    for (const [name, shot] of group) await shoot(page, name, shot);
    await context.close();
  }

  await browser.close();
  console.log(`\nWritten to ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
