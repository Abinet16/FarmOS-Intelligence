import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import type { Env } from '../config/env.js';

const SEVERITY: LogLevel[] = ['debug', 'log', 'warn', 'error', 'fatal'];

/** The levels written at a minimum level: "warn" gives warn, error and fatal. */
export function logLevelsFrom(minimum: Env['LOG_LEVEL']): LogLevel[] {
  return SEVERITY.slice(SEVERITY.indexOf(minimum));
}

/**
 * The process logger for the API and the worker. JSON mode writes one object
 * per line with the context and any structured fields at the top level, ready
 * for a log collector. Credentials never reach a log line, whatever the format.
 */
export function createLogger(env: Pick<Env, 'LOG_FORMAT' | 'LOG_LEVEL'>): ConsoleLogger {
  const json = env.LOG_FORMAT === 'json';
  return new ConsoleLogger({
    json,
    colors: !json,
    logLevels: logLevelsFrom(env.LOG_LEVEL),
    flattenParams: true,
    redact: ['password', 'secret', 'token', 'authorization', 'cookie', 'apiKey'],
  });
}
