import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { LogMailer, MAILER } from './mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ENV],
      // MAIL_TRANSPORT only allows "log" until a provider is chosen (week 10).
      useFactory: (env: Env) => new LogMailer(env.MAIL_FROM),
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
