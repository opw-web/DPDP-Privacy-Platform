import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key checked by `JwtEmployeeGuard` (and, in a later task, the
 * principal equivalent) to skip authentication for a handler or an entire
 * controller.
 */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marks a route (or a whole controller) as reachable without a verified
 * access token -- login, refresh, logout, health, and nothing else. There
 * is no self-signup endpoint anywhere in this codebase; `@Public()` exists
 * for the handful of routes that must run before any token can exist, not
 * as a general escape hatch.
 */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);
