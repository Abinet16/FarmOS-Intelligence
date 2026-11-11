import { Logger } from '@nestjs/common';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Sends email. Implementations throw on failure so the job is retried. */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/**
 * Development transport: writes each message to the log instead of sending
 * it. A provider (SES, Postmark) implements the same interface in production.
 */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  constructor(private readonly from: string) {}

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `From: ${this.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
    return Promise.resolve();
  }
}
