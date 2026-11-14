import { createLogger, logLevelsFrom } from './logger.js';

describe('logLevelsFrom', () => {
  it('includes the minimum level and everything more severe', () => {
    expect(logLevelsFrom('debug')).toEqual(['debug', 'log', 'warn', 'error', 'fatal']);
    expect(logLevelsFrom('warn')).toEqual(['warn', 'error', 'fatal']);
    expect(logLevelsFrom('error')).toEqual(['error', 'fatal']);
  });
});

describe('createLogger', () => {
  const capture = () => {
    const lines: string[] = [];
    const spy = (stream: NodeJS.WriteStream) =>
      vi.spyOn(stream, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });
    const spies = [spy(process.stdout), spy(process.stderr)];
    return { lines, restore: () => spies.forEach((s) => s.mockRestore()) };
  };

  it('writes one JSON object per line with structured fields at the top level', () => {
    const out = capture();
    try {
      createLogger({ LOG_FORMAT: 'json', LOG_LEVEL: 'log' }).log(
        'request',
        { status: 200 },
        'Http',
      );
    } finally {
      out.restore();
    }
    expect(out.lines).toHaveLength(1);
    const entry = JSON.parse(out.lines[0]!);
    expect(entry).toMatchObject({ level: 'log', context: 'Http', message: 'request', status: 200 });
  });

  it('redacts credentials in structured values', () => {
    const out = capture();
    try {
      createLogger({ LOG_FORMAT: 'json', LOG_LEVEL: 'log' }).log(
        { user: { email: 'a@example.test', password: 'hunter2' }, headers: { cookie: 's=1' } },
        'Test',
      );
    } finally {
      out.restore();
    }
    const line = out.lines.join('');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('s=1');
    expect(line).toContain('a@example.test');
  });

  it('drops messages below the minimum level', () => {
    const out = capture();
    try {
      const logger = createLogger({ LOG_FORMAT: 'json', LOG_LEVEL: 'warn' });
      logger.log('quiet');
      logger.warn('loud');
    } finally {
      out.restore();
    }
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toContain('loud');
  });
});
