/**
 * The shape of one entry in `ErasureTask.systemChecklist`. The spec's
 * model comment (line 316) gives the base shape verbatim as
 * `[{dataSourceId, done, byEmployeeId, at}]`; `excluded`/`excludedFields`
 * are this task's extension of that shape to satisfy RE-04 ("data ...
 * excluded from the task and shown as excluded") -- there is no separate
 * column for it, and the JSON blob is not schema-enforced, so the
 * extension is additive and backward compatible with the spec's base
 * shape (every entry still carries `dataSourceId`).
 */
export interface SystemChecklistEntry {
  dataSourceId: string;
  done: boolean;
  byEmployeeId: string | null;
  at: string | null;
  /** True when EVERY field this data source contributed for this
   * principal was carved out (RE-04) -- the source never appears as an
   * actionable item and `complete()` never requires it to be ticked. */
  excluded?: boolean;
  /** Canonical field names carved out from this source under RE-04's
   * Third Schedule account-access exemption, whether or not the source
   * is otherwise still actionable (a source can contribute BOTH excluded
   * and non-excluded fields). */
  excludedFields?: string[];
}

/** `ErasureTask.processorChecklist` entry shape, spec line 317, verbatim. */
export interface ProcessorChecklistEntry {
  recipientId: string;
  confirmed: boolean;
  ref: string | null;
  at: string | null;
}
