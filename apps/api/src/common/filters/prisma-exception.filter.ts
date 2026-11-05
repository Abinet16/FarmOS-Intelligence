import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Maps expected database errors to HTTP responses without leaking SQL details.
 * Anything unrecognised falls through to Nest's default 500 handling.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  override catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    switch (error.code) {
      case 'P2002':
        return super.catch(
          new ConflictException('A record with these values already exists'),
          host,
        );
      case 'P2025':
        return super.catch(new NotFoundException('Record not found'), host);
      default:
        return super.catch(error, host);
    }
  }
}
