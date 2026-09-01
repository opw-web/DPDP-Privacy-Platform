import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, History, ShieldAlert, ShieldCheck } from "lucide-react";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { Skeleton } from "../../components/shared/Skeleton";
import { EmptyState } from "../../components/shared/EmptyState";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { SelectControl } from "../components/form-controls";
import { AuditEventRow, type AuditEventListItem } from "../components/AuditEventRow";
import { humanizeEnum } from "../lib/enum-options";

/**
 * Transcribed verbatim from `AUDIT_ACTIONS`
 * (`common/audit/audit-actions.ts`) for the action filter dropdown only --
 * the frontend cannot import backend source, so this list must be kept in
 * sync by hand if the backend's union ever changes.
 */
const AUDIT_ACTION_VALUES = [
  "EMPLOYEE_LOGIN_SUCCEEDED",
  "EMPLOYEE_LOGIN_FAILED",
  "PRINCIPAL_LOGIN_SUCCEEDED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_DISABLED",
  "EMPLOYEE_ROLE_CHANGED",
  "ORG_SETTINGS_UPDATED",
  "SDF_STATUS_DECLARED",
  "THIRD_SCHEDULE_CLASS_DECLARED",
  "PURPOSE_CREATED",
  "PURPOSE_UPDATED",
  "PURPOSE_REVIEWED",
  "DATA_SOURCE_CREATED",
  "DATA_SOURCE_UPDATED",
  "DATA_SOURCE_DELETED",
  "DATA_SOURCE_CREDENTIALS_ROTATED",
  "FIELD_MAPPING_UPDATED",
  "RECIPIENT_CREATED",
  "RECIPIENT_UPDATED",
  "SHARING_ACTIVITY_CREATED",
  "TRANSFER_CREATED",
  "RETENTION_POLICY_CREATED",
  "SECURITY_MEASURE_UPDATED",
  "SYNC_STARTED",
  "SYNC_COMPLETED",
  "SYNC_FAILED",
  "PRINCIPAL_CREATED",
  "IDENTITY_LINKED",
  "IDENTITY_DETACHED",
  "MATCH_CANDIDATE_CREATED",
  "MATCH_CANDIDATE_CONFIRMED",
  "MATCH_CANDIDATE_REJECTED",
  "AGE_STATUS_SET",
  "PERSONAL_DATA_VIEWED",
  "EVIDENCE_EXPORTED",
  "TOKEN_REUSE_DETECTED",
  "COMPLIANCE_RULE_CHANGED",
  "COMPLIANCE_RULE_REVIEWED",
  "NOTICE_PUBLISHED",
  "NOTICE_VERSION_CREATED",
  "CONSENT_GRANTED",
  "CONSENT_WITHDRAWN",
  "CONSENT_DENIED",
  "CONSENT_IMPORTED",
  "GUARDIAN_REGISTERED",
  "GUARDIAN_VERIFIED",
  "CHILD_EXEMPTION_CLAIMED",
  "REQUEST_CREATED",
  "REQUEST_STATUS_CHANGED",
  "REQUEST_IDENTITY_VERIFIED",
  "REQUEST_FLAGGED_FRIVOLOUS",
  "ACCESS_REPORT_GENERATED",
  "ERASURE_TASK_CREATED",
  "ERASURE_TASK_COMPLETED",
  "LEGAL_HOLD_CREATED",
  "CAMPAIGN_CREATED",
  "CAMPAIGN_APPROVED",
  "CAMPAIGN_SENT",
  "TEMPLATE_UPDATED",
  "BREACH_CREATED",
  "BREACH_OBLIGATION_COMPLETED",
  "BREACH_EXTENSION_RECORDED",
  "BREACH_CLOSED",
  "SDF_ASSESSMENT_COMPLETED",
  "ALGORITHM_REGISTER_UPDATED",
  "INFORMATION_REQUEST_RECORDED",
  "NON_DISCLOSURE_SUPPRESSION_APPLIED",
  "NOMINATION_UPDATED",
  "TEMPLATE_CREATED",
] as const;

/** Mirrors `AuditEventListResult` (`audit-read.service.ts`) exactly. */
interface AuditEventListResult {
  items: AuditEventListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/** Mirrors `ChainVerificationResult` from the evidence module. */
export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  firstBrokenSequence: string | null;
  reason: string | null;
}

interface AuditFilters {
  action: string;
  actorId: string;
  resourceType: string;
  resourceId: string;
  subjectPrincipalId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AuditFilters = {
  action: "",
  actorId: "",
  resourceType: "",
  resourceId: "",
  subjectPrincipalId: "",
  from: "",
  to: "",
};

/** Mirrors `ListAuditEventsDto` (`list-audit-events.dto.ts`) query parameter names exactly. */
function buildQueryString(filters: AuditFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.actorId) params.set("actorId", filters.actorId);
  if (filters.resourceType) params.set("resourceType", filters.resourceType);
  if (filters.resourceId) params.set("resourceId", filters.resourceId);
  if (filters.subjectPrincipalId) params.set("subjectPrincipalId", filters.subjectPrincipalId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("page", String(page));
  return params.toString();
}

/** Turns an already-authenticated `Blob` into a save-file dialog via a throwaway object URL -- same idiom as `ExportButtons.saveBlob`, duplicated locally rather than importing a component owned by another task's file. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * `/app/audit` (spec line 859): a filterable, paginated audit table with
 * expandable metadata (`AuditEventRow`), plus the access-log export
 * (EV-08) filterable by subject principal.
 *
 * READ-ONLY end to end: `GET /api/audit-events` backs a `findMany`, never
 * a write (`audit-read.service.ts`'s own docstring), the `AuditEvent`
 * table is append-only in the database behind a trigger, and this page
 * renders no edit or delete control anywhere -- not even a disabled one.
 */
export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [accessLogPrincipalId, setAccessLogPrincipalId] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [chainResult, setChainResult] = useState<ChainVerificationResult | null>(null);

  const queryString = useMemo(() => buildQueryString(filters, page), [filters, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-events", queryString],
    queryFn: () => employeeApiClient.get<AuditEventListResult>(`/audit-events?${queryString}`),
  });

  function updateFilter<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function clearFilters() {
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  async function exportAccessLog() {
    setIsExporting(true);
    try {
      const query = accessLogPrincipalId
        ? `?subjectPrincipalId=${encodeURIComponent(accessLogPrincipalId)}`
        : "";
      const blob = await employeeApiClient.getBlob(`/audit-events/access-log.csv${query}`);
      saveBlob(blob, "access-log.csv");
      toast.success("Access log exported.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to export evidence.");
      } else {
        toast.error("Could not export the access log. Please try again.");
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function exportAudit() {
    setIsExporting(true);
    try {
      const blob = await employeeApiClient.getBlob("/audit-events/export.csv");
      saveBlob(blob, "audit-events-export.csv");
      toast.success("Audit log exported.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to export evidence.");
      } else {
        toast.error("Could not export the audit log. Please try again.");
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function downloadEvidencePack() {
    setIsExporting(true);
    try {
      const blob = await employeeApiClient.getBlob("/evidence/pack.zip");
      saveBlob(blob, "evidence-pack.zip");
      toast.success("Evidence pack downloaded.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to export evidence.");
      } else {
        toast.error("Could not download the evidence pack. Please try again.");
      }
    } finally {
      setIsExporting(false);
    }
  }

  async function verifyChain() {
    setIsVerifying(true);
    try {
      const result = await employeeApiClient.get<ChainVerificationResult>(
        "/audit-events/verify-chain",
      );
      setChainResult(result);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to verify the audit chain.");
      } else {
        toast.error("Could not verify the audit chain. Please try again.");
      }
    } finally {
      setIsVerifying(false);
    }
  }

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageSize = data?.pageSize ?? 25;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasFilters = Object.values(filters).some((value) => value !== "");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <History className="h-5 w-5" aria-hidden="true" />
          Audit log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every recorded action in this organization. This log is read-only: there is no edit or
          delete action anywhere on this page, and the underlying table is append-only.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-action">Action</Label>
              <SelectControl
                id="audit-filter-action"
                value={filters.action}
                onChange={(event) => updateFilter("action", event.target.value)}
              >
                <option value="">All actions</option>
                {AUDIT_ACTION_VALUES.map((action) => (
                  <option key={action} value={action}>
                    {humanizeEnum(action)}
                  </option>
                ))}
              </SelectControl>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-actor">Actor ID</Label>
              <Input
                id="audit-filter-actor"
                value={filters.actorId}
                onChange={(event) => updateFilter("actorId", event.target.value)}
                placeholder="Employee or principal ID"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-resource-type">Resource type</Label>
              <Input
                id="audit-filter-resource-type"
                value={filters.resourceType}
                onChange={(event) => updateFilter("resourceType", event.target.value)}
                placeholder="e.g. Employee"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-resource-id">Resource ID</Label>
              <Input
                id="audit-filter-resource-id"
                value={filters.resourceId}
                onChange={(event) => updateFilter("resourceId", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-subject">Subject principal ID</Label>
              <Input
                id="audit-filter-subject"
                value={filters.subjectPrincipalId}
                onChange={(event) => updateFilter("subjectPrincipalId", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-from">From</Label>
              <Input
                id="audit-filter-from"
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter("from", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="audit-filter-to">To</Label>
              <Input
                id="audit-filter-to"
                type="date"
                value={filters.to}
                onChange={(event) => updateFilter("to", event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
                Clear filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PermissionGate permission="CAN_EXPORT_EVIDENCE">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access log export</CardTitle>
            <CardDescription>
              Exports every recorded view of personal data (EV-08) as a CSV. Leave the principal ID
              blank to export the whole organization's access log, or filter it to one data
              principal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="access-log-subject">Subject principal ID (optional)</Label>
              <Input
                id="access-log-subject"
                value={accessLogPrincipalId}
                onChange={(event) => setAccessLogPrincipalId(event.target.value)}
                placeholder="Leave blank for the whole organization"
                className="w-72"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isExporting}
              onClick={() => {
                void exportAccessLog();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? "Exporting..." : "Export CSV"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isExporting}
              onClick={() => {
                void exportAudit();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? "Exporting..." : "Download complete audit CSV"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isExporting}
              onClick={() => {
                void downloadEvidencePack();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? "Exporting..." : "Download evidence pack (ZIP)"}
            </Button>
          </CardContent>
        </Card>
      </PermissionGate>

      <PermissionGate permission="CAN_VIEW_AUDIT_LOG">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hash-chain verification</CardTitle>
            <CardDescription>
              Re-walks the append-only audit chain and reports the first broken sequence, if any.
              A clean result is evidence about the stored log only; it is not a compliance verdict.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isVerifying}
              onClick={() => {
                void verifyChain();
              }}
            >
              {chainResult?.valid ? (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              )}
              {isVerifying ? "Verifying..." : "Verify hash chain"}
            </Button>
            {chainResult ? (
              chainResult.valid ? (
                <p role="status" className="text-sm text-emerald-700">
                  Chain valid: {chainResult.checkedCount.toLocaleString("en-IN")} event(s) checked.
                </p>
              ) : (
                <p role="alert" className="text-sm text-destructive">
                  Chain broken at sequence {chainResult.firstBrokenSequence ?? "unknown"}. {chainResult.reason ?? "The stored links do not verify."}
                </p>
              )
            ) : null}
          </CardContent>
        </Card>
      </PermissionGate>

      {isLoading ? (
        <div className="space-y-2" data-testid="audit-skeleton">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          description={
            hasFilters
              ? "No audit events match these filters."
              : "No audit events have been recorded for this organization yet."
          }
          action={
            hasFilters
              ? { label: "Clear filters", onClick: clearFilters }
              : { label: "Go to dashboard", to: "/app" }
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Subject principal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((event) => (
                <AuditEventRow key={event.id} event={event} />
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {data?.page ?? page} of {totalPages} ({totalCount} events)
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
