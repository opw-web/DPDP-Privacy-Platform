import { useQuery } from "@tanstack/react-query";
import { principalApiClient } from "../../lib/api-client";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { ValueCard, type ValueCardSource } from "../components/ValueCard";

/** Plain-language section headings for `DataCategory` (`prisma/schema.prisma`) -- never the raw enum spelling. */
const CATEGORY_LABELS: Record<string, string> = {
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
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  return category
    .toLowerCase()
    .split("_")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Mirrors `MeDataValue` (`me.service.ts`). */
interface MeDataValueDto {
  id: string;
  canonicalField: string;
  value: string;
  sources: ValueCardSource[];
  purposes: string[];
  updatedAt: string;
}

/** Mirrors `MeDataCategoryGroup` (`me.service.ts` -> `GET /api/me/data`). */
interface MeDataCategoryGroupDto {
  dataCategory: string;
  values: MeDataValueDto[];
}

function DataPageSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1].map((section) => (
        <div key={section} className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * `/me/data` -- every value attributed to her, grouped by plain-language
 * category. Every value renders through `<ValueCard>`, so "Held in: ..."
 * and "Used for: ..." (or "Purpose not configured") appear for every
 * single one -- there is no code path here that shows a value on its own.
 */
export function MeDataPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["me", "data"],
    queryFn: () => principalApiClient.get<MeDataCategoryGroupDto[]>("/me/data"),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Your data</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Every value this organization holds about you, where it's held and what it's used for.
        </p>
      </div>

      {isLoading ? (
        <DataPageSkeleton />
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="Nothing on file yet"
          description="This organization has not linked any data to your account yet."
          action={{ label: "Back to your portal", to: "/me" }}
        />
      ) : (
        data.map((group) => (
          <section key={group.dataCategory} className="space-y-3">
            <h2 className="text-xl font-semibold">{categoryLabel(group.dataCategory)}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.values.map((value) => (
                <ValueCard
                  key={value.id}
                  canonicalField={value.canonicalField}
                  value={value.value}
                  sources={value.sources}
                  purposes={value.purposes}
                  updatedAt={value.updatedAt}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
