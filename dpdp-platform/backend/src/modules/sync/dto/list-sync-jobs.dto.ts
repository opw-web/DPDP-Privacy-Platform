import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Not statutory -- an operational cap so `?limit=` cannot be used to pull an unbounded SyncJob history in one response. */
export const MAX_SYNC_JOB_LIST_LIMIT = 100;
export const DEFAULT_SYNC_JOB_LIST_LIMIT = 20;

export class ListSyncJobsQueryDto {
  @IsOptional()
  @IsString()
  dataSourceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SYNC_JOB_LIST_LIMIT)
  limit?: number;
}
