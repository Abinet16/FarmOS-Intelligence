import { Counter, Gauge, Histogram, MetricsRegistry } from './metrics.js';

describe('MetricsRegistry', () => {
  it('renders labelled counters, with labels in a stable order', () => {
    const registry = new MetricsRegistry();
    const requests = registry.register(new Counter('requests_total', 'Requests.'));
    requests.inc({ status: '200', method: 'GET' });
    requests.inc({ method: 'GET', status: '200' });
    requests.inc({ method: 'POST', status: '201' }, 3);

    expect(registry.render()).toBe(
      [
        '# HELP requests_total Requests.',
        '# TYPE requests_total counter',
        'requests_total{method="GET",status="200"} 2',
        'requests_total{method="POST",status="201"} 3',
        '',
      ].join('\n'),
    );
    expect(requests.value({ method: 'GET', status: '200' })).toBe(2);
  });

  it('renders cumulative histogram buckets with sum and count', () => {
    const registry = new MetricsRegistry();
    const duration = registry.register(new Histogram('duration_seconds', 'Time.', [0.1, 1]));
    duration.observe({ route: '/a' }, 0.05);
    duration.observe({ route: '/a' }, 0.5);
    duration.observe({ route: '/a' }, 2);

    const text = registry.render();
    expect(text).toContain('duration_seconds_bucket{route="/a",le="0.1"} 1');
    expect(text).toContain('duration_seconds_bucket{route="/a",le="1"} 2');
    expect(text).toContain('duration_seconds_bucket{route="/a",le="+Inf"} 3');
    expect(text).toContain('duration_seconds_sum{route="/a"} 2.55');
    expect(text).toContain('duration_seconds_count{route="/a"} 3');
  });

  it('reads gauges at render time', () => {
    const registry = new MetricsRegistry();
    let value = 1;
    registry.register(new Gauge('things', 'Things.', () => value));
    value = 5;
    expect(registry.render()).toContain('things 5');
  });

  it('escapes label values and rejects duplicate names', () => {
    const registry = new MetricsRegistry();
    registry.register(new Counter('c', 'C.')).inc({ path: 'a"b\\c\nd' });
    expect(registry.render()).toContain('c{path="a\\"b\\\\c\\nd"} 1');
    expect(() => registry.register(new Counter('c', 'Again.'))).toThrow(/already registered/);
  });
});
