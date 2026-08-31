import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentNotificationActor } from "./decorators/current-notification-actor.decorator";
import { JwtAnyActorGuard, NotificationCallerActor } from "./guards/jwt-any-actor.guard";
import {
  MarkAllReadResponseDto,
  NotificationDto,
  NotificationListResponseDto,
} from "./dto/notification.dto";
import { NotificationsService } from "./notifications.service";

/**
 * `/api/notifications` (spec line 886): "available to any authenticated
 * actor, employee or principal, each seeing only their own rows." Every
 * route is `@Public()` (to dodge the globally-registered
 * `JwtEmployeeGuard`) plus `@UseGuards(JwtAnyActorGuard)` -- the same
 * `@Public()` + guard-of-its-own pairing `MeController` uses for
 * `JwtPrincipalGuard`, generalised to accept either audience. See
 * `jwt-any-actor.guard.ts` for why neither existing guard alone can
 * serve this route.
 *
 * Polled every 20s by both portals via TanStack Query `refetchInterval`
 * (spec line 901, no WebSocket) -- `list()` is the hot path; see
 * `NotificationsService.list` for the index-shaped query behind it.
 */
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Public()
  @UseGuards(JwtAnyActorGuard)
  @ApiOkResponse({ type: NotificationListResponseDto })
  @Get()
  list(@CurrentNotificationActor() actor: NotificationCallerActor) {
    return this.notificationsService.list(actor);
  }

  @Public()
  @UseGuards(JwtAnyActorGuard)
  @ApiOkResponse({ type: NotificationDto })
  @HttpCode(HttpStatus.OK)
  @Post(":id/read")
  markRead(
    @Param("id") id: string,
    @CurrentNotificationActor() actor: NotificationCallerActor,
  ) {
    return this.notificationsService.markRead(id, actor);
  }

  @Public()
  @UseGuards(JwtAnyActorGuard)
  @ApiOkResponse({ type: MarkAllReadResponseDto })
  @HttpCode(HttpStatus.OK)
  @Post("read-all")
  markAllRead(@CurrentNotificationActor() actor: NotificationCallerActor) {
    return this.notificationsService.markAllRead(actor);
  }
}
