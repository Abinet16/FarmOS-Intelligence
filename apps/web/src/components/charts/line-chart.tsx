'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatDate } from '@/lib/format';
import { niceTicks, segments } from './scale';

export interface ChartPoint {
  date: string;
  value: number | null;
}

const MARGIN = { top: 12, right: 12, bottom: 26, left: 52 };

/**
 * A single-series line over calendar days. Days without data are gaps, never
 * zeros. Hover or arrow keys move a crosshair whose readout is also announced
 * to screen readers; every value is also in the table view next to the charts.
 */
export function LineChart({
  title,
  points,
  format,
  zeroBased = false,
  height = 180,
}: {
  title: string;
  points: readonly ChartPoint[];
  format: (value: number) => string;
  zeroBased?: boolean;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const readoutId = useId();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const latest = [...points].reverse().find((p) => p.value !== null);

  const header = (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-medium">{title}</h3>
      {latest && (
        <span className="text-sm text-zinc-500">
          Latest{' '}
          <strong className="text-zinc-900 dark:text-zinc-100">{format(latest.value!)}</strong>
        </span>
      )}
    </div>
  );

  if (values.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col gap-2">
        {header}
        <p className="flex h-24 items-center justify-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-500 dark:border-zinc-700">
          Nothing recorded in this range.
        </p>
      </div>
    );
  }

  const ticks = niceTicks(
    zeroBased ? Math.min(0, ...values) : Math.min(...values),
    Math.max(...values),
  );
  const yMin = ticks[0]!;
  const yMax = ticks[ticks.length - 1]!;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const x = (index: number) =>
    MARGIN.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => MARGIN.top + (1 - (value - yMin) / (yMax - yMin)) * plotHeight;

  const runs = segments(points, (p) => p.value);
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  function onPointerMove(event: PointerEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      setActive((current) =>
        Math.min(
          points.length - 1,
          Math.max(0, (current ?? points.length - 1) + (current === null ? 0 : step)),
        ),
      );
    } else if (event.key === 'Escape') {
      setActive(null);
    }
  }

  const point = active === null ? null : points[active]!;
  const readout = point
    ? `${point.value === null ? 'Not recorded' : format(point.value)}, ${formatDate(point.date)}`
    : '';

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {header}
      <div
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20"
        tabIndex={0}
        role="group"
        aria-label={`${title}, ${points.length} days. Use the arrow keys to read values.`}
        aria-describedby={readoutId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={height} aria-hidden="true" className="block overflow-visible">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--chart-grid)"
                strokeWidth={1}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--chart-axis)"
              >
                {format(tick)}
              </text>
            </g>
          ))}
          {labelIndexes.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={height - 6}
              textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--chart-axis)"
            >
              {formatDate(points[index]!.date)}
            </text>
          ))}
          {runs.map((run) =>
            run.length === 1 ? (
              <circle
                key={run[0]!.index}
                cx={x(run[0]!.index)}
                cy={y(run[0]!.value)}
                r={4}
                fill="var(--chart-series)"
              />
            ) : (
              <path
                key={run[0]!.index}
                d={run.map((p, i) => `${i ? 'L' : 'M'}${x(p.index)},${y(p.value)}`).join('')}
                fill="none"
                stroke="var(--chart-series)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ),
          )}
          {point && (
            <g>
              <line
                x1={x(active!)}
                x2={x(active!)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                stroke="var(--chart-axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {point.value !== null && (
                <circle
                  cx={x(active!)}
                  cy={y(point.value)}
                  r={5}
                  fill="var(--chart-series)"
                  stroke="var(--background)"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {point && (
          <div
            className="pointer-events-none absolute top-0 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            style={{
              left: Math.min(Math.max(x(active!) - 60, 0), width - 120),
              width: 120,
            }}
          >
            <strong className="block text-sm">
              {point.value === null ? 'Not recorded' : format(point.value)}
            </strong>
            <span className="text-zinc-500">{formatDate(point.date)}</span>
          </div>
        )}
      </div>
      <p id={readoutId} className="sr-only" aria-live="polite">
        {readout}
      </p>
    </div>
  );
}
