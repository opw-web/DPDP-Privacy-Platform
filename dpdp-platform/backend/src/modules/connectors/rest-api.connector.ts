import { AuthType } from "@prisma/client";
import type { Connector } from "./connector.interface";
import { ReadOnlyHttpClient, stripQuery } from "./http/read-only-http.client";

const MAX_PAGES = 500;
const DISCOVER_SAMPLE_COUNT = 20;
/** Exported so Task 12's "re-scrub stored samples when a field is marked containsPersonalData" never re-hardcodes this number. */
export const SAMPLE_TRUNCATE_LENGTH = 40;
/**
 * testConnection() is a connectivity CHECK, not a data read: short timeout,
 * zero retries (a single fast answer beats a slow, retried one), and it
 * fetches only `limit=1` record -- never a full page of personal data pulled
 * into memory just to prove the source is reachable.
 */
const TEST_CONNECTION_TIMEOUT_MS = 5_000;

/** Truncates a stringified sample value to the spec's 40-char limit. Exported alongside SAMPLE_TRUNCATE_LENGTH for the same reason. */
export function truncateSample(value: string): string {
  return value.slice(0, SAMPLE_TRUNCATE_LENGTH);
}

export interface RestApiConnectorConfig {
  /** Human-readable data source name, used ONLY to name the source in error messages. */
  name: string;
  baseUrl: string;
  /** JSON path (dot-separated) into the response body where the record array lives, e.g. "data". */
  recordsPath: string;
  externalIdField: string;
  authType: AuthType;
  /** ALREADY DECRYPTED by the caller (Task 12). This connector never decrypts and never reads a cipher column. */
  credential: string | null;
  /** MVP1 supports only "PAGE" (?page=N&limit=M) -- any other value throws in the constructor rather than being silently ignored. */
  paginationStyle: string;
  pageSize: number;
  supportsIncremental: boolean;
  incrementalParam?: string | null;
}

export class UnsupportedPaginationStyleError extends Error {
  constructor(sourceName: string, style: string) {
    super(
      `RestApiConnector for data source "${sourceName}" was configured with ` +
        `unsupported paginationStyle "${style}" -- MVP1 supports "PAGE" only.`,
    );
    this.name = "UnsupportedPaginationStyleError";
  }
}

/** Thrown by fetchPage's hard cap. Typed separately from a JSON-parse failure so Task 18 can tell the two apart. */
export class PageCapExceededError extends Error {
  constructor(sourceName: string, cap: number) {
    super(
      `RestApiConnector for data source "${sourceName}" exceeded the ${cap}-page ` +
        "hard cap without reaching a short page. Aborting sync.",
    );
    this.name = "PageCapExceededError";
  }
}

/** Thrown when a pagination cursor cannot be decoded into a valid page number. */
export class InvalidCursorError extends Error {
  constructor(sourceName: string, cursor: string) {
    super(
      `RestApiConnector for data source "${sourceName}" received an unparseable pagination cursor: ${JSON.stringify(cursor)}`,
    );
    this.name = "InvalidCursorError";
  }
}

interface DecodedCursor {
  page: number;
  /** Present only for a cursor produced mid-incremental-sync; carries the ISO `since` value forward so continuation pages stay filtered. */
  since?: string;
}

function isIsoDateString(value: string): boolean {
  if (
    !/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(
      value,
    )
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}

function inferType(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string")
    return isIsoDateString(value) ? "date" : "string";
  return "string";
}

/** Objects/arrays are JSON.stringify'd rather than `String()`'d, which would otherwise show a human mapping fields "[object Object]". */
function stringifyForSample(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function extractRecords(body: unknown, path: string): unknown[] {
  if (!path) {
    return Array.isArray(body) ? body : [];
  }
  let current: unknown = body;
  for (const segment of path.split(".")) {
    if (
      current !== null &&
      typeof current === "object" &&
      segment in (current as object)
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return [];
    }
  }
  return Array.isArray(current) ? current : [];
}

/**
 * MVP1's one Connector implementation. GET-only, paginated, read-only REST client.
 *
 * The decrypted credential is held ONLY in the private `#config` field (a real
 * JS private class field, not a TypeScript `private` which is still enumerable
 * at runtime). It is read exactly once per outgoing request, inside
 * `buildAuthHeaders`, to build a header value that is handed straight to the
 * HTTP client -- it is never logged, never assigned to any other field, never
 * included in a returned object, and no getter exposes `#config` or any part
 * of it.
 */
export class RestApiConnector implements Connector {
  readonly #config: RestApiConnectorConfig;
  private readonly httpClient: ReadOnlyHttpClient;

  constructor(
    config: RestApiConnectorConfig,
    httpClient: ReadOnlyHttpClient = new ReadOnlyHttpClient(),
  ) {
    if (config.paginationStyle !== "PAGE") {
      throw new UnsupportedPaginationStyleError(
        config.name,
        config.paginationStyle,
      );
    }
    this.#config = config;
    this.httpClient = httpClient;
  }

  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.ping();
      return {
        ok: true,
        message: "Connected successfully.",
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      // testConnection reports, it never throws: 401s, timeouts and DNS
      // failures are all expected outcomes of "test this connection".
      const message =
        err instanceof Error ? err.message : "Unknown connection error.";
      return { ok: false, message, latencyMs: Date.now() - start };
    }
  }

  async discoverSchema(): Promise<
    { fieldName: string; sampleValue: string | null; inferredType: string }[]
  > {
    const { records } = await this.fetchPage(1);
    const sample = records.slice(0, DISCOVER_SAMPLE_COUNT);

    const fieldNames = new Set<string>();
    for (const record of sample) {
      if (record !== null && typeof record === "object") {
        for (const key of Object.keys(record as Record<string, unknown>)) {
          fieldNames.add(key);
        }
      }
    }

    return Array.from(fieldNames).map((fieldName) => {
      let sampleValue: string | null = null;
      let inferredType = "null";
      for (const record of sample) {
        const value = (record as Record<string, unknown> | null)?.[fieldName];
        if (value !== null && value !== undefined) {
          sampleValue = truncateSample(stringifyForSample(value));
          inferredType = inferType(value);
          break;
        }
      }
      return { fieldName, sampleValue, inferredType };
    });
  }

  async fetchRecords(
    cursor?: string,
  ): Promise<{ records: unknown[]; nextCursor?: string }> {
    const decoded = this.decodeCursor(cursor);
    const extraParams =
      decoded.since && this.#config.incrementalParam
        ? { [this.#config.incrementalParam]: decoded.since }
        : {};
    return this.fetchPage(decoded.page, extraParams, decoded.since);
  }

  /**
   * When `supportsIncremental` is false (or `incrementalParam` is unset),
   * fetchChanges falls back to a FULL fetchRecords() pass from page 1 -- the
   * exact same records a normal full sync would read. This is a deliberate,
   * documented choice, not an oversight: spec §2.8's sync pipeline hashes
   * every SourceRecord's raw payload and short-circuits (recordsSkipped) when
   * the hash is unchanged, so re-fetching everything from a non-incremental
   * source is correct but wasteful -- never incorrect. Callers that care about
   * sync cost should prefer sources where `supportsIncremental` is true.
   *
   * When incremental IS supported, the `since` value is embedded into the
   * returned `nextCursor` (see `encodeCursor`/`decodeCursor`) so that a
   * continuation call via `fetchRecords(nextCursor)` re-applies the SAME
   * incremental filter on page 2, 3, ... instead of silently reading the
   * rest of the source unfiltered.
   */
  async fetchChanges(
    since: Date,
  ): Promise<{ records: unknown[]; nextCursor?: string }> {
    if (!this.#config.supportsIncremental || !this.#config.incrementalParam) {
      return this.fetchRecords();
    }
    const iso = since.toISOString();
    return this.fetchPage(1, { [this.#config.incrementalParam]: iso }, iso);
  }

  private encodeCursor(page: number, since?: string): string {
    return since ? JSON.stringify({ page, since }) : String(page);
  }

  private decodeCursor(cursor?: string): DecodedCursor {
    if (!cursor) {
      return { page: 1 };
    }
    if (cursor.trim().startsWith("{")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(cursor);
      } catch {
        throw new InvalidCursorError(this.#config.name, cursor);
      }
      const record = parsed as { page?: unknown; since?: unknown };
      const page = Number(record.page);
      if (!Number.isInteger(page) || page < 1) {
        throw new InvalidCursorError(this.#config.name, cursor);
      }
      const since = typeof record.since === "string" ? record.since : undefined;
      return { page, since };
    }
    const page = Number(cursor);
    if (!Number.isInteger(page) || page < 1) {
      throw new InvalidCursorError(this.#config.name, cursor);
    }
    return { page };
  }

  /**
   * NOTE FOR TASK 18: the 500-page hard cap below is enforced ONLY through
   * the cursor this method returns/consumes (`page > MAX_PAGES`). If the
   * sync pipeline ever builds its own page numbers directly, or resets the
   * cursor on a retried sync instead of resuming it, the cap is bypassed
   * entirely and becomes a code-review convention again, exactly the
   * failure mode this connector exists to avoid. Always drive pagination
   * from the `nextCursor` this connector hands back.
   */
  private async fetchPage(
    page: number,
    extraParams: Record<string, string> = {},
    since?: string,
  ): Promise<{ records: unknown[]; nextCursor?: string }> {
    if (page > MAX_PAGES) {
      throw new PageCapExceededError(this.#config.name, MAX_PAGES);
    }

    const url = this.buildUrl(page, extraParams);
    const headers = this.buildAuthHeaders();
    const response = await this.httpClient.request({
      method: "GET",
      url,
      headers,
    });

    let body: unknown;
    try {
      body = JSON.parse(response.body);
    } catch {
      throw new Error(
        `RestApiConnector for data source "${this.#config.name}" received invalid JSON from ${stripQuery(url)}`,
      );
    }

    const records = extractRecords(body, this.#config.recordsPath);
    const isShortPage = records.length < this.#config.pageSize;
    return isShortPage
      ? { records }
      : { records, nextCursor: this.encodeCursor(page + 1, since) };
  }

  /**
   * A connectivity check ONLY: `limit=1`, a short 5s deadline, and zero
   * retries. Unlike a normal sync page fetch, this must never pull a full
   * page of personal data into memory just to prove the source answers, and
   * must never make a caller wait out three retries plus backoff (up to
   * ~13s) on top of its own timeout just to learn "unreachable".
   */
  private async ping(): Promise<void> {
    const url = new URL(this.#config.baseUrl);
    url.searchParams.set("page", "1");
    url.searchParams.set("limit", "1");
    const headers = this.buildAuthHeaders();
    await this.httpClient.request({
      method: "GET",
      url: url.toString(),
      headers,
      timeoutMs: TEST_CONNECTION_TIMEOUT_MS,
      maxRetries: 0,
    });
  }

  private buildUrl(page: number, extraParams: Record<string, string>): string {
    const url = new URL(this.#config.baseUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(this.#config.pageSize));
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  /** Reads `#config.credential` exactly once to build a header; returns it nowhere else. */
  private buildAuthHeaders(): Record<string, string> {
    const { authType, credential } = this.#config;
    if (authType === AuthType.NONE || !credential) {
      return {};
    }
    switch (authType) {
      case AuthType.BEARER:
        return { Authorization: `Bearer ${credential}` };
      case AuthType.API_KEY_HEADER:
        // ASSUMPTION, not a spec citation: the DataSource schema has no
        // column for a per-source header name, so this connector always
        // sends the key under a fixed "X-Api-Key" header. If a real
        // integration needs a different header name, the schema needs a
        // column for it -- this is not something this connector can infer.
        return { "X-Api-Key": credential };
      case AuthType.BASIC:
        return {
          Authorization: `Basic ${Buffer.from(credential, "utf8").toString("base64")}`,
        };
      default:
        return {};
    }
  }
}
