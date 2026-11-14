/**
 * A small in-process metrics registry that renders the Prometheus text format.
 * It covers what the API needs (labelled counters and histograms, gauges read
 * at scrape time) without a client library. Values are per process: run one
 * scrape target per API instance.
 */

type Labels = Record<string, string>;

const key = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((name) => `${name}="${escapeLabel(labels[name]!)}"`)
    .join(',');

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

const series = (name: string, labelText: string, value: number) =>
  `${name}${labelText ? `{${labelText}}` : ''} ${Number.isFinite(value) ? value : 0}`;

interface Metric {
  render(): string[];
}

export class Counter implements Metric {
  private readonly values = new Map<string, number>();

  constructor(
    readonly name: string,
    private readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1) {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }

  value(labels: Labels = {}): number {
    return this.values.get(key(labels)) ?? 0;
  }

  render() {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} counter`,
      ...[...this.values].map(([labels, value]) => series(this.name, labels, value)),
    ];
  }
}

export class Histogram implements Metric {
  private readonly values = new Map<string, { buckets: number[]; sum: number; count: number }>();

  constructor(
    readonly name: string,
    private readonly help: string,
    private readonly bounds: number[],
  ) {}

  observe(labels: Labels, value: number) {
    const k = key(labels);
    let entry = this.values.get(k);
    if (!entry) {
      entry = { buckets: this.bounds.map(() => 0), sum: 0, count: 0 };
      this.values.set(k, entry);
    }
    this.bounds.forEach((bound, i) => {
      if (value <= bound) entry.buckets[i]! += 1;
    });
    entry.sum += value;
    entry.count += 1;
  }

  render() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [labels, entry] of this.values) {
      const prefix = labels ? `${labels},` : '';
      this.bounds.forEach((bound, i) =>
        lines.push(series(`${this.name}_bucket`, `${prefix}le="${bound}"`, entry.buckets[i]!)),
      );
      lines.push(series(`${this.name}_bucket`, `${prefix}le="+Inf"`, entry.count));
      lines.push(series(`${this.name}_sum`, labels, entry.sum));
      lines.push(series(`${this.name}_count`, labels, entry.count));
    }
    return lines;
  }
}

/** A value read when the metrics are scraped, such as memory in use. */
export class Gauge implements Metric {
  constructor(
    readonly name: string,
    private readonly help: string,
    private readonly read: () => number,
  ) {}

  render() {
    return [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} gauge`,
      series(this.name, '', this.read()),
    ];
  }
}

export class MetricsRegistry {
  private readonly metrics = new Map<string, Metric>();

  register<M extends Metric & { name: string }>(metric: M): M {
    if (this.metrics.has(metric.name)) throw new Error(`Metric ${metric.name} already registered`);
    this.metrics.set(metric.name, metric);
    return metric;
  }

  render(): string {
    return [...this.metrics.values()].flatMap((metric) => metric.render()).join('\n') + '\n';
  }
}
