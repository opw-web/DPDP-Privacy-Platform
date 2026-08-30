/**
 * Transcribed VERBATIM from `DPDP_MVP1_FOUNDATION_AND_DISCOVERY.md` lines 723-728
 * (spec §4.2). Do not "improve" the shape here -- Task 12 (data source CRUD +
 * credential decryption) and Task 18 (sync pipeline) depend on this exact
 * interface staying byte-identical to the spec.
 */
export interface Connector {
  testConnection(): Promise<{
    ok: boolean;
    message: string;
    latencyMs: number;
  }>;
  discoverSchema(): Promise<
    { fieldName: string; sampleValue: string | null; inferredType: string }[]
  >;
  fetchRecords(
    cursor?: string,
  ): Promise<{ records: unknown[]; nextCursor?: string }>;
  fetchChanges(
    since: Date,
  ): Promise<{ records: unknown[]; nextCursor?: string }>;
}
