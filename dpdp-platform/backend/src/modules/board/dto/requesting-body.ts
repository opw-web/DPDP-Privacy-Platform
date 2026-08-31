/**
 * `InformationRequest.requestingBody`'s vocabulary, transcribed from the
 * schema-as-built comment (`task-1-report.md` line 483: "requestingBody
 * String // BOARD | CENTRAL_GOVERNMENT") -- the column itself is a plain
 * `String`, not a Prisma enum, so this is a caller-facing convention
 * enforced by `@IsIn` on the DTOs, the same relationship
 * `ALGORITHM_OPERATIONS` has to `AlgorithmRegisterEntry.operations`.
 */
export const REQUESTING_BODIES = ["BOARD", "CENTRAL_GOVERNMENT"] as const;

export type RequestingBody = (typeof REQUESTING_BODIES)[number];
