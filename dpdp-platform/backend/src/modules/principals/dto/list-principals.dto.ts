import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { AgeStatus } from "@prisma/client";

/** A bounded page keeps a broad trigram search from becoming an unbounded export. */
export const PRINCIPALS_PAGE_SIZE = 25;
export const MAX_PRINCIPALS_PAGE = 1_000;

export class ListPrincipalsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(["UNKNOWN", "ADULT", "CHILD", "GUARDIAN_REPRESENTED"])
  ageStatus?: AgeStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(MAX_PRINCIPALS_PAGE)
  page = 1;
}
