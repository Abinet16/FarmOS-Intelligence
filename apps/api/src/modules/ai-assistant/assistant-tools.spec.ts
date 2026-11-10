import { ROLES } from '@farmos/shared-types';
import { ASSISTANT_TOOLS, toolDefinitions, toolsFor, untrusted } from './assistant-tools.js';

describe('assistant tools', () => {
  it('are a fixed allowlist of read-only operations', () => {
    expect(ASSISTANT_TOOLS.map((t) => t.name)).toEqual([
      'list_flocks',
      'organization_overview',
      'compare_flocks',
      'compare_farms',
      'flock_daily_records',
      'list_alerts',
      'health_and_vaccinations',
      'inventory_status',
    ]);
  });

  it('are offered only to roles that can view reports', () => {
    expect(toolsFor({ role: 'MANAGER' })).toHaveLength(ASSISTANT_TOOLS.length);
    expect(toolsFor({ role: 'VETERINARIAN' })).toHaveLength(ASSISTANT_TOOLS.length);
    expect(toolsFor({ role: 'FIELD_WORKER' })).toEqual([]);
    for (const role of ROLES) {
      for (const t of toolsFor({ role })) expect(t.permission).toBe('reports:view');
    }
  });

  it('publish strict schemas that forbid unknown arguments', () => {
    for (const definition of toolDefinitions(ASSISTANT_TOOLS)) {
      expect(definition.strict).toBe(true);
      expect(definition.input_schema).toMatchObject({
        type: 'object',
        additionalProperties: false,
      });
      expect(JSON.stringify(definition.input_schema)).not.toContain('$schema');
    }
  });

  it('never accept an organization id from the model', () => {
    for (const t of ASSISTANT_TOOLS) {
      expect(Object.keys(t.input.shape)).not.toContain('organizationId');
      expect(t.input.safeParse({ organizationId: crypto.randomUUID() }).success).toBe(false);
    }
  });

  it('reject malformed ids and dates', () => {
    const daily = ASSISTANT_TOOLS.find((t) => t.name === 'flock_daily_records')!;
    expect(daily.input.safeParse({ batchId: "1' OR '1'='1" }).success).toBe(false);
    expect(
      daily.input.safeParse({ batchId: crypto.randomUUID(), from: '2026-13-01' }).success,
    ).toBe(false);
    expect(
      daily.input.safeParse({ batchId: crypto.randomUUID(), from: '2026-11-01' }).success,
    ).toBe(true);
  });
});

describe('untrusted', () => {
  it('labels staff text and caps its length', () => {
    expect(untrusted(null)).toBeNull();
    expect(untrusted('Birds look dull')).toEqual({ untrustedText: 'Birds look dull' });
    expect(untrusted('x'.repeat(2000))!.untrustedText).toHaveLength(500);
  });
});
