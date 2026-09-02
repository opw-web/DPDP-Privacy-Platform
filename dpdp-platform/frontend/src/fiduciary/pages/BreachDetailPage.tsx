import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../lib/api-client";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { BreachObligationCard, type Obligation } from "../components/breaches/BreachObligationCard";

interface Breach {
  id: string;
  reference: string;
  title: string;
  becameAwareAt: string;
  boardExtensionRequestedAt: string | null;
  boardExtensionGrantedUntil: string | null;
  boardExtensionReference: string | null;
  obligations: Obligation[];
}

export function originalBoardDetailDueAt(obligations: Obligation[]): string | null {
  return obligations.find((o) => o.code === "BOARD_DETAIL")?.dueAt ?? null;
}

/**
 * `POST /breaches/:id/extension` requires `requestedAt` (`ExtensionDto`) --
 * omitting it is what made every submission 400 silently (defect 4). Built
 * as a pure function so the contract is testable without mounting the page.
 */
export function buildExtensionPayload(
  requestedAt: string,
  grantedUntil: string,
  reference: string,
): { requestedAt: string; grantedUntil: string; reference: string } {
  return {
    requestedAt: new Date(requestedAt).toISOString(),
    grantedUntil: new Date(grantedUntil).toISOString(),
    reference,
  };
}

/** `saveBlob` -- same throwaway-object-URL idiom as `ExportButtons`/`AccessReportPanel`, duplicated locally per this codebase's convention rather than sharing a component across tasks. */
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

function extensionErrorMessage(error: unknown): string {
  return error instanceof ApiError && error.message ? error.message : "Could not record the extension.";
}

export function BreachDetailPage() {
  const { breachId } = useParams();
  const q = useQuery({
    queryKey: ["breach", breachId],
    queryFn: () => employeeApiClient.get<Breach>(`/breaches/${breachId}`),
    enabled: Boolean(breachId),
  });
  const [requestedAt, setRequestedAt] = useState("");
  const [until, setUntil] = useState("");
  const [reference, setReference] = useState("");
  const ext = useMutation({
    mutationFn: () =>
      employeeApiClient.post(
        `/breaches/${breachId}/extension`,
        buildExtensionPayload(requestedAt, until, reference),
      ),
    onSuccess: () => {
      toast.success("Extension recorded. Only the detailed-report clock moved.");
      void q.refetch();
    },
    onError: (error) => toast.error(extensionErrorMessage(error)),
  });

  const [downloadingReport, setDownloadingReport] = useState<"initial" | "detailed" | null>(null);

  async function downloadBoardReport(kind: "initial" | "detailed") {
    setDownloadingReport(kind);
    try {
      const path = kind === "initial" ? "board-initial.pdf" : "board-detailed.pdf";
      const blob = await employeeApiClient.getBlob(`/breaches/${breachId}/${path}`);
      saveBlob(blob, `${q.data?.reference ?? breachId}-${path}`);
      toast.success(
        kind === "initial" ? "Board initial intimation downloaded." : "Board detailed report downloaded.",
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to download this report.");
      } else {
        toast.error(
          error instanceof ApiError && error.message
            ? error.message
            : "Could not download the report. Please try again.",
        );
      }
    } finally {
      setDownloadingReport(null);
    }
  }

  if (!q.data) return <p>Loading breach…</p>;
  const b = q.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{b.title}</h1>
        <p className="text-sm text-muted-foreground">
          {b.reference} · awareness clock started {new Date(b.becameAwareAt).toLocaleString()}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Obligations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {b.obligations.map((o) => (
            <BreachObligationCard key={o.id} breachId={b.id} obligation={o} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Board reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The platform generates these for you to submit to the Board. It does not file anything
            itself.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={downloadingReport !== null}
              onClick={() => void downloadBoardReport("initial")}
            >
              {downloadingReport === "initial" ? "Downloading…" : "Download initial intimation (PDF)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={downloadingReport !== null}
              onClick={() => void downloadBoardReport("detailed")}
            >
              {downloadingReport === "detailed"
                ? "Downloading…"
                : "Download detailed report (PDF)"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The detailed report includes the delivery report for the intimations sent to affected data
            principals.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Board detailed-report extension</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">Only the detailed-report clock moves. The original date remains preserved and visible.</p>
          {b.boardExtensionGrantedUntil ? (
            <p className="text-sm">
              Original date: <s>{new Date(originalBoardDetailDueAt(b.obligations) ?? "").toLocaleString()}</s>
              <br />
              Extended until {new Date(b.boardExtensionGrantedUntil).toLocaleString()} · reference{" "}
              {b.boardExtensionReference}
            </p>
          ) : (
            <>
              <label className="space-y-1 text-sm">
                Extension requested at
                <input
                  aria-label="Extension requested at"
                  type="datetime-local"
                  className="flex h-9 w-full rounded border px-3"
                  value={requestedAt}
                  onChange={(e) => setRequestedAt(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                Extension date
                <input
                  aria-label="Extension date"
                  type="datetime-local"
                  className="flex h-9 w-full rounded border px-3"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                Extension reference
                <input
                  aria-label="Extension reference"
                  className="flex h-9 w-full rounded border px-3"
                  placeholder="Board reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <Button disabled={!requestedAt || !until || !reference || ext.isPending} onClick={() => ext.mutate()}>
                {ext.isPending ? "Recording…" : "Record extension"}
              </Button>
              {ext.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {extensionErrorMessage(ext.error)}
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
