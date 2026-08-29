/**
 * Rule 6(1)(e) of the DPDP Rules requires access-visibility records (this
 * codebase's `PERSONAL_DATA_VIEWED` audit events, written by
 * `AccessLogService`) to be retained for at least one year. `365` is the
 * legal floor beneath which `ACCESS_LOG_RETENTION_DAYS` may never be
 * configured.
 *
 * This is the ONE place `365` appears as this rule's value in the
 * codebase -- `env.validation.ts` and `configuration.ts` both import it
 * rather than re-typing the literal. It is a cited, named, commented
 * CONFIGURATION FLOOR (an env-var validation bound with a legal source),
 * not business logic deciding a legal question on its own -- the
 * project's "nothing legal is hard-coded" rule permits exactly this kind
 * of constant; a bare `365` sprinkled through retention/cleanup logic
 * would not be permitted.
 */
export const ACCESS_LOG_RETENTION_FLOOR_DAYS = 365;
