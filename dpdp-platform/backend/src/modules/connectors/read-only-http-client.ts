import { Logger } from "@nestjs/common";
import * as http from "node:http";
import * as https from "node:https";

/**
 * Strips the query string from a URL for logging. Query strings on connected
 * systems can legitimately carry personal data (e.g. `?email=someone@x.com`),
 * so nothing derived from a URL is ever logged with its search params intact.
 */
export function stripQuery(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const idx = url.indexOf("?");
    return idx === -1 ? url : url.slice(0, idx);
  }
}

export interface ReadOnlyHttpRequestOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface ReadOnlyHttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Thrown by the method guard. Never carries the request headers or body. */
export class ReadOnlyHttpMethodError extends Error {
  constructor(method: string) {
    super(
      `ReadOnlyHttpClient refuses to send a "${method}" request: this platform ` +
        "never writes to a connected system -- only GET is permitted.",
    );
    this.name = "ReadOnlyHttpMethodError";
  }
}

/** A non-2xx HTTP response. `statusCode` is used by the retry policy. */
export class ReadOnlyHttpStatusError extends Error {
  constructor(
    public readonly statusCode: number,
    url: string,
  ) {
    super(`GET ${stripQuery(url)} responded with status ${statusCode}`);
    this.name = "ReadOnlyHttpStatusError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** Spec §4.2: three retries with backoff 1s, 3s, 9s on 5xx/network errors. */
export const RETRY_BACKOFF_MS = [1_000, 3_000, 9_000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A GET-only HTTP client.
 *
 * THE METHOD GUARD IS THE FIRST STATEMENT `request()` EXECUTES. It runs before
 * the URL is parsed, before `http`/`https` is touched, before anything that
 * could open a socket. A non-GET call throws synchronously out of that guard
 * and the function returns without ever reaching `performRequest` (the only
 * place a socket is created). This makes the refusal a runtime guarantee
 * rather than a convention: there is no code path from a non-GET method to a
 * network call, because the method check dominates every line that touches
 * `http.request`/`https.request` in the control-flow graph.
 */
export class ReadOnlyHttpClient {
  private readonly logger = new Logger(ReadOnlyHttpClient.name);

  /**
   * The backoff delay function is injectable so tests can assert the exact
   * delays a retry sequence requests (see read-only-http-client.spec.ts)
   * without waiting 13 real seconds. Production code always uses the
   * default, which is a real `setTimeout`-based sleep.
   */
  constructor(
    private readonly sleepFn: (ms: number) => Promise<void> = sleep,
  ) {}

  async request(
    options: ReadOnlyHttpRequestOptions,
  ): Promise<ReadOnlyHttpResponse> {
    // GUARD FIRST -- see class doc comment. Nothing below this line executes
    // for a non-GET method; no socket API has been referenced yet.
    if (options.method !== "GET") {
      throw new ReadOnlyHttpMethodError(options.method);
    }
    return this.requestWithRetry(options);
  }

  private async requestWithRetry(
    options: ReadOnlyHttpRequestOptions,
  ): Promise<ReadOnlyHttpResponse> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      try {
        return await this.performRequest(options, timeoutMs);
      } catch (err) {
        lastError = err;

        const isClientError =
          err instanceof ReadOnlyHttpStatusError &&
          err.statusCode >= 400 &&
          err.statusCode < 500;
        if (isClientError) {
          throw err; // no retry on 4xx
        }

        const isLastAttempt = attempt === RETRY_BACKOFF_MS.length;
        if (isLastAttempt) {
          throw err;
        }

        const delayMs = RETRY_BACKOFF_MS[attempt] as number;
        this.logger.warn(
          `GET ${stripQuery(options.url)} failed on attempt ${attempt + 1}; retrying in ${delayMs}ms`,
        );
        await this.sleepFn(delayMs);
      }
    }

    // Unreachable (the loop always returns or throws), kept for type safety.
    throw lastError;
  }

  private performRequest(
    options: ReadOnlyHttpRequestOptions,
    timeoutMs: number,
  ): Promise<ReadOnlyHttpResponse> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(options.url);
      } catch (err) {
        reject(err);
        return;
      }

      const transport = parsed.protocol === "https:" ? https : http;
      const headers = { ...(options.headers ?? {}) };

      this.logger.debug(`GET ${stripQuery(options.url)}`);

      const req = transport.request(
        {
          method: "GET",
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          headers,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            const body = Buffer.concat(chunks).toString("utf8");
            if (statusCode >= 400) {
              reject(new ReadOnlyHttpStatusError(statusCode, options.url));
              return;
            }
            resolve({ statusCode, headers: res.headers, body });
          });
          res.on("error", (err) => reject(err));
        },
      );

      req.on("timeout", () => {
        req.destroy(
          new Error(
            `GET ${stripQuery(options.url)} timed out after ${timeoutMs}ms`,
          ),
        );
      });

      req.on("error", (err) => reject(err));

      req.end();
    });
  }
}
