import { Check, X } from "lucide-react";
import { Badge, type BadgeProps } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { DateTime } from "../../components/shared/DateTime";

/** Mirrors `CanonicalField` values `CandidatesService.SIGNAL_FIELDS` compares (`identity/candidates.service.ts`). */
export type SignalCanonicalField =
  | "FULL_NAME"
  | "EMAIL"
  | "PHONE"
  | "CUSTOMER_ID"
  | "POSTAL_CODE"
  | "DATE_OF_BIRTH";

/** Mirrors `SignalAgreement` (`identity/candidates.service.ts`). */
export type SignalAgreement = "AGREE" | "CONFLICT" | "INSUFFICIENT_DATA";

/** Mirrors `CandidateSignal` (`identity/candidates.service.ts`). */
export interface CandidateSignal {
  canonicalField: SignalCanonicalField;
  recordValue: string | null;
  principalValue: string | null;
  agreement: SignalAgreement;
}

/** Mirrors `MatchCandidateListItem` (`identity/candidates.service.ts`) -- the exact, unchanged shape `GET /api/match-candidates` returns. */
export interface MatchCandidateListItem {
  id: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  confidence: string;
  score: number;
  createdAt: string;
  record: {
    normalizedRecordId: string;
    sourceRecordId: string;
    dataSourceId: string;
    fullName: string | null;
    emailNormalized: string | null;
    phoneNormalized: string | null;
    customerId: string | null;
    postalCode: string | null;
    dateOfBirth: string | null;
  };
  principal: {
    dataPrincipalId: string;
    reference: string;
    displayName: string;
  };
  signals: CandidateSignal[];
}

const FIELD_LABELS: Record<SignalCanonicalField, string> = {
  FULL_NAME: "Full name",
  EMAIL: "Email",
  PHONE: "Phone",
  CUSTOMER_ID: "Customer ID",
  POSTAL_CODE: "Postal code",
  DATE_OF_BIRTH: "Date of birth",
};

/**
 * The ONE place a signal's agreement state becomes a colour. Every row in
 * this component calls this instead of choosing a variant inline, so
 * "agreeing signals render green, conflicting signals render red" (spec)
 * cannot drift into a per-row special case.
 */
export function signalBadgeVariant(agreement: SignalAgreement): BadgeProps["variant"] {
  switch (agreement) {
    case "AGREE":
      return "success";
    case "CONFLICT":
      return "destructive";
    case "INSUFFICIENT_DATA":
      return "secondary";
  }
}

const AGREEMENT_LABEL: Record<SignalAgreement, string> = {
  AGREE: "Agrees",
  CONFLICT: "Conflicts",
  INSUFFICIENT_DATA: "No data",
};

interface CandidateComparisonProps {
  candidate: MatchCandidateListItem;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  /** True while this specific candidate's confirm/reject mutation is in flight -- disables both actions so a reviewer cannot double-submit. */
  isDeciding?: boolean;
}

/**
 * One review-queue row: the raw record and the principal it was matched
 * against, side by side, with every comparable signal coloured by
 * `signalBadgeVariant`. Confirm links the record into the principal
 * (`MergeService.mergeRecordIntoPrincipal` via `CandidatesService.confirm`)
 * -- never a destructive action; Reject only flips this candidate's own
 * status and touches no topology.
 */
export function CandidateComparison({
  candidate,
  onConfirm,
  onReject,
  isDeciding = false,
}: CandidateComparisonProps) {
  return (
    <Card data-testid="candidate-comparison">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">
            {candidate.principal.displayName || candidate.principal.reference}
          </p>
          <p className="text-xs text-muted-foreground">
            Principal {candidate.principal.reference} &middot; raised{" "}
            <DateTime value={candidate.createdAt} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{candidate.confidence}</Badge>
          <Badge variant="secondary">score {candidate.score.toFixed(2)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-3">Signal</th>
                <th className="py-1 pr-3">Candidate record</th>
                <th className="py-1 pr-3">Existing principal</th>
                <th className="py-1">Agreement</th>
              </tr>
            </thead>
            <tbody>
              {candidate.signals.map((signal) => (
                <tr key={signal.canonicalField} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-medium">
                    {FIELD_LABELS[signal.canonicalField]}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {signal.recordValue ?? "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {signal.principalValue ?? "—"}
                  </td>
                  <td className="py-1.5">
                    <Badge variant={signalBadgeVariant(signal.agreement)}>
                      {AGREEMENT_LABEL[signal.agreement]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={isDeciding}
            onClick={() => onReject(candidate.id)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Reject
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={isDeciding}
            onClick={() => onConfirm(candidate.id)}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Confirm
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
