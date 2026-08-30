import { AuthType } from "@prisma/client";
import type { Connector } from "./connector.interface";
import { ReadOnlyHttpClient, stripQuery } from "./read-only-http-client";

const MAX_PAGES = 500;
const DISCOVER_SAMPLE_COUNT = 20;
const SAMPLE_TRUNCATE_LENGTH = 40;

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
  /** MVP1 supports "PAGE" (?page=N&limit=M). */
  paginationStyle: string;
  pageSize: number;
  supportsIncremental: boolean;
  incrementalParam?: string | null;
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
      await this.fetchPage(1);
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
          sampleValue = String(value).slice(0, SAMPLE_TRUNCATE_LENGTH);
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
    const page = cursor ? Number.parseInt(cursor, 10) : 1;
    return this.fetchPage(page);
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
   */
  async fetchChanges(
    since: Date,
  ): Promise<{ records: unknown[]; nextCursor?: string }> {
    if (!this.#config.supportsIncremental || !this.#config.incrementalParam) {
      return this.fetchRecords();
    }
    return this.fetchPage(1, {
      [this.#config.incrementalParam]: since.toISOString(),
    });
  }

  private async fetchPage(
    page: number,
    extraParams: Record<string, string> = {},
  ): Promise<{ records: unknown[]; nextCursor?: string }> {
    if (page > MAX_PAGES) {
      throw new Error(
        `RestApiConnector for data source "${this.#config.name}" exceeded the ` +
          `${MAX_PAGES}-page hard cap without reaching a short page. Aborting sync.`,
      );
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
      : { records, nextCursor: String(page + 1) };
  }

  private buildUrl(page: number, extraParams: Record<string, string>): string {
    const url = new URL(this.#config.baseUrl);
    if (this.#config.paginationStyle === "PAGE") {
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(this.#config.pageSize));
    }
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
