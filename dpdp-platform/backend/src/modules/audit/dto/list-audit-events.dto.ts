import { Transform } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { AUDIT_ACTIONS } from "../../../common/audit/audit-actions";

/** A bounded page keeps the audit read API from becoming an unbounded export. */
export const AUDIT_EVENTS_PAGE_SIZE = 25;
export const MAX_AUDIT_EVENTS_PAGE = 1_000;

/**
 * `GET /api/audit-events?...` (spec line 833). Filters by action, actor,
 * resource, subject principal and date range, with pagination -- exactly
 * the brief's list, no more. Read-only: this DTO backs a `findMany`, not
 * a write.
 */
export class ListAuditEventsDto {
  @IsOptional()
  @IsIn(AUDIT_ACTIONS)
  action?: (typeof AUDIT_ACTIONS)[number];

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  resourceType?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  subjectPrincipalId?: string;

  /** Inclusive lower bound on `createdAt`, ISO-8601. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive upper bound on `createdAt`, ISO-8601. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_AUDIT_EVENTS_PAGE)
  page = 1;
}
