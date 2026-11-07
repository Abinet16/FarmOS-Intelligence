import { todayIn } from '../common/dates.js';
import type { Tx } from './prisma.service.js';

/** Today's calendar date in the organization's own time zone. */
export async function organizationToday(tx: Tx, organizationId: string): Promise<Date> {
  const { timezone } = await tx.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { timezone: true },
  });
  return todayIn(timezone);
}
