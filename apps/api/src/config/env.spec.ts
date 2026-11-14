import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const valid = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    BETTER_AUTH_URL: 'http://localhost:4000',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
  };

  it('applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
  });

  it('splits a comma-separated CORS allowlist', () => {
    const env = loadEnv({ ...valid, CORS_ORIGINS: 'https://a.example, https://b.example' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  it('parses the trust proxy setting', () => {
    expect(loadEnv(valid).TRUST_PROXY).toBe(false);
    expect(loadEnv({ ...valid, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(loadEnv({ ...valid, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ ...valid, TRUST_PROXY: 'loopback, 10.0.0.0/8' }).TRUST_PROXY).toBe(
      'loopback, 10.0.0.0/8',
    );
  });

  it('leaves the assistant unconfigured without a key', () => {
    const env = loadEnv(valid);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AI_MODEL).toBe('claude-opus-5-5');
    expect(env.AI_DAILY_QUESTION_LIMIT).toBe(50);
  });

  it('defaults the job and report settings', () => {
    const env = loadEnv(valid);
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.QUEUE_PREFIX).toBe('farmos');
    expect(env.REPORTS_DIR).toBe('var/reports');
    expect(env.REPORT_RETENTION_DAYS).toBe(7);
    expect(env.MAIL_TRANSPORT).toBe('log');
  });

  it('caps report retention', () => {
    expect(() => loadEnv({ ...valid, REPORT_RETENTION_DAYS: '365' })).toThrow(
      /REPORT_RETENTION_DAYS/,
    );
  });

  it('rejects a non-positive question limit', () => {
    expect(() => loadEnv({ ...valid, AI_DAILY_QUESTION_LIMIT: '0' })).toThrow(
      /AI_DAILY_QUESTION_LIMIT/,
    );
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = valid;
    expect(() => loadEnv(rest)).toThrow(/DATABASE_URL/);
  });

  it('defaults logging, metrics and rate limits', () => {
    const env = loadEnv(valid);
    expect(env.LOG_FORMAT).toBe('pretty');
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.METRICS_TOKEN).toBeUndefined();
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(300);
  });

  it('rejects an unknown log format and a short metrics token', () => {
    expect(() => loadEnv({ ...valid, LOG_FORMAT: 'xml' })).toThrow(/LOG_FORMAT/);
    expect(() => loadEnv({ ...valid, METRICS_TOKEN: 'short' })).toThrow(/METRICS_TOKEN/);
  });

  it('rejects a short auth secret', () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/BETTER_AUTH_SECRET/);
  });
});
