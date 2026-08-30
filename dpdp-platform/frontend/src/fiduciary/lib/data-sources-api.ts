import type { QueryClient } from "@tanstack/react-query";
import { API_BASE, ApiError, employeeTokenStore } from "../../lib/api-client";

/**
 * Task 24's shared types and small API helper for `/app/data-sources*`.
 * New file, not on the brief's `Files: Create` list -- placed here (this
 * task's own `src/fiduciary/lib/`, never `src/lib/*`) per the batch rule
 * "If you need a new shared component, put it in your own task's
 * directory." Two concerns forced this file to exist; both are reported
 * as concerns in task-24-report.md, not silently worked around:
 *
 * 1. `employeeApiClient` (src/lib/api-client.ts) exposes get/post/patch/
 *    delete but no `put`, and the two Task 13 routes this wizard depends
 *    on (`PUT /data-sources/:id/mappings`, `PUT /data-sources/:id/purposes`)
 *    are PUT-only on the backend -- POST/PATCH cannot reach a `@Put()`
 *    route. `src/lib/*` is out of this task's scope fence, so `employeePut`
 *    below mirrors that client's own request shape (same exported
 *    `employeeTokenStore`/`API_BASE`, `credentials: "include"`, one
 *    401-refresh-then-retry) instead of diverging from it, rather than
 *    inventing a bespoke fetch pattern.
 * 2. AS WRITTEN when this task started, there was no `GET
 *    /api/data-sources/:id/mappings` or `GET /api/data-sources/:id/purposes`
 *    route anywhere in this backend (verified against
 *    `mappings.controller.ts`, and against `mappings.e2e-spec.ts`'s own
 *    comment: "there is no GET /mappings route") -- confirmed against the
 *    spec's own endpoint table (lines 805-811) too, which lists neither.
 *    The coordinator confirmed this independently (Task 26 hit the same
 *    gap for purposes) and dispatched a concurrent backend agent to add
 *    both reads:
 *      - `GET /api/data-sources/:id/mappings` -> `{ mappings, warnings }`
 *        (the exact `ReplaceMappingsResult` shape the PUT already
 *        returns, so `mappingsQueryKey` below is used identically as a
 *        real query key for this GET and as the cache key
 *        `cacheMappingsResult` writes to after a PUT -- a fresh page load
 *        now genuinely fetches the standing CN-02 warnings, not just a
 *        same-session cache hit).
 *      - `GET /api/data-sources/:id/purposes` -> the purposes attached to
 *        the source (assumed a bare array, mirroring every other GET
 *        collection route in this codebase -- `GET /purposes`, `GET
 *        /data-sources`, `GET /data-sources/:id/fields` -- none of which
 *        wrap in an object; reconcile at the integration gate if the
 *        backend agent chose `{ purposes: [...] }` instead), each
 *        carrying its own review status for the amber "Not yet reviewed"
 *        chip.
 *    Built against those shapes below and in `DataSourceDetailPage.tsx`
 *    -- this frontend was written before either endpoint existed in the
 *    tree, so the exact response shape is the coordinator's word, not
 *    something this task read from committed backend code. Flagged again
 *    in task-24-report.md.
 */

export type AuthType = "BEARER" | "API_KEY_HEADER" | "BASIC" | "NONE";
export const AUTH_TYPE_VALUES: readonly AuthType[] = [
  "BEARER",
  "API_KEY_HEADER",
  "BASIC",
  "NONE",
];

export type SyncFrequency = "MANUAL" | "EVERY_15_MIN" | "HOURLY" | "DAILY";
export const SYNC_FREQUENCY_VALUES: readonly SyncFrequency[] = [
  "MANUAL",
  "EVERY_15_MIN",
  "HOURLY",
  "DAILY",
];

export type DataSourceStatus = "DRAFT" | "CONNECTED" | "ERROR" | "DISABLED";

export type SyncStatus = "QUEUED" | "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";

/** `CanonicalField` (schema.prisma), transcribed verbatim -- the frontend cannot import backend source. */
export const CANONICAL_FIELD_VALUES = [
  "FULL_NAME",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "DATE_OF_BIRTH",
  "GENDER",
  "ADDRESS_LINE1",
  "ADDRESS_LINE2",
  "CITY",
  "STATE",
  "POSTAL_CODE",
  "COUNTRY",
  "CUSTOMER_ID",
  "ACCOUNT_STATUS",
  "LAST_ACTIVITY_AT",
  "PURCHASE_TOTAL",
  "EXTERNAL_ID",
  "IGNORE",
] as const;
export type CanonicalField = (typeof CANONICAL_FIELD_VALUES)[number];

/** `DataCategory` (schema.prisma) -- kept local (not imported from `../lib/enum-options`) only for the type; option labels are reused from there. */
export const DATA_CATEGORY_VALUES = [
  "IDENTITY",
  "CONTACT",
  "DEMOGRAPHIC",
  "FINANCIAL",
  "TRANSACTIONAL",
  "BEHAVIOURAL",
  "LOCATION",
  "HEALTH",
  "BIOMETRIC",
  "GOVT_ID",
  "OTHER",
] as const;
export type DataCategory = (typeof DATA_CATEGORY_VALUES)[number];

export interface PublicDataSource {
  id: string;
  name: string;
  systemType: string;
  baseUrl: string;
  recordsPath: string;
  externalIdField: string;
  authType: AuthType;
  credentialHint: string | null;
  supportsIncremental: boolean;
  incrementalParam: string | null;
  paginationStyle: string;
  pageSize: number;
  syncFrequency: SyncFrequency;
  status: DataSourceStatus;
  containsOnlyPubliclyAvailableData: boolean;
  publiclyAvailableJustification: string | null;
  hostingCountry: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicDataSourceField {
  id: string;
  fieldName: string;
  sampleValue: string | null;
  inferredType: string;
}

export type MappingWarningType = "NO_PURPOSES_ATTACHED" | "CATEGORY_OUTSIDE_PURPOSES";

export interface MappingWarningPurposeSummary {
  id: string;
  code: string;
  name: string;
  dataCategories: DataCategory[];
}

export interface MappingWarning {
  type: MappingWarningType;
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
  attachedPurposes: MappingWarningPurposeSummary[];
  message: string;
}

export interface PublicSourceFieldMapping {
  id: string;
  sourceField: string;
  canonicalField: CanonicalField;
  dataCategory: DataCategory;
  containsPersonalData: boolean;
  isVerifiedCustomerId: boolean;
}

export interface ReplaceMappingsResult {
  mappings: PublicSourceFieldMapping[];
  warnings: MappingWarning[];
}

/** Mirrors `PublicPurpose` (purposes.service.ts) -- same shape `PurposesPage.tsx` already declares locally. */
export interface AttachedPurpose {
  id: string;
  code: string;
  name: string;
  description: string;
  lawfulBasis: "CONSENT" | "LEGITIMATE_USE";
  legitimateUseLimb: string | null;
  basisJustification: string;
  dataCategories: DataCategory[];
  goodsOrServicesDescription: string | null;
  reviewedByEmployeeId: string | null;
  reviewedAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isReviewed: boolean;
}

export interface ReplacePurposesResult {
  purposes: AttachedPurpose[];
  warnings: MappingWarning[];
}

export interface SyncJob {
  id: string;
  dataSourceId: string;
  triggeredBy: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncStatus;
  recordsRead: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  principalsCreated: number;
  principalsLinked: number;
  candidatesRaised: number;
  errorLog: unknown[];
}

/**
 * See concern 2 above. These are real TanStack Query keys now: the detail
 * page's tabs `useQuery` them against the new `GET .../mappings` and `GET
 * .../purposes` routes, and `cacheMappingsResult`/`cachePurposesResult`
 * below write the SAME key immediately after a successful PUT (wizard
 * Step 3/4, or the detail page's own save) so the tab reflects a just-made
 * change without waiting on a refetch -- an optimistic cache update
 * layered on top of a real read, not a substitute for one.
 */
export function mappingsQueryKey(dataSourceId: string) {
  return ["data-source-mappings", dataSourceId] as const;
}
export function purposesQueryKey(dataSourceId: string) {
  return ["data-source-purposes", dataSourceId] as const;
}

export function cacheMappingsResult(
  queryClient: QueryClient,
  dataSourceId: string,
  result: ReplaceMappingsResult,
): void {
  queryClient.setQueryData(mappingsQueryKey(dataSourceId), result);
}

/** Stores just the `purposes` array -- the assumed shape of `GET .../purposes` (see concern 2 above). */
export function cachePurposesResult(
  queryClient: QueryClient,
  dataSourceId: string,
  result: ReplacePurposesResult,
): void {
  queryClient.setQueryData(purposesQueryKey(dataSourceId), result.purposes);
}

/** See concern 1 above: mirrors `employeeApiClient`'s own request shape for the one HTTP verb it does not expose. */
async function refreshEmployeeTokenForPut(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/employee/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    employeeTokenStore.set(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

function extractMessage(body: unknown): string | undefined {
  if (
    body !== null &&
    typeof body === "object" &&
    "message" in body &&
    typeof (body as { message: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return undefined;
}

export async function employeePut<T>(path: string, body: unknown): Promise<T> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(employeeTokenStore.get()
          ? { Authorization: `Bearer ${employeeTokenStore.get()}` }
          : {}),
      },
      body: JSON.stringify(body),
    });

  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshEmployeeTokenForPut();
    if (refreshed) {
      res = await doFetch();
    }
  }
  if (!res.ok) {
    let responseBody: unknown = null;
    try {
      responseBody = await res.json();
    } catch {
      // no JSON body on this error response
    }
    throw new ApiError(res.status, responseBody, extractMessage(responseBody));
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
}
