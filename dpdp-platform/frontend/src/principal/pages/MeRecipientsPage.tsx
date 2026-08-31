import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { principalApiClient } from "../../lib/api-client";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { DateTime } from "../../components/shared/DateTime";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";

/**
 * Plain-language labels for `DataCategory` (`prisma/schema.prisma`). Kept
 * as its own small copy rather than importing `MeDataPage`'s -- exporting
 * a helper out of a page component just to share an 11-entry map trades a
 * real problem (drift) for a fast-refresh warning on a component file;
 * duplicating the map instead avoids both.
 */
const RECIPIENT_CATEGORY_LABELS: Record<string, string> = {
  IDENTITY: "Identity",
  CONTACT: "Contact details",
  DEMOGRAPHIC: "Personal details",
  FINANCIAL: "Financial",
  TRANSACTIONAL: "Purchases and orders",
  BEHAVIOURAL: "Activity",
  LOCATION: "Location",
  HEALTH: "Health",
  BIOMETRIC: "Biometric",
  GOVT_ID: "Government ID",
  OTHER: "Other",
};

function categoryLabel(category: string): string {
  const known = RECIPIENT_CATEGORY_LABELS[category];
  if (known) return known;
  return category
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Plain-language labels for `RecipientType` (`prisma/schema.prisma`).
 * Neither raw value ever reaches this screen -- "data fiduciary" and
 * "processor" are compliance vocabulary that has no place in a portal
 * read by members of the public (spec requirement: no jargon).
 */
const RECIPIENT_TYPE_LABELS: Record<string, string> = {
  DATA_PROCESSOR: "A service this organization uses",
  OTHER_DATA_FIDUCIARY: "Another organization",
};

function recipientTypeLabel(type: string): string {
  return RECIPIENT_TYPE_LABELS[type] ?? "Another organization";
}

/** Mirrors `PrincipalRecipientsService.listForPrincipal()`'s response shape (`principal-recipients.service.ts`). */
interface MeRecipientDto {
  id: string;
  description: string;
  dataCategories: string[];
  startedAt: string;
  endedAt: string | null;
  recipient: {
    id: string;
    name: string;
    type: string;
    country: string;
  };
}

/**
 * `/me/recipients` -- who her data has been shared with and a
 * plain-language description of what (RT-04 preview). Read-only in
 * MVP 1: there is nothing to submit or change on this page.
 */
export function MeRecipientsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "recipients"],
    queryFn: () => principalApiClient.get<MeRecipientDto[]>("/me/recipients"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Who it's shared with</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Other organizations this organization has shared your data with, and what was shared.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Nothing shared yet"
          description="This organization has not shared any of your data with anyone else."
          action={{ label: "Back to your portal", to: "/me" }}
        />
      ) : (
        <div className="space-y-3">
          {data.map((activity) => (
            <Card key={activity.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Users className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="flex-1">
                  <CardTitle className="text-lg">{activity.recipient.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {recipientTypeLabel(activity.recipient.type)}
                  </p>
                </div>
                {activity.endedAt ? <Badge variant="secondary">Ended</Badge> : null}
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-base">{activity.description}</p>
                <div className="flex flex-wrap gap-1.5">
                  {activity.dataCategories.map((category) => (
                    <Badge key={category} variant="outline">
                      {categoryLabel(category)}
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Shared since <DateTime value={activity.startedAt} />
                  {activity.endedAt ? (
                    <>
                      {" "}
                      until <DateTime value={activity.endedAt} />
                    </>
                  ) : null}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
