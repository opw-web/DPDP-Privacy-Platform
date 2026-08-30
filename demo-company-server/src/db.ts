import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Schema for the four unconnected "systems" of Acme Retail Pvt Ltd.
 * Field names are DELIBERATELY messy/inconsistent across tables — this is
 * the point of the demo server (see spec §4.8). Do not "clean them up".
 *
 * Task 10's generator populates these tables directly via openDb().
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS marketing_customers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_email  TEXT,
  mobile_number   TEXT,
  first_name      TEXT,
  surname         TEXT,
  city            TEXT,
  subscribed_on   TEXT,
  campaign_source TEXT
);

CREATE TABLE IF NOT EXISTS sales_customers (
  crm_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  primary_email   TEXT,
  contact_no      TEXT,
  full_name       TEXT,
  billing_pincode TEXT,
  account_status  TEXT,
  lifetime_value  REAL
);

CREATE TABLE IF NOT EXISTS support_users (
  user_ref        INTEGER PRIMARY KEY AUTOINCREMENT,
  email_address   TEXT,
  phone           TEXT,
  name            TEXT,
  last_ticket_at  TEXT,
  tickets_count   INTEGER
);

CREATE TABLE IF NOT EXISTS ecommerce_customers (
  customer_code    INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT,
  phone_number     TEXT,
  first_name       TEXT,
  last_name        TEXT,
  dob              TEXT,
  address_line_1   TEXT,
  city             TEXT,
  state            TEXT,
  pincode          TEXT,
  total_orders     INTEGER,
  total_spent      REAL
);
`;

let dbInstance: Database.Database | null = null;

/**
 * Opens (and lazily initialises) the shared SQLite database at
 * data/demo.sqlite, relative to the project root. Safe to call repeatedly —
 * returns the same connection.
 */
export function openDb(): Database.Database {
  if (dbInstance) return dbInstance;

  // DEMO_DB_PATH lets tests point at a throwaway file instead of the real
  // data/demo.sqlite. Production/dev always use the default path.
  const dbPath = process.env.DEMO_DB_PATH
    ? path.resolve(process.env.DEMO_DB_PATH)
    : path.join(__dirname, '..', 'data', 'demo.sqlite');

  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
