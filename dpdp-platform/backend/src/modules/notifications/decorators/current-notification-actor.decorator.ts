import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { NotificationCallerActor } from "../guards/jwt-any-actor.guard";

/**
 * Reads the current actor off the request -- put there by
 * `JwtAnyActorGuard` after independently verifying the access token
 * against either audience. Same discipline as `CurrentActor` /
 * `CurrentPrincipal` elsewhere in this codebase: a handler never reads
 * an id from the request path/query/body to decide whose notifications
 * to return.
 */
export const CurrentNotificationActor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): NotificationCallerActor => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { notificationActor?: NotificationCallerActor }>();
    if (!request.notificationActor) {
      throw new Error(
        "@CurrentNotificationActor() used on a route with no actor " +
          "attached -- is JwtAnyActorGuard applied to this route?",
      );
    }
    return request.notificationActor;
  },
);
