/**
 * `SyncJob.errorLog` must never carry personal data -- no record payload,
 * no field value (task 18 brief: "the constraint most at risk in this
 * task"). A record key and an error class/message are fine; a raw field
 * value baked into an error's `.message` is not.
 *
 * That risk is real, not hypothetical: `LinkingService`'s
 * `IdentifierOwnershipConflictError` (src/modules/identity/linking.service.ts)
 * formats its message as `Cannot attach ${type} identifier "${value}": ...`
 * -- `value` there is a normalized email or phone number, i.e. exactly the
 * personal data this column must never contain. A future error type
 * anywhere in the identity/normalization/connector call chain could just
 * as easily do the same without anyone here reviewing it against this
 * constraint.
 *
 * Rather than maintaining a DENY-list of error classes known to embed a
 * value (which only protects against errors that exist today), this is an
 * ALLOW-list: an error's `.message` is only ever written to `errorLog` if
 * its class is explicitly named here as vetted-safe. Every class in the
 * allow-list below has been read and confirmed to never interpolate a
 * field value into its message. Anything else -- including every domain
 * error this pipeline doesn't already know about -- gets its class name
 * only, with the message dropped. Fail closed: an unrecognized error
 * class losing its message text is a debugging inconvenience; an
 * unrecognized error class leaking an email address into an
 * evidentiary, append-only log is not recoverable.
 */
const MESSAGE_SAFE_ERROR_CLASSES: ReadonlySet<string> = new Set([
  // Connector/network-layer errors (src/modules/connectors/rest-api.connector.ts,
  // src/modules/connectors/http/read-only-http.client.ts): each of these
  // messages names only the data source, a page number, a pagination
  // cap, an already-query-stripped URL, or a raw (unparsed) cursor string
  // -- never a fetched record's field values.
  "PageCapExceededError",
  "InvalidCursorError",
  "UnsupportedPaginationStyleError",
  // This pipeline's own key-extraction guard (payload-hash.ts's sibling
  // sync-pipeline.service.ts): names only that a key was absent, never
  // the record itself.
  "MissingRecordKeyError",
  // NestJS's NotFoundException, thrown by AssemblyService/AgeService/
  // LinkingService when a referenced id no longer resolves inside the
  // pipeline's own transaction: message interpolates only an internal
  // UUID (dataPrincipalId/normalizedRecordId), never a person's data.
  "NotFoundException",
  // This pipeline's own lock guard (task 18 review, Critical 1): names
  // only the dataSourceId, never a fetched record's field values.
  "SyncLockUnavailableError",
]);

export interface SyncErrorDescription {
  errorClass: string;
  message?: string;
}

/** Describes an unknown thrown value for `SyncJob.errorLog`, per the allow-list above. */
export function describeSyncError(err: unknown): SyncErrorDescription {
  if (!(err instanceof Error)) {
    return { errorClass: "UnknownError" };
  }
  const errorClass = err.constructor.name || "Error";
  if (MESSAGE_SAFE_ERROR_CLASSES.has(errorClass)) {
    return { errorClass, message: err.message };
  }
  return { errorClass };
}

/** Thrown when a fetched record has no usable value for the data source's configured external id field -- persistence cannot key an upsert without it. */
export class MissingRecordKeyError extends Error {
  constructor() {
    super(
      "Record has no usable value for the data source's configured external id field.",
    );
    this.name = "MissingRecordKeyError";
  }
}

/** Thrown when `SyncPipelineService` cannot acquire the per-source sync lock at the moment a run starts -- another run (manual or scheduled) genuinely holds it right now. Treated identically to a FETCH-stage failure: the run could not proceed at all. */
export class SyncLockUnavailableError extends Error {
  constructor(dataSourceId: string) {
    super(
      `Could not acquire the sync lock for data source "${dataSourceId}" -- another sync is already in progress.`,
    );
    this.name = "SyncLockUnavailableError";
  }
}
