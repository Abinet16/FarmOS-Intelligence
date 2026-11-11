import { SEVERITIES } from '@farmos/shared-types';
import { z } from 'zod';
import { pageQuery } from '../../common/query/pagination.js';
import { booleanParam } from '../../common/query/query-params.js';

export const listNotificationsSchema = pageQuery.extend({
  unread: booleanParam.optional(),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>;

export const notificationPreferencesSchema = z.strictObject({
  emailAlertsMinSeverity: z.enum(SEVERITIES).nullable(),
  emailReports: z.boolean(),
});
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;
