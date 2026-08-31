import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { EmptyState } from "../../components/shared/EmptyState";
import { Skeleton } from "../../components/shared/Skeleton";
import {
  CandidateComparison,
  type MatchCandidateListItem,
} from "../components/CandidateComparison";

function apiErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError &&
    error.body !== null &&
    typeof error.body === "object" &&
    "message" in error.body &&
    typeof (error.body as { message: unknown }).message === "string"
  ) {
    return (error.body as { message: string }).message;
  }
  return fallback;
}

/**
 * `/app/review` (spec line 857): the match-candidate queue, record vs
 * principal side by side (`CandidateComparison`), agreeing signals green
 * and conflicting signals red -- via `signalBadgeVariant`, the one shared
 * colour function -- and Confirm / Reject actions.
 *
 * Confirm links the candidate's record into the principal
 * (`MergeService.mergeRecordIntoPrincipal`, via `CandidatesService.confirm`)
 * -- never a destructive action, and reversible later via Unmerge on the
 * principal's profile. Reject only flips this candidate's own status.
 */
export function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [decidingId, setDecidingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["match-candidates", "PENDING"],
    queryFn: () =>
      employeeApiClient.get<MatchCandidateListItem[]>("/match-candidates?status=PENDING"),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["match-candidates"] });
  }

  const confirmMutation = useMutation({
    mutationFn: (id: string) => employeeApiClient.post(`/match-candidates/${id}/confirm`),
    onMutate: (id) => setDecidingId(id),
    onSuccess: () => {
      toast.success(
        "Record linked to the principal. Nothing was deleted, and this can be reversed with Unmerge.",
      );
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not confirm this match. Please try again."));
    },
    onSettled: () => setDecidingId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => employeeApiClient.post(`/match-candidates/${id}/reject`),
    onMutate: (id) => setDecidingId(id),
    onSuccess: () => {
      toast.success("Candidate rejected. No link was created.");
      invalidate();
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not reject this candidate. Please try again."));
    },
    onSettled: () => setDecidingId(null),
  });

  const candidates = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Records the deterministic matcher could not link automatically. Compare each record
          against the principal it might belong to and confirm or reject the match.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          description="No match candidate is currently waiting for review."
          action={{ label: "Go to dashboard", to: "/app" }}
        />
      ) : (
        <div className="space-y-4">
          {candidates.map((candidate) => (
            <CandidateComparison
              key={candidate.id}
              candidate={candidate}
              onConfirm={(id) => confirmMutation.mutate(id)}
              onReject={(id) => rejectMutation.mutate(id)}
              isDeciding={decidingId === candidate.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
