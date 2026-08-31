import { useSyncExternalStore } from "react";
import {
  API_BASE,
  employeeApiClient,
  employeeTokenStore,
  principalApiClient,
  principalTokenStore,
} from "./api-client";

export type AuthStatus = "idle" | "loading" | "authenticated" | "unauthenticated";

/** Mirrors `EmployeeAuthController.login()`'s `employee` field exactly (`employee-auth.controller.ts`). */
export interface EmployeeSummary {
  id: string;
  email: string;
  fullName: string;
}

/**
 * Mirrors `EmployeeAuthController.me()`'s response shape exactly.
 *
 * `permissions` is NOT currently returned by that endpoint -- today's
 * backend resolves `CAN_*` permissions per-request, server-side only
 * (`PermissionsGuard`), and never exposes the actor's own resolved set to
 * the client. It is kept here, defaulted to `[]`, so `PermissionGate`
 * (lib/permissions.ts) has a stable, forward-compatible field to read: the
 * moment a future backend change adds `permissions: string[]` to this
 * response, it flows straight through with no frontend change. Until then
 * every `PermissionGate` is closed (fails safe -- cosmetic-only, the server
 * remains the real enforcement point either way). See the task report for
 * the flagged backend follow-up.
 */
export interface EmployeeSession extends EmployeeSummary {
  organizationId: string;
  status: string;
  role: { id: string; code: string; name: string };
  permissions: string[];
}

/** Mirrors `PRINCIPAL_ACCOUNT_PUBLIC_SELECT` in `principal-auth.service.ts` exactly. */
export interface PrincipalSession {
  id: string;
  organizationId: string;
  dataPrincipalId: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface RawEmployeeMe {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  status: string;
  role: { id: string; code: string; name: string };
  permissions?: string[];
}

function toEmployeeSession(raw: RawEmployeeMe): EmployeeSession {
  return { ...raw, permissions: raw.permissions ?? [] };
}

type Listener = () => void;

function createAuthStore<TSession>() {
  let state: { status: AuthStatus; session: TSession | null } = {
    status: "idle",
    session: null,
  };
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState: (next: { status: AuthStatus; session: TSession | null }) => {
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const employeeAuthStore = createAuthStore<EmployeeSession>();
const principalAuthStore = createAuthStore<PrincipalSession>();

// ── Employee realm ──────────────────────────────────────────────────────

async function fetchEmployeeMe(): Promise<EmployeeSession> {
  const raw = await employeeApiClient.get<RawEmployeeMe>("/auth/employee/me");
  return toEmployeeSession(raw);
}

async function refreshEmployeeToken(): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/auth/employee/refresh`,
      { method: "POST", credentials: "include" },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    employeeTokenStore.set(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

/** Called once at app boot: tries to mint a fresh access token from the httpOnly refresh cookie, if any. */
export async function bootstrapEmployeeSession(): Promise<void> {
  employeeAuthStore.setState({ status: "loading", session: null });
  const refreshed = await refreshEmployeeToken();
  if (!refreshed) {
    employeeAuthStore.setState({ status: "unauthenticated", session: null });
    return;
  }
  try {
    const session = await fetchEmployeeMe();
    employeeAuthStore.setState({ status: "authenticated", session });
  } catch {
    employeeTokenStore.set(null);
    employeeAuthStore.setState({ status: "unauthenticated", session: null });
  }
}

export async function employeeLogin(email: string, password: string): Promise<void> {
  const result = await employeeApiClient.post<{
    accessToken: string;
    employee: EmployeeSummary;
  }>("/auth/employee/login", { email, password }, { skipAuth: true });
  employeeTokenStore.set(result.accessToken);
  const session = await fetchEmployeeMe();
  employeeAuthStore.setState({ status: "authenticated", session });
}

export async function employeeLogout(): Promise<void> {
  try {
    await employeeApiClient.post("/auth/employee/logout", undefined, { skipAuth: true });
  } finally {
    employeeTokenStore.set(null);
    employeeAuthStore.setState({ status: "unauthenticated", session: null });
  }
}

export function useEmployeeAuth() {
  const state = useSyncExternalStore(
    employeeAuthStore.subscribe,
    employeeAuthStore.getState,
  );
  return {
    status: state.status,
    employee: state.session,
    login: employeeLogin,
    logout: employeeLogout,
  };
}

// ── Principal realm ─────────────────────────────────────────────────────

async function refreshPrincipalToken(): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/auth/principal/refresh`,
      { method: "POST", credentials: "include" },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    principalTokenStore.set(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export async function bootstrapPrincipalSession(): Promise<void> {
  principalAuthStore.setState({ status: "loading", session: null });
  const refreshed = await refreshPrincipalToken();
  if (!refreshed) {
    principalAuthStore.setState({ status: "unauthenticated", session: null });
    return;
  }
  try {
    const session = await principalApiClient.get<PrincipalSession>("/auth/principal/me");
    principalAuthStore.setState({ status: "authenticated", session });
  } catch {
    principalTokenStore.set(null);
    principalAuthStore.setState({ status: "unauthenticated", session: null });
  }
}

export async function principalLogin(email: string, password: string): Promise<void> {
  const result = await principalApiClient.post<{
    accessToken: string;
    account: PrincipalSession;
  }>("/auth/principal/login", { email, password }, { skipAuth: true });
  principalTokenStore.set(result.accessToken);
  principalAuthStore.setState({ status: "authenticated", session: result.account });
}

export async function principalLogout(): Promise<void> {
  try {
    await principalApiClient.post("/auth/principal/logout", undefined, { skipAuth: true });
  } finally {
    principalTokenStore.set(null);
    principalAuthStore.setState({ status: "unauthenticated", session: null });
  }
}

export function usePrincipalAuth() {
  const state = useSyncExternalStore(
    principalAuthStore.subscribe,
    principalAuthStore.getState,
  );
  return {
    status: state.status,
    principal: state.session,
    login: principalLogin,
    logout: principalLogout,
  };
}
