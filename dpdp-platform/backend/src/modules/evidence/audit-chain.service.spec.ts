import { createHash } from "crypto";
import { canonicalJson } from "../../common/audit/canonical-json";
import { AuditChainService } from "./audit-chain.service";

type Event = {
  sequence: bigint;
  action: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  previousHash: string | null;
  hash: string;
};

function event(
  sequence: bigint,
  previousHash: string | null,
  createdAt = new Date("2026-01-01T00:00:00.000Z"),
): Event {
  const action = "REQUEST_CREATED";
  const resourceId = `request-${sequence.toString()}`;
  const metadata = { sequence: sequence.toString() };
  const hashInput =
    (previousHash ?? "") +
    sequence.toString() +
    action +
    resourceId +
    canonicalJson(metadata) +
    createdAt.toISOString();
  const hash = createHash("sha256").update(hashInput).digest("hex");
  return {
    sequence,
    action,
    resourceId,
    metadata,
    createdAt,
    previousHash,
    hash,
  };
}

function serviceWith(events: Event[]): AuditChainService {
  return new AuditChainService({
    scoped: {
      auditEvent: { findMany: jest.fn().mockResolvedValue(events) },
    },
  } as never);
}

describe("AuditChainService sequence continuity", () => {
  it("rejects a valid-looking chain whose first row starts after sequence 1", async () => {
    const first = event(BigInt(2), null);
    const result = await serviceWith([first]).verifyChain();

    expect(result).toMatchObject({
      valid: false,
      checkedCount: 1,
      firstBrokenSequence: "2",
    });
    expect(result.reason).toContain("sequence 1");
  });

  it("rejects a valid-looking chain with a missing middle sequence", async () => {
    const first = event(BigInt(1), null);
    const third = event(BigInt(3), first.hash);
    const result = await serviceWith([first, third]).verifyChain();

    expect(result).toMatchObject({
      valid: false,
      checkedCount: 2,
      firstBrokenSequence: "3",
    });
    expect(result.reason).toContain("contiguous");
  });
});
