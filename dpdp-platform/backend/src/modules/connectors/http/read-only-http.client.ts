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
  /** Overall request deadline in ms, covering all retry attempts combined for a single call. Default 15s. */
  timeoutMs?: number;
  /** How many retries (in addition to the first attempt) this call may use. Default: all of RETRY_BACKOFF_MS. Pass 0 for a no-retry call (e.g. a connectivity ping). */
  maxRetries?: number;
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

/**
 * A non-2xx HTTP response. `statusCode` is used by the retry policy. This
 * covers 3xx too: the client never follows redirects (rule 1 -- read-only,
 * predictable access only), so a 301/302 is NOT treated as an empty
 * successful page. A moved endpoint must fail loudly, not silently sync zero
 * records as "success".
 */
export class ReadOnlyHttpStatusError extends Error {
  constructor(
    public readonly statusCode: number,
    url: string,
  ) {
    super(`GET ${stripQuery(url)} responded with status ${statusCode}`);
    this.name = "ReadOnlyHttpStatusError";
  }
}

/** Thrown when a call's overall deadline elapses, regardless of intermittent socket activity. */
export class ReadOnlyHttpTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(
      `GET ${stripQuery(url)} exceeded its ${timeoutMs}ms overall deadline`,
    );
    this.name = "ReadOnlyHttpTimeoutError";
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
/** Spec §4.2: three retries with backoff 1s, 3s, 9s on 5xx/network errors. */
export const RETRY_BACKOFF_MS = [1_000, 3_000, 9_000] as const;

/** The real delay function used in production. Exported so a test can prove it genuinely waits, not just that it's wired in. */
export function defaultSleep(ms: number): Promise<void> {
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
 * `http.request`/`https.request` in the control-flow graph. As a second,
 * independent layer, `performRequest` hardcodes the literal `"GET"` into the
 * transport call rather than forwarding `options.method` -- even a bypassed
 * or mutated guard could not make this client emit another verb.
 */
export class ReadOnlyHttpClient {
  private readonly logger = new Logger(ReadOnlyHttpClient.name);

  /**
   * The backoff delay function is injectable so tests can assert the exact
   * delays a retry sequence requests (see read-only-http.client.spec.ts)
   * without waiting 13 real seconds. Production code always uses the
   * default, which is a real `setTimeout`-based sleep.
   */
  constructor(
    private readonly sleepFn: (ms: number) => Promise<void> = defaultSleep,
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
    const maxRetries = options.maxRetries ?? RETRY_BACKOFF_MS.length;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.performRequest(options, timeoutMs);
      } catch (err) {
        lastError = err;

        // Only a genuine 5xx (a possibly-transient server error) is
        // retried. A 3xx or 4xx will produce the exact same response on
        // retry (we don't follow redirects and don't fix our own auth),
        // so retrying it would just burn the backoff budget for nothing.
        const isNonRetryableStatus =
          err instanceof ReadOnlyHttpStatusError &&
          err.statusCode >= 300 &&
          err.statusCode < 500;
        if (isNonRetryableStatus) {
          throw err;
        }

        const isLastAttempt = attempt === maxRetries;
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

  /**
   * A single HTTP attempt, bounded by an OVERALL deadline rather than an
   * idle-socket timeout. Node's `timeout` request option only fires when the
   * socket is silent for that long -- a server that dribbles one byte every
   * 14 seconds never trips it, and it doesn't bound total elapsed time
   * either. Here an independent timer aborts the request at `timeoutMs`
   * regardless of intervening activity, and is the one and only clock this
   * attempt is measured against.
   */
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
      const controller = new AbortController();
      let settled = false;

      const deadlineTimer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineTimer);
        fn();
      };

      this.logger.debug(`GET ${stripQuery(options.url)}`);

      const req = transport.request(
        {
          // Hardcoded literal, not `options.method` -- see class doc
          // comment. This is the second, independent enforcement of GET-only.
          method: "GET",
          hostname: parsed.hostname,
          port: parsed.port || undefined,
          path: `${parsed.pathname}${parsed.search}`,
          headers,
          signal: controller.signal,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const statusCode = res.statusCode ?? 0;
            const body = Buffer.concat(chunks).toString("utf8");
            if (statusCode >= 300) {
              settle(() =>
                reject(new ReadOnlyHttpStatusError(statusCode, options.url)),
              );
              return;
            }
            settle(() => resolve({ statusCode, headers: res.headers, body }));
          });
          res.on("error", (err) => settle(() => reject(err)));
        },
      );

      req.on("error", (err) => {
        if (controller.signal.aborted) {
          settle(() =>
            reject(new ReadOnlyHttpTimeoutError(options.url, timeoutMs)),
          );
          return;
        }
        settle(() => reject(err));
      });

      req.end();
    });
  }
}
