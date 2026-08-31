/**
 * Deterministic generator for the Acme Retail demo dataset.
 *
 * Produces exactly 500 raw records across marketing_customers,
 * sales_customers, support_users and ecommerce_customers that collapse to
 * exactly 327 distinct people once the platform's identity-resolution
 * rules (spec §4.4) run over them. See personas.ts for the 7 named
 * personas and the hand-authored traps (2x "Rahul Verma", 4
 * possible-duplicate pairs). This file builds everything else: ~312
 * generic filler people (169 appearing in 2 systems, 143 in exactly 1),
 * deterministically, from a single seed.
 *
 * IMPORTANT: every random choice below goes through `rng` (mulberry32,
 * see rng.ts). Never use Math.random(), Date.now(), or unseeded UUIDs
 * here — `npm run seed` run twice must produce byte-identical row data.
 *
 * Fixed reference date for age/DOB calculations: DOB_REFERENCE_DATE
 * ('2026-01-01', declared in personas.ts) — NOT the wall-clock date, so
 * the "exactly 6 under-18" count in the dataset cannot drift as real
 * time passes.
 */
import { openDb, closeDb } from '../db';
import { Rng } from './rng';
import {
  personas,
  DOB_REFERENCE_DATE,
  RESERVED_NAMES,
  type AnyRecord,
} from './personas';
import { simulateMatching, type SimRecord } from './match';

export const SEED = 20260830;

// ---------------------------------------------------------------------
// Field-name maps per system (must match db.ts's schema exactly).
// ---------------------------------------------------------------------
type System = 'marketing' | 'sales' | 'support' | 'ecommerce';

const EMAIL_FIELD: Record<System, string> = {
  marketing: 'customer_email',
  sales: 'primary_email',
  support: 'email_address',
  ecommerce: 'email',
};
const PHONE_FIELD: Record<System, string> = {
  marketing: 'mobile_number',
  sales: 'contact_no',
  support: 'phone',
  ecommerce: 'phone_number',
};

// ---------------------------------------------------------------------
// Name / city pools for generic filler. Reserved (first,last) combos
// used by personas.ts are excluded so no accidental nameKey collision
// with a hand-authored trap/persona is ever possible.
// ---------------------------------------------------------------------
const FIRST_NAMES = [
  'Aditya', 'Ananya', 'Arjun', 'Bhavna', 'Chetan', 'Deepa', 'Farhan', 'Gauri', 'Harish', 'Isha',
  'Jatin', 'Kavya', 'Lalit', 'Meera', 'Nikhil', 'Ojas', 'Pooja', 'Qasim', 'Rohan', 'Sunita',
  'Tanvi', 'Uday', 'Varsha', 'Wasim', 'Yamini', 'Zara', 'Abhinav', 'Bhavya', 'Chirag', 'Divesh',
  'Esha', 'Faisal', 'Gopal', 'Hema', 'Imran', 'Jyoti', 'Kunal', 'Latika', 'Manoj', 'Naina',
  'Omkar', 'Preeti', 'Qadir', 'Ritika', 'Sameer', 'Tara', 'Umesh', 'Vidya', 'Waris', 'Yash',
];
const LAST_NAMES = [
  'Agarwal', 'Bose', 'Chatterjee', 'Desai', 'Fernandes', 'Ghosh', 'Hegde', 'Iyengar', 'Joshi', 'Kapoor',
  'Lal', 'Mehta', 'Naidu', 'Oberoi', 'Pillai', 'Qureshi', 'Rao', 'Shah', 'Tiwari', 'Upadhyay',
  'Verma', 'Wadhwa', 'Yadav', 'Zaveri', 'Anand', 'Bhatt', 'Chawla', 'Dutta', 'Elango', 'Farooqui',
  'Gowda', 'Hussain', 'Ismail', 'Jain', 'Khanna', 'Lamba', 'Mishra', 'Nanda', 'Ojha', 'Pandey',
  'Reddy', 'Sinha', 'Trivedi', 'Unni', 'Vora', 'Waghmare', 'Xavier', 'Yogi', 'Zutshi', 'Basu',
];

// city/pincode pairs NOT used anywhere in personas.ts (distinct from the
// 4 reserved pincodes and from persona cities' exact pincodes).
const CITY_POOL: { city: string; pincode: string }[] = [
  { city: 'Mumbai', pincode: '400002' },
  { city: 'Delhi', pincode: '110002' },
  { city: 'Bengaluru', pincode: '560011' },
  { city: 'Chennai', pincode: '600002' },
  { city: 'Kolkata', pincode: '700002' },
  { city: 'Hyderabad', pincode: '500002' },
  { city: 'Pune', pincode: '411002' },
  { city: 'Ahmedabad', pincode: '380002' },
  { city: 'Jaipur', pincode: '302001' },
  { city: 'Lucknow', pincode: '226001' },
  { city: 'Chandigarh', pincode: '160001' },
  { city: 'Bhopal', pincode: '462001' },
  { city: 'Nagpur', pincode: '440001' },
  { city: 'Indore', pincode: '452001' },
  { city: 'Patna', pincode: '800001' },
  { city: 'Surat', pincode: '395001' },
  { city: 'Kanpur', pincode: '208001' },
  { city: 'Nashik', pincode: '422001' },
  { city: 'Vadodara', pincode: '390001' },
  { city: 'Coimbatore', pincode: '641001' },
];

const CAMPAIGN_SOURCES = ['google_ads', 'facebook_ads', 'referral', 'email_campaign', 'organic'];
const ACCOUNT_STATUSES = ['active', 'lapsed', 'trial'];
const STATES: Record<string, string> = {
  Mumbai: 'Maharashtra', Pune: 'Maharashtra', Nashik: 'Maharashtra',
  Delhi: 'Delhi', Bengaluru: 'Karnataka', Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu',
  Kolkata: 'West Bengal', Hyderabad: 'Telangana', Ahmedabad: 'Gujarat', Surat: 'Gujarat',
  Vadodara: 'Gujarat', Jaipur: 'Rajasthan', Lucknow: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh',
  Chandigarh: 'Chandigarh', Bhopal: 'Madhya Pradesh', Indore: 'Madhya Pradesh',
  Nagpur: 'Maharashtra', Patna: 'Bihar',
};

// ---------------------------------------------------------------------
// Intermediate representation: a built record plus which of its
// email/phone fields (if any) must never be nulled because it's the
// identifier that links this person's records together.
// ---------------------------------------------------------------------
interface Built {
  system: System;
  fields: Record<string, string | number | null>;
  protectedFields: Set<string>;
  personLabel: string;
  isPersona: boolean;
}

function personaToBuilt(label: string, rec: AnyRecord, protectedFields: string[]): Built {
  const { system, ...rest } = rec as any;
  return { system, fields: rest, protectedFields: new Set(protectedFields), personLabel: label, isPersona: true };
}

function phoneVariant(rng: Rng, digits10: string): string {
  // digits10 is a bare 10-digit Indian mobile number.
  const variant = rng.int(5);
  switch (variant) {
    case 0:
      return `${digits10.slice(0, 5)} ${digits10.slice(5)}`; // "98765 43210"
    case 1:
      return `+91-${digits10.slice(0, 5)}-${digits10.slice(5)}`; // "+91-98765-43210"
    case 2:
      return `0${digits10}`; // "09876543210"
    case 3:
      return `91${digits10}`; // "919876543210"
    default:
      return digits10; // "9876543210"
  }
}

function formatDob(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function generateDataset(seed: number = SEED): Built[] {
  const rng = new Rng(seed);

  const usedNames = new Set<string>(RESERVED_NAMES);
  function nextUniqueName(): { first: string; last: string } {
    // Deterministically walk the (first,last) grid until an unused,
    // non-reserved combo is found. With 50x50=2500 combos and ~312
    // needed, collisions are rare and resolved by advancing the RNG.
    for (;;) {
      const first = rng.pick(FIRST_NAMES);
      const last = rng.pick(LAST_NAMES);
      const key = `${first.toLowerCase()} ${last.toLowerCase()}`;
      if (!usedNames.has(key)) {
        usedNames.add(key);
        return { first, last };
      }
    }
  }

  let emailCounter = 0;
  function nextEmail(first: string, last: string): string {
    emailCounter += 1;
    return `${first.toLowerCase()}.${last.toLowerCase()}.${emailCounter}@example.com`;
  }

  let phoneCounter = 9820000000; // well clear of the 98765xxxxx / 98765000xx ranges used by personas
  function nextPhoneDigits(): string {
    phoneCounter += 1;
    return String(phoneCounter);
  }

  function adultDob(): string {
    const year = 1970 + rng.int(2005 - 1970 + 1); // 1970..2005 -> always 18+ vs 2026-01-01
    const month = 1 + rng.int(12);
    const day = 1 + rng.int(28);
    return formatDob(year, month, day);
  }

  function childDob(): string {
    // Born 2009..2015 -> comfortably under 18 as of DOB_REFERENCE_DATE (2026-01-01).
    const year = 2009 + rng.int(2015 - 2009 + 1);
    const month = 1 + rng.int(12);
    const day = 1 + rng.int(28);
    return formatDob(year, month, day);
  }

  // --- 1. Personas (hand-authored, fixed) -----------------------------
  const built: Built[] = [];
  for (const p of personas) {
    for (const rec of p.records) {
      let protectedFields: string[] = [];
      if (p.label.startsWith('Aman Sharma')) {
        if (rec.system === 'marketing') protectedFields = ['customer_email', 'mobile_number'];
        if (rec.system === 'sales') protectedFields = ['primary_email'];
        if (rec.system === 'support') protectedFields = ['phone'];
      } else if (p.label.startsWith('Neha Rao')) {
        if (rec.system === 'sales') protectedFields = ['contact_no'];
        if (rec.system === 'support') protectedFields = ['phone'];
      } else if (p.label.startsWith('Raj Patel')) {
        if (rec.system === 'sales') protectedFields = ['contact_no'];
        if (rec.system === 'ecommerce') protectedFields = ['phone_number'];
      }
      built.push(personaToBuilt(p.label, rec, protectedFields));
    }
  }

  // --- 2. Generic 2-way people (169 total) ----------------------------
  // 12 are {marketing, ecommerce} with a deliberately conflicting city.
  // The remaining 157 are spread across the other 5 system pairs.
  const CONFLICT_PAIR_COUNT = 12;
  const OTHER_PAIRS: [System, System][] = [
    ['marketing', 'sales'],
    ['marketing', 'support'],
    ['sales', 'support'],
    ['sales', 'ecommerce'],
    ['support', 'ecommerce'],
  ];
  const TWO_WAY_TOTAL = 169;
  const OTHER_TWO_WAY_TOTAL = TWO_WAY_TOTAL - CONFLICT_PAIR_COUNT; // 157

  let twoWayConflictsBuilt = 0;
  let otherTwoWayBuilt = 0;
  const twoWayPairAssignment: [System, System][] = [];
  for (let i = 0; i < CONFLICT_PAIR_COUNT; i++) twoWayPairAssignment.push(['marketing', 'ecommerce']);
  for (let i = 0; i < OTHER_TWO_WAY_TOTAL; i++) twoWayPairAssignment.push(OTHER_PAIRS[i % OTHER_PAIRS.length]);
  const shuffledTwoWay = rng.shuffle(twoWayPairAssignment);

  // Ensure exactly 5 more under-18 ecommerce records land in the generic
  // singleton pool (Ishaan is the 6th, from personas). Tracked below.
  const CHILD_DOB_TARGET = 6;
  let childDobAssigned = 1; // Ishaan already counted

  function buildLinkedPair(sysA: System, sysB: System, isConflictPair: boolean): void {
    const { first, last } = nextUniqueName();
    const linkOnEmail = rng.chance(0.5);
    const digits = nextPhoneDigits();
    const email = nextEmail(first, last);

    const recA: Record<string, string | number | null> = {};
    const recB: Record<string, string | number | null> = {};
    const protectedA = new Set<string>();
    const protectedB = new Set<string>();

    if (linkOnEmail) {
      recA[EMAIL_FIELD[sysA]] = email;
      recB[EMAIL_FIELD[sysB]] = email;
      protectedA.add(EMAIL_FIELD[sysA]);
      protectedB.add(EMAIL_FIELD[sysB]);
    } else {
      recA[PHONE_FIELD[sysA]] = phoneVariant(rng, digits);
      recB[PHONE_FIELD[sysB]] = phoneVariant(rng, digits);
      protectedA.add(PHONE_FIELD[sysA]);
      protectedB.add(PHONE_FIELD[sysB]);
    }

    fillSystemRecord(recA, sysA, first, last, { forcedCity: undefined });
    fillSystemRecord(recB, sysB, first, last, { forcedCity: undefined });

    if (isConflictPair) {
      // Force a marketing/ecommerce city mismatch (both systems have a
      // `city` column). Picks two distinct pool entries.
      const cityA = rng.pick(CITY_POOL);
      let cityB = rng.pick(CITY_POOL);
      while (cityB.city === cityA.city) cityB = rng.pick(CITY_POOL);
      if (sysA === 'marketing') (recA as any).city = cityA.city;
      if (sysB === 'ecommerce') {
        (recB as any).city = cityB.city;
        (recB as any).state = STATES[cityB.city] ?? 'Other';
        (recB as any).pincode = cityB.pincode;
      }
    }

    const label = `${first} ${last} (2-way ${sysA}+${sysB})`;
    built.push({ system: sysA, fields: recA, protectedFields: protectedA, personLabel: label, isPersona: false });
    built.push({ system: sysB, fields: recB, protectedFields: protectedB, personLabel: label, isPersona: false });
  }

  for (const [sysA, sysB] of shuffledTwoWay) {
    const isConflict = sysA === 'marketing' && sysB === 'ecommerce';
    buildLinkedPair(sysA, sysB, isConflict);
    if (isConflict) twoWayConflictsBuilt++;
    else otherTwoWayBuilt++;
  }

  // --- 3. Generic singleton people (143 total) ------------------------
  const SINGLETON_TOTAL = 143;
  const SYSTEMS: System[] = ['marketing', 'sales', 'support', 'ecommerce'];
  const singletonSystems: System[] = [];
  for (let i = 0; i < SINGLETON_TOTAL; i++) singletonSystems.push(SYSTEMS[i % SYSTEMS.length]);
  const shuffledSingletons = rng.shuffle(singletonSystems);

  for (const sys of shuffledSingletons) {
    const { first, last } = nextUniqueName();
    const rec: Record<string, string | number | null> = {};
    let wantsChildDob = false;
    if (sys === 'ecommerce' && childDobAssigned < CHILD_DOB_TARGET) {
      wantsChildDob = true;
      childDobAssigned++;
    }
    fillSystemRecord(rec, sys, first, last, {});
    if (sys === 'ecommerce') {
      (rec as any).dob = wantsChildDob ? childDob() : adultDob();
    }
    const label = `${first} ${last} (singleton ${sys})`;
    built.push({ system: sys, fields: rec, protectedFields: new Set(), personLabel: label, isPersona: false });
  }

  function fillSystemRecord(
    rec: Record<string, string | number | null>,
    sys: System,
    first: string,
    last: string,
    opts: { forcedCity?: string },
  ): void {
    const place = rng.pick(CITY_POOL);
    if (!(EMAIL_FIELD[sys] in rec)) rec[EMAIL_FIELD[sys]] = nextEmail(first, last);
    if (!(PHONE_FIELD[sys] in rec)) rec[PHONE_FIELD[sys]] = phoneVariant(rng, nextPhoneDigits());

    if (sys === 'marketing') {
      rec.first_name = first;
      rec.surname = last;
      rec.city = opts.forcedCity ?? place.city;
      rec.subscribed_on = formatDob(2022 + rng.int(4), 1 + rng.int(12), 1 + rng.int(28));
      rec.campaign_source = rng.pick(CAMPAIGN_SOURCES);
    } else if (sys === 'sales') {
      rec.full_name = `${first} ${last}`;
      rec.billing_pincode = place.pincode;
      rec.account_status = rng.pick(ACCOUNT_STATUSES);
      rec.lifetime_value = Math.round(rng.next() * 60000 * 100) / 100;
    } else if (sys === 'support') {
      rec.name = `${first} ${last}`;
      rec.last_ticket_at = formatDob(2023 + rng.int(3), 1 + rng.int(12), 1 + rng.int(28));
      rec.tickets_count = rng.int(10);
    } else if (sys === 'ecommerce') {
      rec.first_name = first;
      rec.last_name = last;
      rec.dob = adultDob();
      rec.address_line_1 = `${1 + rng.int(200)} ${rng.pick(['MG Road', 'Park Street', 'Ring Road', 'Station Road', 'Main Bazaar'])}`;
      rec.city = opts.forcedCity ?? place.city;
      rec.state = STATES[place.city] ?? 'Other';
      rec.pincode = place.pincode;
      rec.total_orders = rng.int(15);
      rec.total_spent = Math.round(rng.next() * 40000 * 100) / 100;
    }
  }

  // Sanity checks on the internal design constants (fail loudly at
  // generation time rather than shipping a silently-wrong dataset).
  if (twoWayConflictsBuilt !== CONFLICT_PAIR_COUNT) {
    throw new Error(`Expected ${CONFLICT_PAIR_COUNT} marketing+ecommerce conflict pairs, built ${twoWayConflictsBuilt}`);
  }
  if (otherTwoWayBuilt !== OTHER_TWO_WAY_TOTAL) {
    throw new Error(`Expected ${OTHER_TWO_WAY_TOTAL} other 2-way pairs, built ${otherTwoWayBuilt}`);
  }
  if (childDobAssigned !== CHILD_DOB_TARGET) {
    throw new Error(`Expected exactly ${CHILD_DOB_TARGET} under-18 DOBs, assigned ${childDobAssigned}`);
  }

  // --- 4. Missing-email / missing-phone pass --------------------------
  // Target totals across the WHOLE dataset (personas included). Personas
  // already contribute a small fixed baseline of nulls by design.
  const TARGET_MISSING_EMAIL = 30;
  const TARGET_MISSING_PHONE = 25;

  function countNulls(field: (s: System) => string): number {
    let n = 0;
    for (const b of built) {
      const col = field(b.system);
      if (b.fields[col] === null || b.fields[col] === undefined) n++;
    }
    return n;
  }

  const baselineMissingEmail = countNulls((s) => EMAIL_FIELD[s]);
  const baselineMissingPhone = countNulls((s) => PHONE_FIELD[s]);

  const emailSlots: Built[] = built.filter(
    (b) => !b.isPersona && !b.protectedFields.has(EMAIL_FIELD[b.system]) && b.fields[EMAIL_FIELD[b.system]] != null,
  );
  const phoneSlots: Built[] = built.filter(
    (b) => !b.isPersona && !b.protectedFields.has(PHONE_FIELD[b.system]) && b.fields[PHONE_FIELD[b.system]] != null,
  );

  const emailToNull = Math.max(0, TARGET_MISSING_EMAIL - baselineMissingEmail);
  const phoneToNull = Math.max(0, TARGET_MISSING_PHONE - baselineMissingPhone);

  const shuffledEmailSlots = rng.shuffle(emailSlots);
  const shuffledPhoneSlots = rng.shuffle(phoneSlots);

  for (let i = 0; i < emailToNull && i < shuffledEmailSlots.length; i++) {
    const b = shuffledEmailSlots[i];
    b.fields[EMAIL_FIELD[b.system]] = null;
  }
  for (let i = 0; i < phoneToNull && i < shuffledPhoneSlots.length; i++) {
    const b = shuffledPhoneSlots[i];
    b.fields[PHONE_FIELD[b.system]] = null;
  }

  return built;
}

// ---------------------------------------------------------------------
// Self-check: replay the platform's matching rules over the generated
// dataset and confirm it lands on the targets before it's ever inserted.
// ---------------------------------------------------------------------
export function toSimRecords(built: Built[]): SimRecord[] {
  return built.map((b, idx) => {
    const sourceId = `${b.system}:${idx}`;
    const name =
      b.system === 'marketing'
        ? `${b.fields.first_name ?? ''} ${b.fields.surname ?? ''}`.trim()
        : b.system === 'sales'
          ? String(b.fields.full_name ?? '')
          : b.system === 'support'
            ? String(b.fields.name ?? '')
            : `${b.fields.first_name ?? ''} ${b.fields.last_name ?? ''}`.trim();
    const email = (b.fields[EMAIL_FIELD[b.system]] as string | null) ?? null;
    const phone = (b.fields[PHONE_FIELD[b.system]] as string | null) ?? null;
    const pincode =
      b.system === 'sales' ? (b.fields.billing_pincode as string | null) ?? null
      : b.system === 'ecommerce' ? (b.fields.pincode as string | null) ?? null
      : null;
    const dob = b.system === 'ecommerce' ? (b.fields.dob as string | null) ?? null : null;
    return { sourceId, system: b.system, name, email, phone, pincode, dob };
  });
}

export function selfCheck(built: Built[]): void {
  const sim = simulateMatching(toSimRecords(built));
  const total = built.length;
  const people = sim.principals.length;
  const candidates = sim.candidates.length;

  if (total !== 500) throw new Error(`Expected 500 records, generated ${total}`);
  if (people < 323 || people > 331) {
    throw new Error(`Expected 327 +/- 4 people, simulation produced ${people}`);
  }
  if (candidates !== 4) {
    throw new Error(`Expected exactly 4 pending candidates, simulation produced ${candidates}`);
  }

  // Rahul Verma must never merge and must never even become a candidate.
  const rahulPrincipalIds = new Set<number>();
  toSimRecords(built).forEach((r) => {
    if (r.name === 'Rahul Verma') {
      const pid = sim.recordToPrincipal.get(r.sourceId);
      if (pid !== undefined) rahulPrincipalIds.add(pid);
    }
  });
  if (rahulPrincipalIds.size !== 2) {
    throw new Error(`Expected exactly 2 distinct Rahul Verma principals, got ${rahulPrincipalIds.size}`);
  }
  const rahulCandidates = sim.candidates.filter((c) => {
    const rec = toSimRecords(built).find((r) => r.sourceId === c.recordId);
    return rec?.name === 'Rahul Verma';
  });
  if (rahulCandidates.length !== 0) {
    throw new Error('Rahul Verma records must not raise a match candidate');
  }
}

// ---------------------------------------------------------------------
// DB insertion
// ---------------------------------------------------------------------
export function seedDatabase(seed: number = SEED): { total: number } {
  const built = generateDataset(seed);
  selfCheck(built);

  const db = openDb();
  const reset = db.transaction(() => {
    for (const table of ['marketing_customers', 'sales_customers', 'support_users', 'ecommerce_customers']) {
      db.prepare(`DELETE FROM ${table}`).run();
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(table);
    }
  });
  reset();

  const insertMarketing = db.prepare(
    `INSERT INTO marketing_customers (customer_email, mobile_number, first_name, surname, city, subscribed_on, campaign_source)
     VALUES (@customer_email, @mobile_number, @first_name, @surname, @city, @subscribed_on, @campaign_source)`,
  );
  const insertSales = db.prepare(
    `INSERT INTO sales_customers (primary_email, contact_no, full_name, billing_pincode, account_status, lifetime_value)
     VALUES (@primary_email, @contact_no, @full_name, @billing_pincode, @account_status, @lifetime_value)`,
  );
  const insertSupport = db.prepare(
    `INSERT INTO support_users (email_address, phone, name, last_ticket_at, tickets_count)
     VALUES (@email_address, @phone, @name, @last_ticket_at, @tickets_count)`,
  );
  const insertEcommerce = db.prepare(
    `INSERT INTO ecommerce_customers (email, phone_number, first_name, last_name, dob, address_line_1, city, state, pincode, total_orders, total_spent)
     VALUES (@email, @phone_number, @first_name, @last_name, @dob, @address_line_1, @city, @state, @pincode, @total_orders, @total_spent)`,
  );

  const insertAll = db.transaction((rows: Built[]) => {
    for (const row of rows) {
      if (row.system === 'marketing') insertMarketing.run(row.fields);
      else if (row.system === 'sales') insertSales.run(row.fields);
      else if (row.system === 'support') insertSupport.run(row.fields);
      else insertEcommerce.run(row.fields);
    }
  });
  insertAll(built);

  return { total: built.length };
}

if (require.main === module) {
  const result = seedDatabase();
  // eslint-disable-next-line no-console
  console.log(`[seed] inserted ${result.total} raw records (seed=${SEED}, DOB reference date=${DOB_REFERENCE_DATE})`);
  closeDb();
}
