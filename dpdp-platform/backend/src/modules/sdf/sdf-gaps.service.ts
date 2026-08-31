import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ComplianceService, addByDeadlineUnit } from "../compliance/compliance.service";
import { SDF_CYCLE_APPLIES_TO } from "./sdf-assessment.service";

export interface LocalisationRequiredTransferGap {
  id: string;
  recipientId: string;
  destinationCountry: string;
  purposeDescription: string;
}

export interface UnreviewedAlgorithmGap {
  id: string;
  name: string;
  lastReviewedAt: Date | null;
}

export interface SdfGaps {
  localisationRequiredTransfers: LocalisationRequiredTransferGap[];
  unreviewedAlgorithms: UnreviewedAlgorithmGap[];
  dpoNotIndiaBased: boolean;
}

/**
 * `GET /api/sdf/gaps` (SD-06, SD-05, SD-01). The platform FLAGS these
 * three things; per spec §4.11 ("The platform flags; it cannot block. A
 * cross-border transfer happens in someone else's system") this service
 * has no write path and never rejects or prevents anything -- it only
 * surfaces state that already exists elsewhere for a human to act on.
 */
@Injectable()
export class SdfGapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly complianceService: ComplianceService,
  ) {}

  async getGaps(): Promise<SdfGaps> {
    const now = new Date();

    const [org, transfers, algorithms, cycleRule] = await Promise.all([
      this.prisma.scoped.organization.findFirstOrThrow({
        select: { isSignificantDataFiduciary: true, dpoIsIndiaBased: true },
      }),
      this.prisma.scoped.crossBorderTransfer.findMany({
        where: { localisationRequired: true },
        select: {
          id: true,
          recipientId: true,
          destinationCountry: true,
          purposeDescription: true,
        },
      }),
      this.prisma.scoped.algorithmRegisterEntry.findMany({
        select: { id: true, name: true, lastReviewedAt: true },
      }),
      this.complianceService.resolveRule(SDF_CYCLE_APPLIES_TO, now),
    ]);

    // An algorithm entry is a gap if it has never been reviewed, or its
    // last review predates a full cycle ago. Without a resolvable cycle
    // rule there is no cycle length to measure against, so (same
    // discipline as ComplianceService.resolveRule's null contract) this
    // never falls back to a hard-coded window -- it simply reports no
    // unreviewed-for-a-cycle gaps until a rule is configured.
    const unreviewedAlgorithms: UnreviewedAlgorithmGap[] = [];
    if (cycleRule) {
      const cutoff = addByDeadlineUnit(now, -cycleRule.deadlineValue, cycleRule.deadlineUnit);
      for (const entry of algorithms) {
        if (!entry.lastReviewedAt || entry.lastReviewedAt < cutoff) {
          unreviewedAlgorithms.push(entry);
        }
      }
    }

    return {
      localisationRequiredTransfers: transfers,
      unreviewedAlgorithms,
      dpoNotIndiaBased: org.isSignificantDataFiduciary && !org.dpoIsIndiaBased,
    };
  }
}
