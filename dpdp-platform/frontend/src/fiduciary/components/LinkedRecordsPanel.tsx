import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link2Off, X } from "lucide-react";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { usePermission } from "../../lib/permissions";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { DateTime } from "../../components/shared/DateTime";
import { SourceChip } from "../../components/shared/SourceChip";

/** Mirrors one entry of `PrincipalsService.getSourceRecords()`'s `records` array (`principals/principals.service.ts`). */
interface SourceRecordItem {
  id: string;
  dataSourceId: string;
  sourceRecordKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  source: { id: string; name: string };
  normalizedRecordId: string;
  link: { confidence: string; createdAt: string };
}

interface SourceRecordsResponse {
  principal: { id: string; reference: string };
  records: SourceRecordItem[];
}

function unmergeErrorMessage(error: unknown): string {
  if (
    error instanceof ApiError &&
    error.body !== null &&
    typeof error.body === "object" &&
    "message" in error.body &&
    typeof (error.body as { message: unknown }).message === "string"
  ) {
    return (error.body as { message: string }).message;
  }
  return "Could not detach this record. Please try again.";
}

interface LinkedRecordsPanelProps {
  principalId: string;
  /**
   * Called after a successful unmerge so the parent page can refresh the
   * rest of the profile: a detached source's lineage chip must disappear
   * from every value it used to contribute to, immediately (Check 9 --
   * "the phone lineage chip no longer names the detached source").
   */
  onUnmerged: () => void;
}

/**
 * `GET /api/principals/:id/source-records` (`CAN_VIEW_ALL_PERSONAL_DATA`)
 * plus the Unmerge action (`POST /api/principals/:id/unmerge`,
 * `CAN_RESOLVE_IDENTITIES`). Unmerge is a LINK operation, never a
 * destruction: `MergeService.unmerge` never touches `SourceRecord` --
 * every string in this panel says "detach"/"new profile", never
 * "delete"/"replace"/"overwrite", and the dialog will not submit without a
 * typed reason (`IdentityLink.detachReason` requires one).
 */
export function LinkedRecordsPanel({ principalId, onUnmerged }: LinkedRecordsPanelProps) {
  const canViewAll = usePermission("CAN_VIEW_ALL_PERSONAL_DATA");
  const queryClient = useQueryClient();
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["principals", principalId, "source-records"],
    queryFn: () =>
      employeeApiClient.get<SourceRecordsResponse>(
        `/principals/${principalId}/source-records`,
      ),
    enabled: canViewAll,
  });

  const unmergeMutation = useMutation({
    mutationFn: (normalizedRecordId: string) =>
      employeeApiClient.post(`/principals/${principalId}/unmerge`, {
        normalizedRecordId,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success(
        "Record detached into a new profile. Nothing was deleted, and the record can be linked again later.",
      );
      setOpenRecordId(null);
      setReason("");
      void queryClient.invalidateQueries({
        queryKey: ["principals", principalId, "source-records"],
      });
      onUnmerged();
    },
    onError: (error: unknown) => {
      toast.error(unmergeErrorMessage(error));
    },
  });

  if (!canViewAll) {
    return (
      <EmptyState
        title="Linked source records"
        description="Viewing individual source records requires the Can View All Personal Data permission."
        action={{ label: "Back to principals", to: "/app/principals" }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  const records = data?.records ?? [];
  if (records.length === 0) {
    return (
      <EmptyState
        title="Linked source records"
        description="No source records are currently linked to this profile."
        action={{ label: "Open review queue", to: "/app/review" }}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="linked-records-panel">
      {records.map((record) => (
        <div
          key={record.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border p-3"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <SourceChip label={record.source.name} />
              <span className="font-mono text-xs text-muted-foreground">
                {record.sourceRecordKey}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              First seen <DateTime value={record.firstSeenAt} /> &middot; last seen{" "}
              <DateTime value={record.lastSeenAt} /> &middot; linked with{" "}
              {record.link.confidence.toLowerCase()} confidence
            </p>
          </div>
          <PermissionGate permission="CAN_RESOLVE_IDENTITIES">
            <Dialog.Root
              open={openRecordId === record.id}
              onOpenChange={(open) => {
                setOpenRecordId(open ? record.id : null);
                setReason("");
              }}
            >
              <Dialog.Trigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
                  <Link2Off className="h-4 w-4" aria-hidden="true" />
                  Unmerge
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-lg border border-border bg-card p-6 shadow-lg">
                  <div className="flex items-start justify-between">
                    <Dialog.Title className="text-sm font-semibold">
                      Unmerge this record
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        aria-label="Close"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="text-sm text-muted-foreground">
                    This detaches &ldquo;{record.sourceRecordKey}&rdquo; ({record.source.name})
                    into its own new profile. The source record itself is never changed or
                    deleted, and this can be reversed by matching the record again later.
                  </Dialog.Description>
                  <div className="space-y-1.5">
                    <label htmlFor={`unmerge-reason-${record.id}`} className="text-sm font-medium">
                      Reason (required)
                    </label>
                    <textarea
                      id={`unmerge-reason-${record.id}`}
                      className="flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Why does this record not belong to this profile?"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Dialog.Close asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </Dialog.Close>
                    <Button
                      size="sm"
                      disabled={reason.trim().length === 0 || unmergeMutation.isPending}
                      onClick={() => unmergeMutation.mutate(record.normalizedRecordId)}
                    >
                      Unmerge
                    </Button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </PermissionGate>
        </div>
      ))}
    </div>
  );
}
