import { CandidateStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

/**
 * `GET /api/match-candidates?status=PENDING` (spec line 828). Ambiguity
 * ruling (task brief): `status` filters; when the caller omits it
 * entirely this defaults to `PENDING`, matching the one example the spec
 * itself documents and the natural default for a review QUEUE (things
 * still waiting for a decision) rather than a full history. A caller that
 * wants CONFIRMED/REJECTED history passes `status` explicitly.
 */
export class ListMatchCandidatesQueryDto {
  @IsOptional()
  @IsEnum(CandidateStatus)
  status?: CandidateStatus;
}
