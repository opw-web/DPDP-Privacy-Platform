import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DateTime } from "../../components/shared/DateTime";
import { Badge } from "../../components/ui/badge";
import { TableCell, TableRow } from "../../components/ui/table";

/**
 * Mirrors `AuditEventListItem` (`audit-read.service.ts`) exactly.
 *
 * `sequence` is a per-organization `BigInt` column, serialized by the
 * backend's global `BigInt.prototype.toJSON` shim (`main.ts`) as a
 * decimal STRING -- a plain `number` would silently lose precision past
 * 2^53. It is therefore typed `string` here and treated as opaque: never
 * parsed with `Number()`, only ever displayed, or compared with
 * `BigInt()` if a future caller needs to sort by it.
 */
export interface AuditEventListItem {
  id: string;
  sequence: string;
  actorType: "EMPLOYEE" | "PRINCIPAL" | "SYSTEM";
  actorId: string | null;
  actorLabel: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  subjectPrincipalId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditEventRowProps {
  event: AuditEventListItem;
}

function hasVisibleMetadata(metadata: unknown): boolean {
  return (
    metadata !== null &&
    typeof metadata === "object" &&
    Object.keys(metadata as Record<string, unknown>).length > 0
  );
}

/**
 * One row of `/app/audit`'s table, plus its expandable metadata panel.
 *
 * READ-ONLY: this component renders no edit or delete affordance, not
 * even a disabled one -- the `AuditEvent` table is append-only in the
 * database (protected by a trigger), and no control here may imply
 * otherwise. Expanding a row only reveals more of what already happened;
 * it never offers to change it.
 */
export function AuditEventRow({ event }: AuditEventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = hasVisibleMetadata(event.metadata) || Boolean(event.ipAddress) || Boolean(event.userAgent);

  return (
    <>
      <TableRow>
        <TableCell className="w-8">
          <button
            type="button"
            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-30"
            onClick={() => setExpanded((current) => !current)}
            disabled={!expandable}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide details for ${event.action}` : `Show details for ${event.action}`}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </TableCell>
        <TableCell>
          <DateTime value={event.createdAt} className="text-sm" />
        </TableCell>
        <TableCell>
          <span className="font-mono text-xs">{event.action}</span>
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm">{event.actorLabel}</span>
            <Badge variant="outline" className="w-fit text-[10px] font-normal">
              {event.actorType}
            </Badge>
          </div>
        </TableCell>
        <TableCell>
          <span className="text-sm">
            {event.resourceType}
            {event.resourceId ? ` · ${event.resourceId}` : ""}
          </span>
        </TableCell>
        <TableCell>
          {event.subjectPrincipalId ? (
            <span className="font-mono text-xs">{event.subjectPrincipalId}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="bg-muted/30">
            <div className="space-y-3 py-1 text-xs">
              <div>
                <p className="font-medium text-foreground">Metadata</p>
                <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-border bg-background p-2 text-[11px]">
                  {JSON.stringify(event.metadata ?? {}, null, 2)}
                </pre>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Sequence</dt>
                  <dd className="font-mono">{event.sequence}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Event ID</dt>
                  <dd className="truncate font-mono" title={event.id}>
                    {event.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">IP address</dt>
                  <dd>{event.ipAddress ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">User agent</dt>
                  <dd className="truncate" title={event.userAgent ?? undefined}>
                    {event.userAgent ?? "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
