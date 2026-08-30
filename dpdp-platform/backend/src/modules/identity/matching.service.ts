import { Injectable } from "@nestjs/common";
import type {
  IdentifierType,
  MatchConfidence,
  NormalizedRecord,
} from "@prisma/client";
import type { ScopedTransactionClient } from "../../common/prisma/scoped-transaction-client";
import type { NormalizationMapping } from "../normalization/normalization.service";
import { customerIdSignal } from "./match-rules/customer-id";
import { emailSignal } from "./match-rules/email";
import { phoneSignal } from "./match-rules/phone";
import {
  supportingScore,
  supportingSignals,
  type SupportingSignal,
} from "./match-rules/supporting-signal";

export type MatchRule = "CUSTOMER_ID" | "EMAIL" | "PHONE";

export interface MatchSignal {
  rule: MatchRule;
  identifierType: IdentifierType;
  value: string;
  confidence: "EXACT" | "HIGH";
  /** Rule order is also the deterministic EXACT-confidence tie breaker. */
  order: 1 | 2 | 3;
}

interface ResolvedSignal extends MatchSignal {
  dataPrincipalId: string;
  principalReference: string;
}

export interface RaisedCandidate {
  dataPrincipalId: string;
  confidence: Exclude<MatchConfidence, "UNMATCHED">;
  score: number;
  evidence: Record<string, unknown>;
}

export interface LinkMatchResult {
  kind: "LINK";
  dataPrincipalId: string;
  confidence: "EXACT" | "HIGH";
  matchedOn: Record<string, unknown>;
  candidates: RaisedCandidate[];
}

export interface CandidateMatchResult extends RaisedCandidate {
  kind: "CANDIDATE";
  confidence: "POSSIBLE";
  candidates?: RaisedCandidate[];
}

export interface NewMatchResult {
  kind: "NEW";
}

export type MatchResult =
  LinkMatchResult | CandidateMatchResult | NewMatchResult;

export type MatchableNormalizedRecord = Pick<
  NormalizedRecord,
  | "id"
  | "customerId"
  | "emailNormalized"
  | "phoneNormalized"
  | "nameKey"
  | "postalCode"
  | "dateOfBirth"
>;

const CONFIDENCE_RANK: Record<"EXACT" | "HIGH", number> = {
  EXACT: 2,
  HIGH: 1,
};

function conflictCandidateScore(confidence: "EXACT" | "HIGH"): number {
  return confidence === "EXACT" ? 0.8 : 0.7;
}

function compareSignals(left: ResolvedSignal, right: ResolvedSignal): number {
  return (
    CONFIDENCE_RANK[right.confidence] - CONFIDENCE_RANK[left.confidence] ||
    left.order - right.order ||
    left.dataPrincipalId.localeCompare(right.dataPrincipalId)
  );
}

function stableSignals(signals: readonly ResolvedSignal[]): ResolvedSignal[] {
  return [...signals].sort((left, right) => left.order - right.order);
}

/**
 * Purely deterministic identity resolution. Rules 1-3 only use exact,
 * tenant-scoped PrincipalIdentifier lookups. Rule 4 deliberately uses the
 * minimum supporting signal required by the specification and can never link.
 *
 * Task 18 fix round 1 (Important 3): every read in this service now takes
 * the CALLER'S transaction client (`tx`) instead of opening its own reads
 * on `PrismaService.scoped`. Two independent reasons, not one:
 *
 *  1. Pool-exhaustion deadlock: the sync pipeline calls `match()` from
 *     inside an already-open `prisma.scoped.$transaction(...)` (so that
 *     `LinkingService.applyMatch`, called immediately after with the same
 *     `tx`, can write atomically with PERSIST/NORMALIZE). Prisma's
 *     default pool size is `2 * cpus + 1` -- 5 on a 2-vCPU container,
 *     exactly this pipeline's configured worker concurrency
 *     (`SYNC_WORKER_CONCURRENCY`). If `match()` opened a SECOND,
 *     independent connection (via `this.prisma.scoped`) while the first
 *     is held open by the surrounding transaction, five concurrent
 *     record-transactions each hold one pool connection while blocking to
 *     check out a second -- deadlock until `pool_timeout`, at which point
 *     every in-flight record fails and the rest of the app starves for
 *     connections too.
 *  2. Snapshot consistency: reading through the SAME `tx` that
 *     `applyMatch` writes through means the match decision and the write
 *     that acts on it see the same transaction snapshot -- a second,
 *     independent line of defence (on top of the sync-lock fix for
 *     Critical 1) against two concurrent runs on one data source each
 *     deciding "no principal exists yet" from a stale read and creating
 *     two `DataPrincipal` rows for the same person.
 *
 * `MatchingService` therefore has no constructor dependencies at all --
 * it never opens its own connection or reads outside a caller-supplied
 * `tx`.
 */
@Injectable()
export class MatchingService {
  private async resolveSignal(
    tx: ScopedTransactionClient,
    signal: MatchSignal,
  ): Promise<ResolvedSignal | null> {
    const identifier = await tx.principalIdentifier.findFirst({
      where: { type: signal.identifierType, value: signal.value },
      select: { dataPrincipalId: true },
    });
    if (!identifier) {
      return null;
    }

    // Avoid a nested relation read: the tenant extension's contract makes
    // nested reads unscoped. The second scoped lookup also fails closed if a
    // legacy/bad foreign key ever points outside the current organization.
    const principal = await tx.dataPrincipal.findFirst({
      where: { id: identifier.dataPrincipalId },
      select: { id: true, reference: true },
    });
    if (!principal) {
      return null;
    }
    return {
      ...signal,
      dataPrincipalId: principal.id,
      principalReference: principal.reference,
    };
  }

  private async supportingCandidates(
    tx: ScopedTransactionClient,
    record: MatchableNormalizedRecord,
  ): Promise<RaisedCandidate[]> {
    if (!record.nameKey) {
      return [];
    }

    const sameNameRecords = await tx.normalizedRecord.findMany({
      where: { nameKey: record.nameKey, id: { not: record.id } },
      select: {
        id: true,
        nameKey: true,
        postalCode: true,
        dateOfBirth: true,
        phoneNormalized: true,
      },
    });
    if (sameNameRecords.length === 0) {
      return [];
    }

    const activeLinks = await tx.identityLink.findMany({
      where: {
        normalizedRecordId: {
          in: sameNameRecords.map((candidate) => candidate.id),
        },
        status: "ACTIVE",
      },
      select: { normalizedRecordId: true, dataPrincipalId: true },
    });
    const principalByRecord = new Map(
      activeLinks.map((link) => [
        link.normalizedRecordId,
        link.dataPrincipalId,
      ]),
    );
    const signalsByPrincipal = new Map<string, Set<SupportingSignal>>();
    for (const existing of sameNameRecords) {
      const principalId = principalByRecord.get(existing.id);
      if (!principalId) {
        continue;
      }
      const signals = supportingSignals(record, existing);
      if (signals.length === 0) {
        continue;
      }
      const previous =
        signalsByPrincipal.get(principalId) ?? new Set<SupportingSignal>();
      signals.forEach((signal) => previous.add(signal));
      signalsByPrincipal.set(principalId, previous);
    }

    return [...signalsByPrincipal.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dataPrincipalId, signalSet]) => {
        const signals = [...signalSet].sort();
        return {
          dataPrincipalId,
          confidence: "POSSIBLE" as const,
          score: supportingScore(signals),
          evidence: {
            rule: "SUPPORTING_SIGNAL",
            nameKey: record.nameKey,
            signals,
          },
        };
      });
  }

  async match(
    tx: ScopedTransactionClient,
    record: MatchableNormalizedRecord,
    mappings: readonly NormalizationMapping[],
  ): Promise<MatchResult> {
    const candidateSignals = [
      customerIdSignal(record.customerId, mappings),
      emailSignal(record.emailNormalized),
      phoneSignal(record.phoneNormalized),
    ].filter((signal): signal is MatchSignal => signal !== null);
    const resolved = (
      await Promise.all(
        candidateSignals.map((signal) => this.resolveSignal(tx, signal)),
      )
    ).filter((signal): signal is ResolvedSignal => signal !== null);

    if (resolved.length === 0) {
      const candidates = await this.supportingCandidates(tx, record);
      const primary = candidates[0];
      return primary
        ? {
            kind: "CANDIDATE",
            dataPrincipalId: primary.dataPrincipalId,
            confidence: "POSSIBLE",
            score: primary.score,
            evidence: primary.evidence,
            candidates: candidates.slice(1),
          }
        : { kind: "NEW" };
    }

    const winning = [...resolved].sort(compareSignals)[0];
    if (!winning) {
      throw new Error("Resolved identity signals unexpectedly had no winner.");
    }
    const seenLosingPrincipalIds = new Set<string>();
    const distinctLosers: ResolvedSignal[] = [];
    for (const signal of [...resolved].sort(compareSignals)) {
      if (
        signal.dataPrincipalId !== winning.dataPrincipalId &&
        !seenLosingPrincipalIds.has(signal.dataPrincipalId)
      ) {
        seenLosingPrincipalIds.add(signal.dataPrincipalId);
        distinctLosers.push(signal);
      }
    }
    const conflict = stableSignals(resolved)
      .map((signal) => `${signal.rule}→${signal.principalReference}`)
      .join(", ");
    const candidates = distinctLosers.map((loser) => ({
      dataPrincipalId: loser.dataPrincipalId,
      confidence: loser.confidence,
      score: conflictCandidateScore(loser.confidence),
      evidence: {
        conflict,
        signals: stableSignals(resolved).map((signal) => ({
          rule: signal.rule,
          identifierType: signal.identifierType,
          value: signal.value,
          confidence: signal.confidence,
          dataPrincipalId: signal.dataPrincipalId,
          principalReference: signal.principalReference,
        })),
      },
    }));

    return {
      kind: "LINK",
      dataPrincipalId: winning.dataPrincipalId,
      confidence: winning.confidence,
      matchedOn: {
        rules: stableSignals(
          resolved.filter(
            (signal) => signal.dataPrincipalId === winning.dataPrincipalId,
          ),
        ).map((signal) => signal.rule),
        identifiers: stableSignals(
          resolved.filter(
            (signal) => signal.dataPrincipalId === winning.dataPrincipalId,
          ),
        ).map((signal) => ({
          type: signal.identifierType,
          value: signal.value,
        })),
      },
      candidates,
    };
  }
}
