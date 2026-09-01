import { Badge } from "../../../components/ui/badge";
import { NotReviewedChip } from "../NotReviewedChip";
import { humanizeEnum } from "../../lib/enum-options";
import type { RequestRecord } from "./types";

/** Shows the snapshot that produced this request deadline, never a live rule. */
export function RequestRulePanel({ request, isReviewed = false }: { request: RequestRecord; isReviewed?: boolean }) {
  if (!request.ruleCodeSnapshot) return <section className="rounded-md border p-4" aria-label="Deadline rule"><h2 className="font-semibold">Deadline rule</h2><p className="mt-1 text-sm text-muted-foreground">No deadline rule configured. Configure one in Compliance Rules.</p></section>;
  return <section className="rounded-md border p-4" aria-label="Deadline rule"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Deadline rule</h2><div className="flex gap-2">{request.ruleBasisSnapshot ? <Badge variant={request.ruleBasisSnapshot === "STATUTORY" ? "default" : "secondary"}>{humanizeEnum(request.ruleBasisSnapshot)}</Badge> : null}<NotReviewedChip isReviewed={isReviewed} /></div></div><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-muted-foreground">Rule</dt><dd>{request.ruleCodeSnapshot} · version {request.ruleVersionSnapshot ?? "—"}</dd></div><div><dt className="text-muted-foreground">Citation</dt><dd>{request.legalSourceSnapshot ?? "No citation captured"}</dd></div><div><dt className="text-muted-foreground">Review state</dt><dd>{isReviewed ? "Reviewed by DPO" : "Not yet reviewed by your DPO"}</dd></div></dl></section>;
}
