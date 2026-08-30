import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { employeeApiClient, ApiError } from "../../lib/api-client";
import { DataTable } from "../../components/shared/DataTable";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { NotReviewedChip } from "../components/NotReviewedChip";
import { PurposeForm } from "../components/PurposeForm";
import { humanizeEnum } from "../lib/enum-options";

/** Mirrors `PublicPurpose` (purposes.service.ts) exactly. */
interface Purpose {
  id: string;
  code: string;
  name: string;
  description: string;
  lawfulBasis: "CONSENT" | "LEGITIMATE_USE";
  legitimateUseLimb: string | null;
  basisJustification: string;
  dataCategories: string[];
  goodsOrServicesDescription: string | null;
  reviewedByEmployeeId: string | null;
  reviewedAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  isReviewed: boolean;
}

function LawfulBasisCell({ purpose }: { purpose: Purpose }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{humanizeEnum(purpose.lawfulBasis)}</span>
      {purpose.lawfulBasis === "LEGITIMATE_USE" && purpose.legitimateUseLimb ? (
        <span className="text-xs text-muted-foreground">
          s.7 limb: {humanizeEnum(purpose.legitimateUseLimb)}
        </span>
      ) : null}
      {purpose.lawfulBasis === "CONSENT" ? (
        <span className="text-xs text-muted-foreground">
          Requires a notice and consent record (MVP 2) before reliance.
        </span>
      ) : null}
    </div>
  );
}

/**
 * `/app/purposes` -- the purpose register (spec line 853). Name, lawful
 * basis with its s.7 limb, data categories and review status, per the
 * task brief. The "Not yet reviewed" chip is rendered by
 * `NotReviewedChip`, the one component that owns that rule everywhere a
 * purpose is shown.
 */
export function PurposesPage() {
  const [isCreating, setIsCreating] = useState(false);
  const queryClient = useQueryClient();

  const { data: purposes, isLoading } = useQuery({
    queryKey: ["purposes"],
    queryFn: () => employeeApiClient.get<Purpose[]>("/purposes"),
  });

  const reviewPurpose = useMutation({
    mutationFn: (id: string) => employeeApiClient.post(`/purposes/${id}/review`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["purposes"] });
      toast.success("Purpose marked as reviewed.");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError && error.message
          ? error.message
          : "Could not record this review. Please try again.";
      toast.error(message);
    },
  });

  const columns: ColumnDef<Purpose>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            <NotReviewedChip isReviewed={row.original.isReviewed} />
          </div>
          <span className="text-xs text-muted-foreground">{row.original.code}</span>
        </div>
      ),
    },
    {
      id: "lawfulBasis",
      header: "Lawful basis",
      cell: ({ row }) => <LawfulBasisCell purpose={row.original} />,
    },
    {
      id: "dataCategories",
      header: "Data categories",
      cell: ({ row }) =>
        row.original.dataCategories.length === 0 ? (
          <span className="text-sm text-muted-foreground">None declared</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {row.original.dataCategories.map((category) => (
              <Badge key={category} variant="secondary">
                {humanizeEnum(category)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      id: "reviewStatus",
      header: "Review status",
      cell: ({ row }) =>
        row.original.isReviewed ? (
          <span className="text-sm text-muted-foreground">
            Reviewed{" "}
            {row.original.reviewedAt ? <DateTime value={row.original.reviewedAt} /> : null}
          </span>
        ) : (
          <PermissionGate
            permission="CAN_MANAGE_PURPOSES"
            fallback={<NotReviewedChip isReviewed={false} />}
          >
            <Button
              size="sm"
              variant="outline"
              disabled={reviewPurpose.isPending}
              onClick={() => reviewPurpose.mutate(row.original.id)}
            >
              Mark as reviewed
            </Button>
          </PermissionGate>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Purposes</h1>
          <p className="text-sm text-muted-foreground">
            Every processing purpose, its lawful basis, and whether it has been reviewed.
          </p>
        </div>
        <PermissionGate permission="CAN_MANAGE_PURPOSES">
          <Button onClick={() => setIsCreating((current) => !current)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New purpose
          </Button>
        </PermissionGate>
      </div>

      {isCreating ? (
        <Card>
          <CardHeader>
            <CardTitle>New purpose</CardTitle>
          </CardHeader>
          <CardContent>
            <PurposeForm
              onSuccess={() => setIsCreating(false)}
              onCancel={() => setIsCreating(false)}
            />
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        data={purposes ?? []}
        isLoading={isLoading}
        getRowId={(purpose) => purpose.id}
        emptyState={{
          description:
            "No processing purposes have been declared yet. A purpose is never inferred from a data source name (LB-02).",
          action: { label: "New purpose", onClick: () => setIsCreating(true) },
        }}
      />
    </div>
  );
}
