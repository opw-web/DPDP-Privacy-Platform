/**
 * Reimplementation of the platform's identity-resolution rules (spec
 * §4.4, lines 750-778) purely for the generator's own self-check. This
 * file is NOT imported by Task 9's server code and does not change the
 * platform — it exists so the generator (and the dataset test) can
 * simulate "what will the matcher do with this data?" and assert the
 * resulting person/candidate counts before/after generation.
 *
 * Normalization rules mirrored here:
 * - email: trim -> NFKC -> lowercase. No dot/plus stripping. Invalid -> null.
 * - phone: strip to digits + leading '+'; 10 digits -> +91 prefix; 11
 *   digits starting with 0 -> +91 + rest; 12 digits starting with 91 ->
 *   '+' + digits; already has leading + -> keep; otherwise -> null.
 * - nameKey: lowercase alphanumeric tokens, sorted, space-joined.
 */

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const nfkc = trimmed.normalize('NFKC');
  const lower = nfkc.toLowerCase();
  // Minimal syntax check: one '@', something on both sides, a dot in the domain.
  const match = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.exec(lower);
  return match ? lower : null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/[^\d+]/g, '');
  const hasLeadingPlus = stripped.startsWith('+');
  const digits = hasLeadingPlus ? stripped.slice(1) : stripped;
  if (!/^\d+$/.test(digits)) return null;

  if (hasLeadingPlus) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

export function nameKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  return tokens.sort().join(' ');
}

export function last6(phoneNormalized: string | null): string | null {
  if (!phoneNormalized) return null;
  const digits = phoneNormalized.replace(/^\+/, '');
  return digits.length >= 6 ? digits.slice(-6) : null;
}

export interface SimRecord {
  sourceId: string; // unique across the whole dataset, e.g. "marketing:12"
  system: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  pincode: string | null;
  dob: string | null; // ISO date, only ecommerce has this
}

export interface SimPrincipal {
  id: number;
  recordIds: string[];
  emails: Set<string>;
  phones: Set<string>;
}

export interface SimCandidate {
  recordId: string;
  principalId: number;
  reason: string;
}

export interface SimResult {
  principals: SimPrincipal[];
  candidates: SimCandidate[];
  recordToPrincipal: Map<string, number>;
}

/**
 * Faithful re-implementation of spec 4.4's matching order:
 * 1. CUSTOMER_ID exact (not modeled — no verified-customer-id mapping
 *    exists in this raw demo data; see report).
 * 2. EMAIL exact -> auto-link.
 * 3. PHONE exact -> auto-link.
 * 4. Supporting signal: nameKey equal AND (pincode | dob | last-6 phone
 *    equal) -> POSSIBLE, raise candidate, do NOT link.
 * 5. Otherwise -> new principal.
 */
export function simulateMatching(records: SimRecord[]): SimResult {
  const principals: SimPrincipal[] = [];
  const candidates: SimCandidate[] = [];
  const recordToPrincipal = new Map<string, number>();

  const byEmail = new Map<string, number>(); // normalized email -> principal id
  const byPhone = new Map<string, number>(); // normalized phone -> principal id
  // For the supporting signal we need to look at all previously seen records,
  // grouped by nameKey.
  const seenByNameKey = new Map<string, SimRecord[]>();

  let nextId = 1;

  for (const rec of records) {
    const email = normalizeEmail(rec.email);
    const phone = normalizePhone(rec.phone);
    const nk = nameKey(rec.name);

    let targetPrincipal: number | null = null;
    let conflictPrincipal: number | null = null;

    if (email && byEmail.has(email)) {
      targetPrincipal = byEmail.get(email)!;
    }
    if (phone && byPhone.has(phone)) {
      const viaPhone = byPhone.get(phone)!;
      if (targetPrincipal === null) {
        targetPrincipal = viaPhone;
      } else if (viaPhone !== targetPrincipal) {
        conflictPrincipal = viaPhone;
      }
    }

    if (targetPrincipal !== null) {
      const p = principals.find((pr) => pr.id === targetPrincipal)!;
      p.recordIds.push(rec.sourceId);
      if (email) p.emails.add(email);
      if (phone) p.phones.add(phone);
      recordToPrincipal.set(rec.sourceId, p.id);
      if (email) byEmail.set(email, p.id);
      if (phone) byPhone.set(phone, p.id);
      if (conflictPrincipal !== null) {
        candidates.push({
          recordId: rec.sourceId,
          principalId: conflictPrincipal,
          reason: 'conflict',
        });
      }
    } else {
      // Rule 4: supporting signal against everything seen so far.
      let matchedCandidate = false;
      if (nk) {
        const priorSameName = seenByNameKey.get(nk) ?? [];
        for (const prior of priorSameName) {
          const priorEmail = normalizeEmail(prior.email);
          const priorPhone = normalizePhone(prior.phone);
          const priorLast6 = last6(priorPhone);
          const thisLast6 = last6(phone);
          const samePincode =
            rec.pincode && prior.pincode && rec.pincode === prior.pincode;
          const sameDob = rec.dob && prior.dob && rec.dob === prior.dob;
          const sameLast6 = priorLast6 && thisLast6 && priorLast6 === thisLast6;
          // Guard: if they *also* share email or phone they would already
          // have auto-linked above, so reaching here means they don't.
          if (samePincode || sameDob || sameLast6) {
            const priorPrincipalId = recordToPrincipal.get(prior.sourceId);
            if (priorPrincipalId !== undefined) {
              candidates.push({
                recordId: rec.sourceId,
                principalId: priorPrincipalId,
                reason: 'possible',
              });
              matchedCandidate = true;
            }
          }
        }
      }

      // Rule 5: new principal regardless (candidates never auto-link).
      const p: SimPrincipal = {
        id: nextId++,
        recordIds: [rec.sourceId],
        emails: new Set(email ? [email] : []),
        phones: new Set(phone ? [phone] : []),
      };
      principals.push(p);
      recordToPrincipal.set(rec.sourceId, p.id);
      if (email) byEmail.set(email, p.id);
      if (phone) byPhone.set(phone, p.id);
      void matchedCandidate;
    }

    if (nk) {
      const list = seenByNameKey.get(nk) ?? [];
      list.push(rec);
      seenByNameKey.set(nk, list);
    }
  }

  return { principals, candidates, recordToPrincipal };
}
