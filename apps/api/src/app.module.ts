import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { AuthGuard } from './common/guards/auth.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CorrectionsModule } from './modules/corrections/corrections.module.js';
import { FarmsModule } from './modules/farms/farms.module.js';
import { FeedTypesModule } from './modules/feed-types/feed-types.module.js';
import { FlockBatchesModule } from './modules/flock-batches/flock-batches.module.js';
import { FlockHealthModule } from './modules/flock-health/flock-health.module.js';
import { FlockRecordsModule } from './modules/flock-records/flock-records.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { HousesModule } from './modules/houses/houses.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    AuditModule,
    HealthModule,
    UsersModule,
    OrganizationsModule,
    MembershipsModule,
    FarmsModule,
    HousesModule,
    FlockBatchesModule,
    FeedTypesModule,
    FlockRecordsModule,
    CorrectionsModule,
    FlockHealthModule,
    InventoryModule,
  ],
  providers: [
    // Global guards run in registration order: authenticate, then resolve tenant.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
