import { createHash } from "crypto";
import { canonicalJson } from "../../common/audit/canonical-json";

/**
 * `SourceRecord.payloadHash` (spec §2.8 PERSIST: "storing the raw JSON and
 * a sha256 payloadHash"). Hashing goes through `canonicalJson` (Task
 * 16/17's audit-hash serializer, reused as-is rather than re-implemented
 * here) specifically because a raw API response's key order is NOT a
 * stable property of its content -- the same logical record can come back
 * with keys in a different order on two consecutive fetches (a different
 * server process, a different ORM row-to-JSON serializer, a proxy that
 * re-encodes the body), and `JSON.stringify` alone would hash those two
 * observations differently even though nothing about the record actually
 * changed. That would make the sync pipeline's "unchanged hash skips the
 * rest of the pipeline" idempotency check (Check 4) drift on pure
 * formatting noise, treating a no-op resync as N spurious updates.
 *
 * `canonicalJson` recursively sorts object keys (never array elements --
 * array order is data) before hashing, so two byte-for-byte-different but
 * logically identical payloads hash identically, while any real change to
 * a value changes the hash.
 */
export function hashPayload(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
