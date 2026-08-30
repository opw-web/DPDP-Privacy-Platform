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

before(async () => {
  // Seed 25 marketing rows so pagination has something real to page over.
  const db = openDb();
  const insert = db.prepare(
    `INSERT INTO marketing_customers (customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (let i = 0; i < 25; i++) {
    insert.run(
      `person${i}@example.com`,
      '9876543210',
      'Test',
      `Person${i}`,
      'Mumbai',
      `2024-0${(i % 9) + 1}-01T00:00:00.000Z`,
      'newsletter'
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
  assert.equal(body.total, 25);
  assert.equal(body.page, 1);
  assert.equal(body.limit, 10);
});

test('pagination: last page is short', async () => {
  // 25 rows, limit 10 -> page 3 has 5 rows.
  const res = await app.inject({
    method: 'GET',
    url: '/api/marketing/customers?page=3&limit=10',
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.data.length, 5);
  assert.equal(body.total, 25);
  assert.equal(body.page, 3);
});

test('marketing field names are exactly the messy spec names', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/marketing/customers?limit=1',
    headers: { authorization: `Bearer ${KEYS.marketing}` },
  });
  const body = JSON.parse(res.body);
  const keys = Object.keys(body.data[0]).sort();
  assert.deepEqual(
    keys,
    [
      'campaign_source',
      'city',
      'customer_email',
      'first_name',
      'id',
      'mobile_number',
      'subscribed_on',
      'surname',
    ].sort()
  );
});
