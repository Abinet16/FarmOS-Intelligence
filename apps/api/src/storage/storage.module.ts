import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { FILE_STORE, LocalFileStore } from './file-store.js';

@Global()
@Module({
  providers: [
    {
      provide: FILE_STORE,
      inject: [ENV],
      useFactory: (env: Env) => new LocalFileStore(env.REPORTS_DIR),
    },
  ],
  exports: [FILE_STORE],
})
export class StorageModule {}
