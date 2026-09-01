import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { ApiError, employeeApiClient } from "../../../lib/api-client";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

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

/** Generates the s.11 report from the current registers and downloads the authenticated PDF. */
export function AccessReportPanel({ reference }: { reference: string }) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function generateAndDownload(): Promise<void> {
    setIsGenerating(true);
    try {
      const blob = await employeeApiClient.getBlob(
        `/requests/${encodeURIComponent(reference)}/access-report.pdf`,
      );
      saveBlob(blob, `${reference}-access-report.pdf`);
      toast.success("Access report generated and downloaded.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        toast.error("You do not have permission to generate this access report.");
      } else {
        toast.error("Could not generate the access report. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Section 11 access report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Generate the current report of personal data and lineage, processing purposes and lawful
          bases, named recipients and what was shared, consent history, and retention position.
        </p>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={isGenerating}
          onClick={() => {
            void generateAndDownload();
          }}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          {isGenerating ? "Generating report…" : "Generate and download access report (PDF)"}
        </Button>
      </CardContent>
    </Card>
  );
}
