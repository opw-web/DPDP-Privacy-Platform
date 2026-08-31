/**
 * Every audit action MVP 1 can record, transcribed verbatim from
 * `DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md` lines 880-891 -- a string-literal
 * union, not an enum of our own invention, so it stays byte-identical to
 * the spec's names.
 *
 * NOTE: the spec's §4.7 prose claims "33 MVP 1 action names", but the
 * fenced block at lines 880-891 lists 35 distinct names (11 of its 12
 * lines carry 3 names each, one line carries 2 -- 11*3+2=35). Per the task
 * brief's explicit instruction to "transcribe the names exactly" rather
 * than reconcile the count, this union originally contained all 35 names
 * that actually appear in the block. Task 16 adds the single authorized
 * extension `MATCH_CANDIDATE_CREATED`: candidate creation is a real state
 * change, and neither CONFIRMED nor REJECTED truthfully describes it.
 */
export type AuditAction =
  | "EMPLOYEE_LOGIN_SUCCEEDED"
  | "EMPLOYEE_LOGIN_FAILED"
  | "PRINCIPAL_LOGIN_SUCCEEDED"
  | "EMPLOYEE_CREATED"
  | "EMPLOYEE_DISABLED"
  | "EMPLOYEE_ROLE_CHANGED"
  | "ORG_SETTINGS_UPDATED"
  | "SDF_STATUS_DECLARED"
  | "THIRD_SCHEDULE_CLASS_DECLARED"
  | "PURPOSE_CREATED"
  | "PURPOSE_UPDATED"
  | "PURPOSE_REVIEWED"
  | "DATA_SOURCE_CREATED"
  | "DATA_SOURCE_UPDATED"
  | "DATA_SOURCE_DELETED"
  | "DATA_SOURCE_CREDENTIALS_ROTATED"
  | "FIELD_MAPPING_UPDATED"
  | "RECIPIENT_CREATED"
  | "RECIPIENT_UPDATED"
  | "SHARING_ACTIVITY_CREATED"
  | "TRANSFER_CREATED"
  | "RETENTION_POLICY_CREATED"
  | "SECURITY_MEASURE_UPDATED"
  | "SYNC_STARTED"
  | "SYNC_COMPLETED"
  | "SYNC_FAILED"
  | "PRINCIPAL_CREATED"
  | "IDENTITY_LINKED"
  | "IDENTITY_DETACHED"
  | "MATCH_CANDIDATE_CREATED"
  | "MATCH_CANDIDATE_CONFIRMED"
  | "MATCH_CANDIDATE_REJECTED"
  | "AGE_STATUS_SET"
  | "PERSONAL_DATA_VIEWED"
  | "EVIDENCE_EXPORTED"
  | "TOKEN_REUSE_DETECTED";

/** All 36 action names as a runtime array, for tests and validation. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  "EMPLOYEE_LOGIN_SUCCEEDED",
  "EMPLOYEE_LOGIN_FAILED",
  "PRINCIPAL_LOGIN_SUCCEEDED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_DISABLED",
  "EMPLOYEE_ROLE_CHANGED",
  "ORG_SETTINGS_UPDATED",
  "SDF_STATUS_DECLARED",
  "THIRD_SCHEDULE_CLASS_DECLARED",
  "PURPOSE_CREATED",
  "PURPOSE_UPDATED",
  "PURPOSE_REVIEWED",
  "DATA_SOURCE_CREATED",
  "DATA_SOURCE_UPDATED",
  "DATA_SOURCE_DELETED",
  "DATA_SOURCE_CREDENTIALS_ROTATED",
  "FIELD_MAPPING_UPDATED",
  "RECIPIENT_CREATED",
  "RECIPIENT_UPDATED",
  "SHARING_ACTIVITY_CREATED",
  "TRANSFER_CREATED",
  "RETENTION_POLICY_CREATED",
  "SECURITY_MEASURE_UPDATED",
  "SYNC_STARTED",
  "SYNC_COMPLETED",
  "SYNC_FAILED",
  "PRINCIPAL_CREATED",
  "IDENTITY_LINKED",
  "IDENTITY_DETACHED",
  "MATCH_CANDIDATE_CREATED",
  "MATCH_CANDIDATE_CONFIRMED",
  "MATCH_CANDIDATE_REJECTED",
  "AGE_STATUS_SET",
  "PERSONAL_DATA_VIEWED",
  "EVIDENCE_EXPORTED",
  "TOKEN_REUSE_DETECTED",
];
