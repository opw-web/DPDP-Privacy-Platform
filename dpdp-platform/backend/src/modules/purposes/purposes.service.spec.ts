import { BadRequestException } from "@nestjs/common";
import { PurposesService } from "./purposes.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { AuditService } from "../../common/audit/audit.service";
import type { CreatePurposeDto } from "./dto/create-purpose.dto";

/**
 * Fix round 1, Important 2. The e2e "missing lawfulBasis" test in
 * purposes.e2e-spec.ts goes through the full HTTP stack, so it is
 * satisfied by `CreatePurposeDto.lawfulBasis`'s `@IsEnum` decorator alone
 * -- `PurposesService`'s own `validateBasis()` first branch could be
 * deleted and that e2e test would still be green (the reviewer's own
 * "delete the rule, does the test go red?" check, applied to rule 1
 * rather than rule 2/3).
 *
 * This test calls `PurposesService.create()` directly with a DTO-shaped
 * object that never passed through Nest's `ValidationPipe` at all --
 * there is no HTTP layer here, no `@IsEnum` decorator runs, nothing
 * upstream has looked at `lawfulBasis`. It proves the service's own
 * check is what rejects the call, independent of the DTO layer, which is
 * exactly the claim the task report made ("the DTO is not authoritative")
 * and exactly what an e2e test cannot isolate.
 *
 * `prisma.scoped.processingPurpose.findFirst` is asserted NOT called:
 * `create()` calls `validateBasis()` before it ever queries the
 * database, so a correct implementation never touches Prisma when this
 * check fails. If `validateBasis()`'s first branch were removed, this
 * test would fail on the `rejects.toThrow` assertion (the call would
 * instead reach the mocked `findFirst`/`$transaction` and resolve).
 */
describe("PurposesService.create() - lawfulBasis enforcement independent of the DTO layer", () => {
  function buildService() {
    const findFirst = jest.fn();
    const transaction = jest.fn();
    const record = jest.fn();

    const prisma = {
      scoped: {
        processingPurpose: { findFirst },
        $transaction: transaction,
      },
    } as unknown as PrismaService;

    const auditService = { record } as unknown as AuditService;

    return {
      service: new PurposesService(prisma, auditService),
      findFirst,
      transaction,
    };
  }

  it("rejects an undefined lawfulBasis before ever touching Prisma, with no ValidationPipe involved", async () => {
    const { service, findFirst, transaction } = buildService();

    // Deliberately bypasses TypeScript's own field requirement too --
    // this is exactly the shape a non-HTTP caller (a future internal
    // job, a script, a differently-wired controller) could hand the
    // service if the DTO's `@IsEnum` were the only thing enforcing this.
    const dto = {
      code: "TEST_PURPOSE",
      name: "Test Purpose",
      description: "A purpose used only to exercise validateBasis().",
      lawfulBasis: undefined,
      basisJustification: "A human wrote this justification.",
    } as unknown as CreatePurposeDto;

    await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    await expect(service.create(dto)).rejects.toThrow(/lawfulBasis/);

    expect(findFirst).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
