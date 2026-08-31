import { useQuery } from "@tanstack/react-query";
import { Database } from "lucide-react";
import { principalApiClient } from "../../lib/api-client";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { Card, CardContent } from "../../components/ui/card";

/** Mirrors `MeService.getSources()`'s response shape (`me.service.ts` -> `GET /api/me/sources`). */
interface MeSourceDto {
  id: string;
  name: string;
}

/**
 * `/me/sources` -- a plain-language list of the systems that hold her
 * data. Read-only; nothing on this page writes anything.
 */
export function MeSourcesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "sources"],
    queryFn: () => principalApiClient.get<MeSourceDto[]>("/me/sources"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Where it came from</h1>
        <p className="mt-1 text-base text-muted-foreground">
          The systems this organization uses that hold some of your data.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No systems linked yet"
          description="This organization has not linked any of its systems to your account yet."
          action={{ label: "Back to your portal", to: "/me" }}
        />
      ) : (
        <div className="space-y-3">
          {data.map((source) => (
            <Card key={source.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-lg">{source.name}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
