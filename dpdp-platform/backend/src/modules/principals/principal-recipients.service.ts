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
    // implementation that Check 12 rejects. Recipient is deliberately NOT a
    // nested select: Prisma's tenant extension cannot scope nested relation
    // reads, so a corrupt cross-tenant recipientId must be filtered through a
    // separate scoped DataRecipient query before it can leave this service.
    const activities = await this.prisma.scoped.sharingActivity.findMany({
      where: { active: true, sourceIds: { hasSome: sourceIds } },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        recipientId: true,
        description: true,
        dataCategories: true,
        sourceIds: true,
        startedAt: true,
        endedAt: true,
      },
    });
    if (activities.length === 0) {
      return [];
    }
    const recipients = await this.prisma.scoped.dataRecipient.findMany({
      where: { id: { in: activities.map((activity) => activity.recipientId) } },
      select: {
        id: true,
        name: true,
        type: true,
        contactEmail: true,
        country: true,
      },
    });
    const recipientById = new Map(
      recipients.map((recipient) => [recipient.id, recipient]),
    );
    return activities
      .flatMap((activity) => {
        const recipient = recipientById.get(activity.recipientId);
        return recipient ? [{ ...activity, recipient }] : [];
      })
      .sort(
        (left, right) =>
          left.recipient.name.localeCompare(right.recipient.name) ||
          left.startedAt.getTime() - right.startedAt.getTime() ||
          left.id.localeCompare(right.id),
      );
  }
}
