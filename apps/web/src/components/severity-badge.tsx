import type { Severity } from '@farmos/shared-types';
import { humanize } from '@/lib/format';

/**
 * Severity always shows an icon and a word next to the reserved status colour,
 * so it never relies on colour alone.
 */
const STYLES: Record<Severity, { icon: string; colour: string }> = {
  LOW: { icon: '○', colour: 'var(--chart-axis)' },
  MEDIUM: { icon: '▲', colour: 'var(--status-warning)' },
  HIGH: { icon: '◆', colour: 'var(--status-serious)' },
  CRITICAL: { icon: '■', colour: 'var(--status-critical)' },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon, colour } = STYLES[severity];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap">
      <span aria-hidden="true" style={{ color: colour }}>
        {icon}
      </span>
      {humanize(severity)}
    </span>
  );
}
