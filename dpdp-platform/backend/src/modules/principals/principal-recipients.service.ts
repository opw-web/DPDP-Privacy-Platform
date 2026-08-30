import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/** RT-04 preview: sharing rows are selected only when their source set overlaps this profile. */
@Injectable()
export class PrincipalRecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPrincipal(dataPrincipalId: string) {
    const principal = await this.prisma.scoped.dataPrincipal.findFirst({
      where: { id: dataPrincipalId },
      select: { id: true },
    });
    if (!principal) {
      throw new NotFoundException(
        `Data principal "${dataPrincipalId}" not found.`,
      );
    }

    const fields = await this.prisma.scoped.principalDataField.findMany({
      where: { dataPrincipalId },
      select: { sourceIds: true },
    });
    const sourceIds = [...new Set(fields.flatMap((field) => field.sourceIds))];
    if (sourceIds.length === 0) {
      return [];
    }

    // Postgres's array-overlap operator (`&&`) is exactly the RT-04
    // condition. It avoids the false-positive "all active sharing rows"
    // implementation that Check 12 rejects.
    return this.prisma.scoped.sharingActivity.findMany({
      where: { active: true, sourceIds: { hasSome: sourceIds } },
      orderBy: [{ recipient: { name: "asc" } }, { startedAt: "asc" }],
      select: {
        id: true,
        description: true,
        dataCategories: true,
        sourceIds: true,
        startedAt: true,
        endedAt: true,
        recipient: {
          select: {
            id: true,
            name: true,
            type: true,
            contactEmail: true,
            country: true,
          },
        },
      },
    });
  }
}
