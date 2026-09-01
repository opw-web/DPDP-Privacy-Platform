/**
 * Two fetch-wrapping clients -- `employeeApiClient` and `principalApiClient`
 * -- one per route tree. Each is built by `createApiClient` from its own,
 * independently-closed-over token store. There is no shared mutable object
 * that both clients read from: `createTokenStore()` returns a fresh `let
 * token` binding every time it is called, so `employeeTokenStore` and
 * `principalTokenStore` cannot alias one another by construction, not by
 * convention. A caller can still (mis)use the wrong client against the
 * wrong path, same as any other API surface, but the STORES themselves are
 * structurally incapable of leaking a token from one realm into the other.
 *
 * Both clients:
 *  - attach `Authorization: Bearer <token>` from their own store only,
 *  - send `credentials: "include"` so the realm's httpOnly refresh cookie
 *    rides along (the backend scopes each cookie to its own `/api/auth/...`
 *    path, so the browser itself will not send the employee cookie to a
 *    principal endpoint or vice versa),
 *  - on a 401, refresh once (de-duplicated so concurrent 401s trigger a
 *    single refresh call) and retry the original request exactly once,
 *  - on a failed refresh, clear their own token and hard-redirect to their
 *    own login page -- never the other realm's.
 */

export const API_BASE = `${import.meta.env.VITE_API_URL ?? "http://localhost:4000"}/api`;

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
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

/** A fresh `token` closure per call -- see the module docstring. */
function createTokenStore() {
  let token: string | null = null;
  return {
    get: (): string | null => token,
    set: (next: string | null): void => {
      token = next;
    },
  };
}

export const employeeTokenStore = createTokenStore();
export const principalTokenStore = createTokenStore();

interface RequestOptions {
  /** Skip attaching the Authorization header and skip the 401-refresh dance (login/refresh/logout calls). */
  skipAuth?: boolean;
}

interface ApiClientConfig {
  tokenStore: ReturnType<typeof createTokenStore>;
  refreshPath: string;
  loginPath: string;
}

function createApiClient(config: ApiClientConfig) {
  let refreshInFlight: Promise<boolean> | null = null;

  async function refresh(): Promise<boolean> {
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          const res = await fetch(`${API_BASE}${config.refreshPath}`, {
            method: "POST",
            credentials: "include",
          });
          if (!res.ok) return false;
          const data = (await res.json()) as { accessToken: string };
          config.tokenStore.set(data.accessToken);
          return true;
        } catch {
          return false;
        }
      })();
    }
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  function buildInit(init: RequestInit, opts: RequestOptions): RequestInit {
    const headers = new Headers(init.headers);
    const token = config.tokenStore.get();
    if (token && !opts.skipAuth) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    if (
      init.body !== undefined &&
      !(init.body instanceof FormData) &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }
    return { ...init, headers, credentials: "include" };
  }

  function onAuthExpired(): void {
    config.tokenStore.set(null);
    if (typeof window !== "undefined") {
      window.location.assign(config.loginPath);
    }
  }

  async function rawRequest(
    path: string,
    init: RequestInit,
    opts: RequestOptions,
  ): Promise<Response> {
    let res = await fetch(`${API_BASE}${path}`, buildInit(init, opts));

    if (res.status === 401 && !opts.skipAuth) {
      const refreshed = await refresh();
      if (!refreshed) {
        onAuthExpired();
        throw new ApiError(401, null, "Session expired");
      }
      res = await fetch(`${API_BASE}${path}`, buildInit(init, opts));
    }

    return res;
  }

  async function requestJson<T>(
    path: string,
    init: RequestInit = {},
    opts: RequestOptions = {},
  ): Promise<T> {
    const res = await rawRequest(path, init, opts);
    if (!res.ok) {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // no JSON body on this error response
      }
      throw new ApiError(res.status, body, extractMessage(body));
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return text.length > 0 ? (JSON.parse(text) as T) : (undefined as T);
  }

  return {
    get: <T>(path: string, opts?: RequestOptions): Promise<T> =>
      requestJson<T>(path, { method: "GET" }, opts),

    post: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
      requestJson<T>(
        path,
        { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined },
        opts,
      ),

    put: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
      requestJson<T>(
        path,
        { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined },
        opts,
      ),

    patch: <T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T> =>
      requestJson<T>(
        path,
        { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined },
        opts,
      ),

    delete: <T>(path: string, opts?: RequestOptions): Promise<T> =>
      requestJson<T>(path, { method: "DELETE" }, opts),

    /**
     * For file downloads (RoPA / access-log CSV exports) that must carry the
     * Authorization header -- a bare `<a href>` cannot, since the browser
     * navigation it triggers sends no bearer token. Returns the response
     * body as a Blob; the caller is responsible for turning it into a
     * download (e.g. an object URL clicked programmatically).
     */
    async getBlob(path: string, opts?: RequestOptions): Promise<Blob> {
      const res = await rawRequest(path, { method: "GET" }, opts ?? {});
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          // no JSON body on this error response
        }
        throw new ApiError(res.status, body, extractMessage(body));
      }
      return res.blob();
    },
  };
}

export const employeeApiClient = createApiClient({
  tokenStore: employeeTokenStore,
  refreshPath: "/auth/employee/refresh",
  loginPath: "/login",
});

export const principalApiClient = createApiClient({
  tokenStore: principalTokenStore,
  refreshPath: "/auth/principal/refresh",
  loginPath: "/me/login",
});

export type ApiClient = ReturnType<typeof createApiClient>;
