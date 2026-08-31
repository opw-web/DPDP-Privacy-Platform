/**
 * Explicit, hand-authored "special" people for the demo dataset:
 * - the 7 named personas required by spec lines 939-947
 * - the anti-merge trap (2 different "Rahul Verma"s)
 * - the 4 possible-duplicate pairs (same nameKey + same pincode, no
 *   shared email/phone) that must land in the review queue
 *
 * These are authored by hand (not generated) because their exact field
 * values are what make the identity-resolution numbers in the spec
 * (Checks 6, 7, 10, 20) hit precisely. Generic filler people are built
 * separately in generate.ts.
 *
 * Names, pincodes and identifiers used here are reserved and must never
 * be reused by the generic filler generator (see generate.ts's
 * RESERVED_NAMES / RESERVED_PINCODES).
 */

export interface MarketingRecord {
  system: 'marketing';
  customer_email: string | null;
  mobile_number: string | null;
  first_name: string;
  surname: string;
  city: string | null;
  subscribed_on: string;
  campaign_source: string;
}

export interface SalesRecord {
  system: 'sales';
  primary_email: string | null;
  contact_no: string | null;
  full_name: string;
  billing_pincode: string | null;
  account_status: string;
  lifetime_value: number;
}

export interface SupportRecord {
  system: 'support';
  email_address: string | null;
  phone: string | null;
  name: string;
  last_ticket_at: string;
  tickets_count: number;
}

export interface EcommerceRecord {
  system: 'ecommerce';
  email: string | null;
  phone_number: string | null;
  first_name: string;
  last_name: string;
  dob: string | null;
  address_line_1: string;
  city: string | null;
  state: string;
  pincode: string | null;
  total_orders: number;
  total_spent: number;
}

export type AnyRecord = MarketingRecord | SalesRecord | SupportRecord | EcommerceRecord;

export interface PersonaPerson {
  /** Human label for reporting/tests only, not written to the DB. */
  label: string;
  records: AnyRecord[];
}

// Reference date used for every "is this person under 18" calculation in
// this generator. Fixed on purpose (see generate.ts header) so the count
// of CHILD-age ecommerce records cannot drift as real time passes.
export const DOB_REFERENCE_DATE = '2026-01-01';

export const RESERVED_NAMES = new Set<string>([
  'aman sharma',
  'neha rao',
  'raj patel',
  'sara khan',
  'ishaan gupta',
  'rahul verma',
  'vikram nair',
  'priya menon',
  'karan malhotra',
  'divya iyer',
]);

// Pincodes reserved for the 4 possible-duplicate pairs. Never reused by
// generic filler so no accidental 5th candidate pair is created.
export const RESERVED_PINCODES = new Set<string>(['110001', '600001', '500001', '700001']);

export const personas: PersonaPerson[] = [
  // --- Aman Sharma: flagship 3-way merge (marketing + sales + support) ---
  // marketing <-> sales linked by EMAIL; marketing <-> support linked by
  // PHONE. All three collapse into one principal.
  {
    label: 'Aman Sharma (3-way)',
    records: [
      {
        system: 'marketing',
        customer_email: 'aman.sharma@gmail.com',
        mobile_number: '98765 43210',
        first_name: 'Aman',
        surname: 'Sharma',
        city: 'Mumbai',
        subscribed_on: '2024-02-10',
        campaign_source: 'google_ads',
      },
      {
        system: 'sales',
        primary_email: 'aman.sharma@gmail.com',
        contact_no: '9123456780',
        full_name: 'aman sharma',
        billing_pincode: '400001',
        account_status: 'active',
        lifetime_value: 48250.5,
      },
      {
        system: 'support',
        email_address: null,
        phone: '+91-98765-43210',
        name: 'A. Sharma',
        last_ticket_at: '2025-11-02',
        tickets_count: 4,
      },
    ],
  },

  // --- Neha Rao: email in sales, phone-only in support (proves PHONE match) ---
  {
    label: 'Neha Rao (2-way, phone match)',
    records: [
      {
        system: 'sales',
        primary_email: 'neha.rao@example.com',
        contact_no: '9876500002',
        full_name: 'Neha Rao',
        billing_pincode: '560002',
        account_status: 'active',
        lifetime_value: 15200,
      },
      {
        system: 'support',
        email_address: null,
        phone: '+91 98765 00002',
        name: 'Neha Rao',
        last_ticket_at: '2025-09-14',
        tickets_count: 2,
      },
    ],
  },

  // --- Raj Patel: two emails (personal in sales, work in ecommerce), one
  // person, linked by shared PHONE ---
  {
    label: 'Raj Patel (two emails)',
    records: [
      {
        system: 'sales',
        primary_email: 'raj.patel@gmail.com',
        contact_no: '9876500003',
        full_name: 'Raj Patel',
        billing_pincode: '380001',
        account_status: 'active',
        lifetime_value: 9800,
      },
      {
        system: 'ecommerce',
        email: 'raj.patel@acmecorp.com',
        phone_number: '09876500003',
        first_name: 'Raj',
        last_name: 'Patel',
        dob: '1988-06-14',
        address_line_1: '12 MG Road',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380001',
        total_orders: 6,
        total_spent: 15400,
      },
    ],
  },

  // --- Sara Khan: e-commerce only, the simple single-source case ---
  {
    label: 'Sara Khan (single-source)',
    records: [
      {
        system: 'ecommerce',
        email: 'sara.khan@example.com',
        phone_number: '9876500004',
        first_name: 'Sara',
        last_name: 'Khan',
        dob: '1995-03-22',
        address_line_1: '4 Lake View Apartments',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        total_orders: 3,
        total_spent: 7200,
      },
    ],
  },

  // --- Ishaan Gupta: DOB under 18 at DOB_REFERENCE_DATE, surfaces CH-01 ---
  {
    label: 'Ishaan Gupta (under 18)',
    records: [
      {
        system: 'ecommerce',
        email: 'ishaan.gupta.kid@example.com',
        phone_number: null,
        first_name: 'Ishaan',
        last_name: 'Gupta',
        dob: '2012-05-01', // ~13y8m as of DOB_REFERENCE_DATE (2026-01-01)
        address_line_1: '9 Palm Grove',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560010',
        total_orders: 1,
        total_spent: 450,
      },
    ],
  },

  // --- Rahul Verma x2: the anti-merge trap. Different systems that have
  // no pincode/dob columns at all (marketing, support), distinct emails
  // and phones -> cannot auto-link and cannot even become a candidate. ---
  {
    label: 'Rahul Verma A',
    records: [
      {
        system: 'marketing',
        customer_email: 'rahul.verma.mkt@example.com',
        mobile_number: '9876500010',
        first_name: 'Rahul',
        surname: 'Verma',
        city: 'Delhi',
        subscribed_on: '2023-08-01',
        campaign_source: 'referral',
      },
    ],
  },
  {
    label: 'Rahul Verma B',
    records: [
      {
        system: 'support',
        email_address: 'rverma.support@example.com',
        phone: '9876500011',
        name: 'Rahul Verma',
        last_ticket_at: '2025-05-19',
        tickets_count: 1,
      },
    ],
  },

  // --- 4 possible-duplicate pairs: same nameKey + same pincode, no
  // shared email or phone. Each pair member is a singleton (1 record),
  // drawn from {sales, ecommerce} since those are the only systems with
  // a postal-code column. ---
  {
    label: 'Vikram Nair (pair, sales)',
    records: [
      {
        system: 'sales',
        primary_email: 'vikram.n@gmail.com',
        contact_no: '9876500020',
        full_name: 'Vikram Nair',
        billing_pincode: '110001',
        account_status: 'active',
        lifetime_value: 5400,
      },
    ],
  },
  {
    label: 'Vikram Nair (pair, ecommerce)',
    records: [
      {
        system: 'ecommerce',
        email: 'vikram.nair@workplace.com',
        phone_number: '9876500021',
        first_name: 'Vikram',
        last_name: 'Nair',
        dob: '1990-01-15',
        address_line_1: '21 Connaught Place',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        total_orders: 2,
        total_spent: 3200,
      },
    ],
  },
  {
    label: 'Priya Menon (pair, sales)',
    records: [
      {
        system: 'sales',
        primary_email: 'priya.menon.sales@example.com',
        contact_no: '9876500022',
        full_name: 'Priya Menon',
        billing_pincode: '600001',
        account_status: 'active',
        lifetime_value: 6100,
      },
    ],
  },
  {
    label: 'Priya Menon (pair, ecommerce)',
    records: [
      {
        system: 'ecommerce',
        email: null,
        phone_number: '9876500023',
        first_name: 'Priya',
        last_name: 'Menon',
        dob: '1992-07-09',
        address_line_1: '7 Anna Salai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600001',
        total_orders: 1,
        total_spent: 1800,
      },
    ],
  },
  {
    label: 'Karan Malhotra (pair, sales)',
    records: [
      {
        system: 'sales',
        primary_email: 'karan.malhotra@example.com',
        contact_no: null,
        full_name: 'Karan Malhotra',
        billing_pincode: '500001',
        account_status: 'lapsed',
        lifetime_value: 2200,
      },
    ],
  },
  {
    label: 'Karan Malhotra (pair, ecommerce)',
    records: [
      {
        system: 'ecommerce',
        email: 'karan.malhotra.ec@example.com',
        phone_number: '9876500025',
        first_name: 'Karan',
        last_name: 'Malhotra',
        dob: '1985-11-30',
        address_line_1: '3 Banjara Hills',
        city: 'Hyderabad',
        state: 'Telangana',
        pincode: '500001',
        total_orders: 4,
        total_spent: 9100,
      },
    ],
  },
  {
    label: 'Divya Iyer (pair, sales, case variant)',
    records: [
      {
        system: 'sales',
        primary_email: 'divya.iyer@example.com',
        contact_no: '9876500026',
        full_name: 'divya iyer',
        billing_pincode: '700001',
        account_status: 'active',
        lifetime_value: 3300,
      },
    ],
  },
  {
    label: 'Divya Iyer (pair, ecommerce)',
    records: [
      {
        system: 'ecommerce',
        email: 'divya.iyer.ec@example.com',
        phone_number: null,
        first_name: 'Divya',
        last_name: 'Iyer',
        dob: '1998-04-18',
        address_line_1: '18 Park Street',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700001',
        total_orders: 2,
        total_spent: 2600,
      },
    ],
  },
];
