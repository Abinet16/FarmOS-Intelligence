import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Tenant } from '../../common/decorators/context.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { TenantContext } from '../../common/request.js';
import {
  listNotificationsSchema,
  notificationPreferencesSchema,
  type ListNotificationsQuery,
  type NotificationPreferencesDto,
} from './notifications.schemas.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Every member has an inbox. Each route acts on the caller's own
 * notifications and preferences only, so no permission beyond membership.
 */
@Controller('organizations/:organizationId')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  list(
    @Tenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listNotificationsSchema)) query: ListNotificationsQuery,
  ) {
    return this.notifications.list(tenant, query);
  }

  @Get('notifications/unread-count')
  unreadCount(@Tenant() tenant: TenantContext) {
    return this.notifications.unreadCount(tenant);
  }

  @Post('notifications/read-all')
  @HttpCode(200)
  markAllRead(@Tenant() tenant: TenantContext) {
    return this.notifications.markAllRead(tenant);
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(200)
  markRead(
    @Tenant() tenant: TenantContext,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.notifications.markRead(tenant, notificationId);
  }

  @Get('notification-preferences')
  getPreferences(@Tenant() tenant: TenantContext) {
    return this.notifications.getPreferences(tenant);
  }

  @Put('notification-preferences')
  updatePreferences(
    @Tenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(notificationPreferencesSchema)) dto: NotificationPreferencesDto,
  ) {
    return this.notifications.updatePreferences(tenant, dto);
  }
}
