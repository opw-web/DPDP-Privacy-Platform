import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { FastifyInstance } from 'fastify';

// Point at a throwaway test database BEFORE anything imports db.ts's openDb
// so production data/demo.sqlite is never touched by the test suite.
const TEST_DB_PATH = path.join(__dirname, '.tmp-test.sqlite');
for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const f = TEST_DB_PATH + suffix;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
process.env.DEMO_DB_PATH = TEST_DB_PATH;

/* eslint-disable @typescript-eslint/no-var-requires */
const { buildServer } = require('../src/server');
const { openDb, closeDb } = require('../src/db');

const KEYS = {
  marketing: 'demo_marketing_readonly_123',
  sales: 'demo_sales_readonly_456',
  support: 'demo_support_readonly_789',
  ecommerce: 'demo_ecom_readonly_012',
};

const ROUTES: Record<string, string> = {
  marketing: '/api/marketing/customers',
  sales: '/api/sales/customers',
  support: '/api/support/users',
  ecommerce: '/api/ecommerce/customers',
};

let app: FastifyInstance;

// Boundary timestamps for updated_since tests. Chosen far outside the
// 2024-0X-01 range used by the 25 generic marketing rows above, and
// outside any other seed data, so a filtered query against these values
// can only ever match the dedicated boundary rows below — no coincidental
// overlap with unrelated seed rows to account for.
const MKT_BEFORE = '2030-01-01T00:00:00.000Z';
const MKT_BOUNDARY = '2030-06-15T12:00:00.000Z';
const MKT_AFTER = '2030-06-15T12:00:00.001Z';

const SUP_BEFORE = '2031-01-01T00:00:00.000Z';
const SUP_BOUNDARY = '2031-06-15T12:00:00.000Z';
const SUP_AFTER = '2031-06-15T12:00:00.001Z';

const SALES_ROW_COUNT = 7;
const ECOM_ROW_COUNT = 6;

before(async () => {
  const db = openDb();

  // Seed 25 marketing rows so pagination has something real to page over.
  const insertMarketing = db.prepare(
    `INSERT INTO marketing_customers (customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < 25; i++) {
    insertMarketing.run(
      `person${i}@example.com`,
      '9876543210',
      'Test',
      `Person${i}`,
      'Mumbai',
      `2024-0${(i % 9) + 1}-01T00:00:00.000Z`,
      'newsletter'
    );
  }

  // Dedicated boundary rows for the updated_since >= test on marketing.
  insertMarketing.run('mkt-before@example.com', '9000000000', 'Before', 'Boundary', 'Pune', MKT_BEFORE, 'boundary-test');
  insertMarketing.run('mkt-boundary@example.com', '9000000001', 'On', 'Boundary', 'Pune', MKT_BOUNDARY, 'boundary-test');
  insertMarketing.run('mkt-after@example.com', '9000000002', 'After', 'Boundary', 'Pune', MKT_AFTER, 'boundary-test');

  // Dedicated boundary rows for the updated_since >= test on support.
  const insertSupport = db.prepare(
    `INSERT INTO support_users (email_address, phone, name, last_ticket_at, tickets_count)
     VALUES (?, ?, ?, ?, ?)`
  );
  insertSupport.run('sup-before@example.com', '9100000000', 'Before Boundary', SUP_BEFORE, 1);
  insertSupport.run('sup-boundary@example.com', '9100000001', 'On Boundary', SUP_BOUNDARY, 1);
  insertSupport.run('sup-after@example.com', '9100000002', 'After Boundary', SUP_AFTER, 1);

  // Sales has no timestamp column at all — updated_since must be a no-op.
  const insertSales = db.prepare(
    `INSERT INTO sales_customers (primary_email, contact_no, full_name, billing_pincode, account_status, lifetime_value)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < SALES_ROW_COUNT; i++) {
    insertSales.run(`sales${i}@example.com`, '9200000000', `Sales Person${i}`, '400001', 'active', 1000);
  }

  // E-commerce has no modification-timestamp column either (dob is a
  // birth date, not an update time) — updated_since must be a no-op.
  const insertEcom = db.prepare(
    `INSERT INTO ecommerce_customers (email, phone_number, first_name, last_name, dob, address_line_1, city, state, pincode, total_orders, total_spent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < ECOM_ROW_COUNT; i++) {
    insertEcom.run(
      `ecom${i}@example.com`,
      '9300000000',
      'Ecom',
      `Person${i}`,
      '1990-01-01',
      '1 Main St',
      'Mumbai',
      'MH',
      '400001',
      1,
      500
    );
  }

  app = buildServer();
  await app.ready();
});

after(async () => {
  await app.close();
  closeDb();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = TEST_DB_PATH + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

test('/health is public, no auth needed', async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { status: 'ok' });
});

for (const system of Object.keys(ROUTES)) {
  const url = ROUTES[system];
  const correctKey = KEYS[system as keyof typeof KEYS];

  test(`${system}: positive control — correct key succeeds (200)`, async () => {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${correctKey}` },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(Array.isArray(body.data));
    assert.equal(typeof body.total, 'number');
    assert.equal(body.page, 1);
    assert.equal(body.limit, 100);
  });

  test(`${system}: missing key returns 401 (not 404/500 — route exists, control above proves it)`, async () => {
    const res = await app.inject({ method: 'GET', url });
    assert.equal(res.statusCode, 401);
  });

  test(`${system}: garbage key returns 401`, async () => {
    const res = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer not-a-real-key' },
    });
    assert.equal(res.statusCode, 401);
  });

  // Cross-system key isolation: every OTHER system's valid key must be
  // rejected here with 401. This is the twelve-combination check.
  for (const otherSystem of Object.keys(KEYS)) {
    if (otherSystem === system) continue;
    test(`${system}: key from '${otherSystem}' is rejected (401), does not open this route`, async () => {
      const res = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${KEYS[otherSystem as keyof typeof KEYS]}` },
      });
      assert.equal(res.statusCode, 401);
    });
  }

  // 405 checks: prove the route EXISTS (positive control above already
  // shows GET+correct-key succeeds on this exact URL) and that it rejects
  // non-GET methods with 405, not 404 or 401 — even with a correct key,
  // and even with no key at all (method gate runs before auth).
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
    test(`${system}: ${method} with correct key returns 405 (route exists, method rejected)`, async () => {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${correctKey}` },
      });
      assert.equal(res.statusCode, 405);
    });

    test(`${system}: ${method} with no key returns 405, not 401`, async () => {
      const res = await app.inject({ method, url });
      assert.equal(res.statusCode, 405);
    });
  }
}

test('pagination: limit=10 returns exactly 10 rows and correct total', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/marketing/customers?page=1&limit=10',
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.length, 10);
  // 25 generic rows + 3 dedicated updated_since boundary rows seeded above.
  assert.equal(body.total, 28);
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
});

test('pagination: last page is short', async () => {
  // 28 rows (25 generic + 3 boundary), limit 10 -> page 3 has 8 rows.
  const res = await app.inject({
    method: 'GET',
    url: '/api/marketing/customers?page=3&limit=10',
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.length, 8);
  assert.equal(body.total, 28);
  assert.equal(body.page, 3);
});

const EXPECTED_FIELDS: Record<string, string[]> = {
  marketing: [
    'id',
    'customer_email',
    'mobile_number',
    'first_name',
    'surname',
    'city',
    'subscribed_on',
    'campaign_source',
  ],
  sales: [
    'crm_id',
    'primary_email',
    'contact_no',
    'full_name',
    'billing_pincode',
    'account_status',
    'lifetime_value',
  ],
  support: ['user_ref', 'email_address', 'phone', 'name', 'last_ticket_at', 'tickets_count'],
  ecommerce: [
    'customer_code',
    'email',
    'phone_number',
    'first_name',
    'last_name',
    'dob',
    'address_line_1',
    'city',
    'state',
    'pincode',
    'total_orders',
    'total_spent',
  ],
};

for (const system of Object.keys(ROUTES)) {
  test(`${system}: field names are exactly the messy spec names`, async () => {
    const res = await app.inject({
      method: 'GET',
      url: `${ROUTES[system]}?limit=1`,
      headers: { authorization: `Bearer ${KEYS[system as keyof typeof KEYS]}` },
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.data.length >= 1, `${system} needs at least one seeded row to check field names`);
    const keys = Object.keys(body.data[0]).sort();
    assert.deepEqual(keys, [...EXPECTED_FIELDS[system]].sort());
  });
}

// --- updated_since: marketing (real column, subscribed_on) -----------------
// Boundary rows: MKT_BEFORE < MKT_BOUNDARY < MKT_AFTER. If the comparison
// were `subscribed_on > ?` instead of `>= ?`, the record dated exactly
// MKT_BOUNDARY would be wrongly excluded and `total` would read 1 instead
// of 2, and the boundary row's email would be missing from `data`.

test('marketing updated_since: positive control — unfiltered call includes all boundary rows', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/marketing/customers?limit=1000',
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const emails = body.data.map((r: { customer_email: string }) => r.customer_email);
  assert.ok(emails.includes('mkt-before@example.com'));
  assert.ok(emails.includes('mkt-boundary@example.com'));
  assert.ok(emails.includes('mkt-after@example.com'));
});

test('marketing updated_since: record exactly on the boundary is included (>=, not >)', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/marketing/customers?updated_since=${encodeURIComponent(MKT_BOUNDARY)}&limit=1000`,
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const emails = body.data.map((r: { customer_email: string }) => r.customer_email);

  // Included: exactly-on-boundary and after. Excluded: strictly before.
  assert.ok(emails.includes('mkt-boundary@example.com'), 'boundary row must be included under >=');
  assert.ok(emails.includes('mkt-after@example.com'));
  assert.ok(!emails.includes('mkt-before@example.com'), 'before-boundary row must be excluded');

  // total must reflect the filtered count (2: boundary + after), computed
  // by the same WHERE clause as the data query, not the unfiltered count
  // or just the page size.
  assert.equal(body.total, 2);
});

// --- updated_since: support (real column, last_ticket_at) -------------------

test('support updated_since: positive control — unfiltered call includes all boundary rows', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/support/users?limit=1000',
    headers: { authorization: `Bearer ${KEYS.support}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const emails = body.data.map((r: { email_address: string }) => r.email_address);
  assert.ok(emails.includes('sup-before@example.com'));
  assert.ok(emails.includes('sup-boundary@example.com'));
  assert.ok(emails.includes('sup-after@example.com'));
});

test('support updated_since: record exactly on the boundary is included (>=, not >)', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/support/users?updated_since=${encodeURIComponent(SUP_BOUNDARY)}&limit=1000`,
    headers: { authorization: `Bearer ${KEYS.support}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  const emails = body.data.map((r: { email_address: string }) => r.email_address);

  assert.ok(emails.includes('sup-boundary@example.com'), 'boundary row must be included under >=');
  assert.ok(emails.includes('sup-after@example.com'));
  assert.ok(!emails.includes('sup-before@example.com'), 'before-boundary row must be excluded');
  assert.equal(body.total, 2);
});

// --- updated_since: sales and ecommerce (no timestamp column — no-op) ------

test('sales updated_since: positive control — full row count with no filter', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/sales/customers?limit=1000',
    headers: { authorization: `Bearer ${KEYS.sales}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.total, SALES_ROW_COUNT);
});

test('sales updated_since: parameter is genuinely ignored — same total with an arbitrary value', async () => {
  const withoutFilter = await app.inject({
    method: 'GET',
    url: '/api/sales/customers?limit=1000',
    headers: { authorization: `Bearer ${KEYS.sales}` },
  });
  const withFilter = await app.inject({
    method: 'GET',
    // A far-future date that would exclude every row if this were honoured
    // as a real filter — proves "ignored" rather than "coincidentally satisfied".
    url: '/api/sales/customers?updated_since=2099-01-01T00:00:00.000Z&limit=1000',
    headers: { authorization: `Bearer ${KEYS.sales}` },
  });
  assert.equal(withoutFilter.statusCode, 200);
  assert.equal(withFilter.statusCode, 200);
  const bodyWithout = JSON.parse(withoutFilter.body);
  const bodyWith = JSON.parse(withFilter.body);
  assert.equal(bodyWith.total, bodyWithout.total);
  assert.equal(bodyWith.total, SALES_ROW_COUNT);
  assert.equal(bodyWith.data.length, bodyWithout.data.length);
});

test('ecommerce updated_since: positive control — full row count with no filter', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/ecommerce/customers?limit=1000',
    headers: { authorization: `Bearer ${KEYS.ecommerce}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.total, ECOM_ROW_COUNT);
});

test('ecommerce updated_since: parameter is genuinely ignored — same total with an arbitrary value', async () => {
  const withoutFilter = await app.inject({
    method: 'GET',
    url: '/api/ecommerce/customers?limit=1000',
    headers: { authorization: `Bearer ${KEYS.ecommerce}` },
  });
  const withFilter = await app.inject({
    method: 'GET',
    url: '/api/ecommerce/customers?updated_since=2099-01-01T00:00:00.000Z&limit=1000',
    headers: { authorization: `Bearer ${KEYS.ecommerce}` },
  });
  assert.equal(withoutFilter.statusCode, 200);
  assert.equal(withFilter.statusCode, 200);
  const bodyWithout = JSON.parse(withoutFilter.body);
  const bodyWith = JSON.parse(withFilter.body);
  assert.equal(bodyWith.total, bodyWithout.total);
  assert.equal(bodyWith.total, ECOM_ROW_COUNT);
  assert.equal(bodyWith.data.length, bodyWithout.data.length);
});
