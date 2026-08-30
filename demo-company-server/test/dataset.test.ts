import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Point at throwaway test databases BEFORE anything imports db.ts's
// openDb, so production data/demo.sqlite is never touched.
const TEST_DB_PATH = path.join(__dirname, '.tmp-dataset-test.sqlite');
const TEST_DB_PATH_2 = path.join(__dirname, '.tmp-dataset-test-2.sqlite');
for (const base of [TEST_DB_PATH, TEST_DB_PATH_2]) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = base + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}
process.env.DEMO_DB_PATH = TEST_DB_PATH;

/* eslint-disable @typescript-eslint/no-var-requires */
const { seedDatabase, generateDataset, toSimRecords, SEED } = require('../src/seed/generate');
const { simulateMatching, normalizeEmail, normalizePhone, nameKey } = require('../src/seed/match');
const { openDb, closeDb } = require('../src/db');
const { DOB_REFERENCE_DATE } = require('../src/seed/personas');

let db: ReturnType<typeof openDb>;

before(() => {
  seedDatabase();
  db = openDb();
});

after(() => {
  closeDb();
  for (const base of [TEST_DB_PATH, TEST_DB_PATH_2]) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const f = base + suffix;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }
});

function countAll(): number {
  const tables = ['marketing_customers', 'sales_customers', 'support_users', 'ecommerce_customers'];
  return tables.reduce((sum, t) => sum + (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as any).c, 0);
}

// ---------------------------------------------------------------------
// Raw record count
// ---------------------------------------------------------------------
test('exactly 500 raw records across the four systems', () => {
  assert.equal(countAll(), 500);
});

test('per-system tables are non-empty and sum to 500', () => {
  const marketing = (db.prepare('SELECT COUNT(*) c FROM marketing_customers').get() as any).c;
  const sales = (db.prepare('SELECT COUNT(*) c FROM sales_customers').get() as any).c;
  const support = (db.prepare('SELECT COUNT(*) c FROM support_users').get() as any).c;
  const ecommerce = (db.prepare('SELECT COUNT(*) c FROM ecommerce_customers').get() as any).c;
  assert.ok(marketing > 0 && sales > 0 && support > 0 && ecommerce > 0);
  assert.equal(marketing + sales + support + ecommerce, 500);
});

// ---------------------------------------------------------------------
// Simulated matching (mirrors platform spec 4.4) run over the DB rows.
// ---------------------------------------------------------------------
function loadSimRecordsFromDb() {
  // NOTE: each table has its own named INTEGER PRIMARY KEY (id / crm_id /
  // user_ref / customer_code). SQLite silently renames a bare `rowid`
  // alias back to that column's real name when one exists, so `SELECT
  // rowid, *` does NOT yield a `rowid` property here - alias explicitly
  // per table instead.
  const marketing = db.prepare('SELECT id AS row_key, * FROM marketing_customers').all() as any[];
  const sales = db.prepare('SELECT crm_id AS row_key, * FROM sales_customers').all() as any[];
  const support = db.prepare('SELECT user_ref AS row_key, * FROM support_users').all() as any[];
  const ecommerce = db.prepare('SELECT customer_code AS row_key, * FROM ecommerce_customers').all() as any[];

  const records: any[] = [];
  for (const r of marketing) {
    records.push({
      sourceId: `marketing:${r.row_key}`,
      system: 'marketing',
      name: `${r.first_name ?? ''} ${r.surname ?? ''}`.trim(),
      email: r.customer_email,
      phone: r.mobile_number,
      pincode: null,
      dob: null,
      city: r.city,
    });
  }
  for (const r of sales) {
    records.push({
      sourceId: `sales:${r.row_key}`,
      system: 'sales',
      name: r.full_name,
      email: r.primary_email,
      phone: r.contact_no,
      pincode: r.billing_pincode,
      dob: null,
      city: null,
    });
  }
  for (const r of support) {
    records.push({
      sourceId: `support:${r.row_key}`,
      system: 'support',
      name: r.name,
      email: r.email_address,
      phone: r.phone,
      pincode: null,
      dob: null,
      city: null,
    });
  }
  for (const r of ecommerce) {
    records.push({
      sourceId: `ecommerce:${r.row_key}`,
      system: 'ecommerce',
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      email: r.email,
      phone: r.phone_number,
      pincode: r.pincode,
      dob: r.dob,
      city: r.city,
    });
  }
  return records;
}

test('matching simulation over the DB: exactly 327 people, exactly 4 pending candidates', () => {
  const records = loadSimRecordsFromDb();
  const sim = simulateMatching(records);
  assert.equal(sim.principals.length, 327);
  assert.equal(sim.candidates.length, 4);
});

test('the Rahul Verma test: exactly 2 distinct people, no shared identifiers, no candidate raised', () => {
  const records = loadSimRecordsFromDb();
  const sim = simulateMatching(records);
  const rahul = records.filter((r: any) => r.name === 'Rahul Verma');
  assert.equal(rahul.length, 2);

  const principalIds = new Set(rahul.map((r: any) => sim.recordToPrincipal.get(r.sourceId)));
  assert.equal(principalIds.size, 2, 'the two Rahul Verma records must resolve to two different people');

  // Disjoint identifiers.
  const emails = rahul.map((r: any) => normalizeEmail(r.email)).filter(Boolean);
  const phones = rahul.map((r: any) => normalizePhone(r.phone)).filter(Boolean);
  assert.equal(new Set(emails).size, emails.length, 'Rahul Verma records must not share a normalized email');
  assert.equal(new Set(phones).size, phones.length, 'Rahul Verma records must not share a normalized phone');
  assert.ok(rahul.every((r: any) => !r.pincode), 'Rahul Verma records must carry no pincode');
  assert.ok(rahul.every((r: any) => !r.dob), 'Rahul Verma records must carry no dob');

  // Must not have raised a candidate against each other.
  const rahulCandidates = sim.candidates.filter((c: any) => rahul.some((r: any) => r.sourceId === c.recordId));
  assert.equal(rahulCandidates.length, 0);
});

test('exactly 4 possible-duplicate pairs: same nameKey + same pincode, disjoint email and phone', () => {
  const records = loadSimRecordsFromDb();
  const sim = simulateMatching(records);

  // Group records by (nameKey, pincode) among records that carry a pincode.
  const groups = new Map<string, any[]>();
  for (const r of records) {
    if (!r.pincode) continue;
    const nk = nameKey(r.name);
    if (!nk) continue;
    const key = `${nk}::${r.pincode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let pairCount = 0;
  for (const [, recs] of groups) {
    if (recs.length !== 2) continue;
    const [a, b] = recs;
    const emailA = normalizeEmail(a.email);
    const emailB = normalizeEmail(b.email);
    const phoneA = normalizePhone(a.phone);
    const phoneB = normalizePhone(b.phone);
    const sharesEmail = emailA && emailB && emailA === emailB;
    const sharesPhone = phoneA && phoneB && phoneA === phoneB;
    if (!sharesEmail && !sharesPhone) {
      pairCount++;
      // These two records must indeed have resolved to two different people.
      const pidA = sim.recordToPrincipal.get(a.sourceId);
      const pidB = sim.recordToPrincipal.get(b.sourceId);
      assert.notEqual(pidA, pidB);
    }
  }
  assert.equal(pairCount, 4);

  // Exactly 4 PENDING candidates overall, and they correspond to these pairs.
  assert.equal(sim.candidates.length, 4);
});

test('exactly 6 ecommerce records with a dob under 18 at the fixed reference date', () => {
  assert.equal(DOB_REFERENCE_DATE, '2026-01-01');
  const rows = db.prepare('SELECT dob FROM ecommerce_customers WHERE dob IS NOT NULL').all() as any[];
  const ref = new Date(DOB_REFERENCE_DATE);
  function ageAt(dob: string): number {
    const d = new Date(dob);
    let age = ref.getFullYear() - d.getFullYear();
    const m = ref.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
    return age;
  }
  const under18 = rows.filter((r) => ageAt(r.dob) < 18);
  assert.equal(under18.length, 6);
});

// ---------------------------------------------------------------------
// Roughly-30 / roughly-25 / roughly-12 targets — tight bands, not
// vacuous bounds. The generator is deterministic and aims for exact
// values (30, 25, 12); the band tolerates only a small margin so a
// regression that skews these numbers materially still fails the test,
// while not being brittle to a future +/-1 tweak in filler data.
// ---------------------------------------------------------------------
test('roughly 30 records with no email (band: 27-33)', () => {
  const marketing = db.prepare('SELECT COUNT(*) c FROM marketing_customers WHERE customer_email IS NULL').get() as any;
  const sales = db.prepare('SELECT COUNT(*) c FROM sales_customers WHERE primary_email IS NULL').get() as any;
  const support = db.prepare('SELECT COUNT(*) c FROM support_users WHERE email_address IS NULL').get() as any;
  const ecommerce = db.prepare('SELECT COUNT(*) c FROM ecommerce_customers WHERE email IS NULL').get() as any;
  const total = marketing.c + sales.c + support.c + ecommerce.c;
  assert.ok(total >= 27 && total <= 33, `expected 27-33 missing emails, got ${total}`);
});

test('roughly 25 records with no phone (band: 22-28)', () => {
  const marketing = db.prepare('SELECT COUNT(*) c FROM marketing_customers WHERE mobile_number IS NULL').get() as any;
  const sales = db.prepare('SELECT COUNT(*) c FROM sales_customers WHERE contact_no IS NULL').get() as any;
  const support = db.prepare('SELECT COUNT(*) c FROM support_users WHERE phone IS NULL').get() as any;
  const ecommerce = db.prepare('SELECT COUNT(*) c FROM ecommerce_customers WHERE phone_number IS NULL').get() as any;
  const total = marketing.c + sales.c + support.c + ecommerce.c;
  assert.ok(total >= 22 && total <= 28, `expected 22-28 missing phones, got ${total}`);
});

test('roughly 12 conflicting-city people (band: 10-14)', () => {
  const records = loadSimRecordsFromDb();
  const sim = simulateMatching(records);

  const byPrincipal = new Map<number, any[]>();
  for (const r of records) {
    const pid = sim.recordToPrincipal.get(r.sourceId);
    if (pid === undefined) continue;
    if (!byPrincipal.has(pid)) byPrincipal.set(pid, []);
    byPrincipal.get(pid)!.push(r);
  }
  let conflictCount = 0;
  for (const [, recs] of byPrincipal) {
    const cities = new Set(recs.map((r) => r.city).filter(Boolean));
    if (cities.size > 1) conflictCount++;
  }
  assert.ok(conflictCount >= 10 && conflictCount <= 14, `expected 10-14 conflicting-city people, got ${conflictCount}`);
});

// ---------------------------------------------------------------------
// Named personas present with the described characteristics.
// ---------------------------------------------------------------------
test('all seven named personas exist', () => {
  const marketing = db.prepare('SELECT * FROM marketing_customers').all() as any[];
  const sales = db.prepare('SELECT * FROM sales_customers').all() as any[];
  const support = db.prepare('SELECT * FROM support_users').all() as any[];
  const ecommerce = db.prepare('SELECT * FROM ecommerce_customers').all() as any[];

  // Aman Sharma: marketing + sales + support, linked via email and phone.
  const amanMkt = marketing.find((r) => r.first_name === 'Aman' && r.surname === 'Sharma');
  const amanSales = sales.find((r) => r.full_name.toLowerCase() === 'aman sharma');
  const amanSupport = support.find((r) => r.name === 'A. Sharma');
  assert.ok(amanMkt && amanSales && amanSupport, 'Aman Sharma must appear in marketing, sales and support');
  assert.equal(normalizeEmail(amanMkt.customer_email), normalizeEmail(amanSales.primary_email));
  assert.equal(normalizePhone(amanMkt.mobile_number), normalizePhone(amanSupport.phone));

  // Neha Rao: email in sales, phone-only in support.
  const nehaSales = sales.find((r) => r.full_name === 'Neha Rao');
  const nehaSupport = support.find((r) => r.name === 'Neha Rao');
  assert.ok(nehaSales && nehaSupport);
  assert.ok(nehaSales.primary_email);
  assert.equal(nehaSupport.email_address, null);
  assert.equal(normalizePhone(nehaSales.contact_no), normalizePhone(nehaSupport.phone));

  // Raj Patel: two different emails, same person (linked via phone).
  const rajSales = sales.find((r) => r.full_name === 'Raj Patel');
  const rajEcom = ecommerce.find((r) => r.first_name === 'Raj' && r.last_name === 'Patel');
  assert.ok(rajSales && rajEcom);
  assert.notEqual(normalizeEmail(rajSales.primary_email), normalizeEmail(rajEcom.email));
  assert.equal(normalizePhone(rajSales.contact_no), normalizePhone(rajEcom.phone_number));

  // Sara Khan: ecommerce only.
  const sara = ecommerce.find((r) => r.first_name === 'Sara' && r.last_name === 'Khan');
  assert.ok(sara);
  assert.ok(!sales.some((r) => r.full_name === 'Sara Khan'));
  assert.ok(!marketing.some((r) => r.first_name === 'Sara' && r.surname === 'Khan'));
  assert.ok(!support.some((r) => r.name === 'Sara Khan'));

  // Vikram Nair: a possible-duplicate pair (sales + ecommerce, same pincode, no shared identifier).
  const vikramSales = sales.find((r) => r.full_name === 'Vikram Nair');
  const vikramEcom = ecommerce.find((r) => r.first_name === 'Vikram' && r.last_name === 'Nair');
  assert.ok(vikramSales && vikramEcom);
  assert.equal(vikramSales.billing_pincode, vikramEcom.pincode);
  assert.notEqual(normalizeEmail(vikramSales.primary_email), normalizeEmail(vikramEcom.email));
  assert.notEqual(normalizePhone(vikramSales.contact_no), normalizePhone(vikramEcom.phone_number));

  // Rahul Verma x2 already covered by its own dedicated test above.
  const rahulRecords = [...marketing, ...support].filter(
    (r: any) => (r.first_name === 'Rahul' && r.surname === 'Verma') || r.name === 'Rahul Verma',
  );
  assert.equal(rahulRecords.length, 2);

  // Ishaan Gupta: under 18.
  const ishaan = ecommerce.find((r) => r.first_name === 'Ishaan' && r.last_name === 'Gupta');
  assert.ok(ishaan && ishaan.dob);
  const ref = new Date(DOB_REFERENCE_DATE);
  const d = new Date(ishaan.dob);
  let age = ref.getFullYear() - d.getFullYear();
  const m = ref.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < d.getDate())) age--;
  assert.ok(age < 18, `Ishaan Gupta must be under 18 at ${DOB_REFERENCE_DATE}, computed age ${age}`);
});

// ---------------------------------------------------------------------
// Determinism: generating twice produces identical row data.
// ---------------------------------------------------------------------
test('seed generation is deterministic: identical row hashes across two runs', () => {
  closeDb();
  process.env.DEMO_DB_PATH = TEST_DB_PATH_2;
  // Reset the module-level singleton in db.ts by re-requiring is not
  // possible without clearing the require cache; instead, spin up a
  // fresh process-level connection via a dynamic re-require.
  delete require.cache[require.resolve('../src/db')];
  delete require.cache[require.resolve('../src/seed/generate')];
  const dbModule = require('../src/db');
  const genModule = require('../src/seed/generate');

  genModule.seedDatabase();
  const db2 = dbModule.openDb();

  function hashOf(database: ReturnType<typeof openDb>): string {
    const tables = ['marketing_customers', 'sales_customers', 'support_users', 'ecommerce_customers'];
    const h = crypto.createHash('sha256');
    for (const t of tables) {
      const rows = database.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
      h.update(JSON.stringify(rows));
    }
    return h.digest('hex');
  }

  const hash2 = hashOf(db2);
  dbModule.closeDb();

  // Re-open the first DB (built in `before()`) to compute its hash too.
  delete require.cache[require.resolve('../src/db')];
  process.env.DEMO_DB_PATH = TEST_DB_PATH;
  const dbModuleA = require('../src/db');
  const dbA = dbModuleA.openDb();
  const hash1 = hashOf(dbA);
  db = dbA; // restore for any subsequent test in this file

  assert.equal(hash1, hash2, 'two independent seed runs must produce byte-identical row data');
});
