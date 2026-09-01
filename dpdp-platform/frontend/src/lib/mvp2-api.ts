import type { ApiClient } from "./api-client";

/**
 * Shared MVP 2 API shapes/helpers that more than one frontend task reads
 * from -- kept out of any single component so tasks 17-24 have one source
 * of truth instead of five hand-copied guesses at the same DTO.
 */

// ── Notifications (spec line 886/901) ──────────────────────────────────

/**
 * Mirrors `NotificationDto`
 * (`backend/src/modules/notifications/dto/notification.dto.ts`) exactly.
 * Deliberately omits `organizationId`/`employeeId`/`dataPrincipalId` --
 * same as the backend DTO -- because the response never carries whose row
 * it is beyond "you".
 */
export interface NotificationDto {
  id: string;
  audience: "EMPLOYEE" | "PRINCIPAL";
  title: string;
  body: string;
  severity: string;
  linkPath: string | null;
  campaignId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Mirrors `NotificationListResponseDto`. `GET /api/notifications`'s response shape. */
export interface NotificationListResponse {
  items: NotificationDto[];
  unreadCount: number;
}

/** Mirrors `MarkAllReadResponseDto`. `POST /api/notifications/read-all`'s response shape. */
export interface MarkAllReadResponse {
  updated: number;
}

/**
 * `GET /api/notifications` -- available to either realm's client
 * (`employeeApiClient` or `principalApiClient`, see `api-client.ts`); the
 * caller passes whichever one matches the shell it is mounted in.
 */
export function listNotifications(apiClient: ApiClient): Promise<NotificationListResponse> {
  return apiClient.get<NotificationListResponse>("/notifications");
}

/** `POST /api/notifications/:id/read`. */
export function markNotificationRead(apiClient: ApiClient, id: string): Promise<NotificationDto> {
  return apiClient.post<NotificationDto>(`/notifications/${id}/read`);
}

/** `POST /api/notifications/read-all`. */
export function markAllNotificationsRead(apiClient: ApiClient): Promise<MarkAllReadResponse> {
  return apiClient.post<MarkAllReadResponse>("/notifications/read-all");
}

// ── Rule basis (spec line 575) ──────────────────────────────────────────

/**
 * The four ways a compliance rule's deadline/threshold is sourced.
 * `STATUTORY`/`SECTORAL` carry a real legal citation; `ORG_POLICY`/
 * `INTERNAL_TARGET` are the fiduciary's own configuration and must never
 * be presented as law -- `RuleBasisChip` (components/shared) is the one
 * component that renders this distinction, so every screen naming a
 * rule's basis should render through it rather than rolling its own
 * label/colour mapping.
 */
export type RuleBasis = "STATUTORY" | "SECTORAL" | "ORG_POLICY" | "INTERNAL_TARGET";
