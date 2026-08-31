import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { PermissionGate } from "../../components/shared/PermissionGate";
import { ApiError, employeeApiClient } from "../../lib/api-client";

interface ExportDefinition {
  key: string;
  label: string;
  /** `/api`-relative path -- always fetched through `employeeApiClient`, never a raw anchor href (task brief: an anchor drops the Authorization header). */
  path: string;
  /** Must match the `Content-Disposition` filename the backend sets, so the saved file matches what the export actually is. */
  filename: string;
}

const EXPORTS: readonly ExportDefinition[] = [
  {
    key: "ropa",
    label: "Export RoPA (CSV)",
    path: "/inventory/ropa.csv",
    filename: "ropa.csv",
  },
  {
    key: "access-log",
    label: "Export access log (CSV)",
    path: "/audit-events/access-log.csv",
    filename: "access-log.csv",
  },
];

/**
 * Turns an already-fetched, already-authenticated `Blob` into a save-file
 * dialog via a throwaway object URL and a synthetic click -- the anchor's
 * `href` is a local `blob:` URL created after the authenticated fetch
 * resolved, never the API path itself, so it carries no bearer token to
 * drop and grants no unauthenticated access to anyone who might see it.
 */
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
 * The dashboard's two evidence exports (spec lines 833-835, EV-02 /
 * EV-08): the RoPA CSV and the access-log CSV. Both are
 * `CAN_EXPORT_EVIDENCE`-gated server side, so both buttons are wrapped in
 * `<PermissionGate>` -- but that gate is cosmetic only (see
 * `PermissionGate`'s own docstring), so a 403 from the server is still
 * handled here, not assumed away.
 */
export function ExportButtons() {
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  async function handleExport(definition: ExportDefinition) {
    setPendingKey(definition.key);
    try {
      const blob = await employeeApiClient.getBlob(definition.path);
      saveBlob(blob, definition.filename);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to export evidence.");
      } else {
        toast.error(`Could not export ${definition.filename}. Please try again.`);
      }
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <PermissionGate permission="CAN_EXPORT_EVIDENCE">
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map((definition) => (
          <Button
            key={definition.key}
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={pendingKey !== null}
            onClick={() => {
              void handleExport(definition);
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {pendingKey === definition.key ? "Exporting..." : definition.label}
          </Button>
        ))}
      </div>
    </PermissionGate>
  );
}
