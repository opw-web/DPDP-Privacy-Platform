import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { RequestStatus, RequestType } from "@prisma/client";

/** `GET /api/requests?status=&type=&assignee=&overdue=` (spec line 852). */
export class ListRequestsDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @IsEnum(RequestType)
  type?: RequestType;

  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === "true" || value === true)
  @IsBoolean()
  overdue?: boolean;
}
