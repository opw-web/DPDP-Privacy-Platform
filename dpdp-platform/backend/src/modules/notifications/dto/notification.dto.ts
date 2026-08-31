import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ActorType } from "@prisma/client";

/**
 * The ONLY shape a `Notification` row is ever returned in from this
 * module -- same discipline as `PURPOSE_PUBLIC_SELECT` /
 * `EMPLOYEE_PUBLIC_SELECT` elsewhere. Deliberately omits
 * `organizationId`, `employeeId` and `dataPrincipalId`: the caller
 * already knows who they are, and this response must never leak whose
 * row it is beyond that (there is exactly one possible answer: "you").
 */
export class NotificationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ActorType })
  audience!: ActorType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty()
  severity!: string;

  @ApiPropertyOptional({ nullable: true })
  linkPath!: string | null;

  @ApiPropertyOptional({ nullable: true })
  campaignId!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: "date-time" })
  readAt!: Date | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: Date;
}

/**
 * `GET /api/notifications` response. `unreadCount` rides alongside
 * `items` so the polling frontend (spec line 901: TanStack Query
 * `refetchInterval` of 20s) can render an unread badge without a second
 * request every poll.
 */
export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationDto] })
  items!: NotificationDto[];

  @ApiProperty()
  unreadCount!: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty({ description: "Number of rows marked read by this call." })
  updated!: number;
}
