import { IsOptional, IsString } from "class-validator";

/**
 * `GET /api/audit-events/access-log.csv` (spec line 834, EV-08). The
 * access-log CSV is the `PERSONAL_DATA_VIEWED` view, filterable by
 * subject principal -- omitting `subjectPrincipalId` exports the whole
 * organization's access log.
 */
export class AccessLogExportDto {
  @IsOptional()
  @IsString()
  subjectPrincipalId?: string;
}
