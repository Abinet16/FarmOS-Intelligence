import { toCsv, type Column } from './csv.js';

interface Row {
  name: string;
  count: number | null;
  rate?: number;
}

const columns: Column<Row>[] = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Count', value: (row) => row.count },
  { header: 'Rate %', value: (row) => row.rate, decimals: 2 },
];

const body = (csv: string) => csv.slice(1).split('\r\n');

describe('toCsv', () => {
  it('starts with a byte order mark and ends lines with CRLF', () => {
    const csv = toCsv(columns, [{ name: 'LAY-01', count: 3, rate: 1.234 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(body(csv)).toEqual(['Name,Count,Rate %', 'LAY-01,3,1.23', '']);
  });

  it('writes nothing for missing values', () => {
    expect(body(toCsv(columns, [{ name: 'A', count: null }]))[1]).toBe('A,,');
  });

  it('quotes commas, quotes and line breaks', () => {
    const [, line] = body(toCsv(columns, [{ name: 'North, "big" barn\nH1', count: 1 }]));
    expect(line).toBe('"North, ""big"" barn\nH1",1,');
  });

  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tTAB', '=HYPERLINK("http://x","y")'])(
    'keeps %s as text, not a formula',
    (name) => {
      const [, line] = body(toCsv(columns, [{ name, count: 0 }]));
      expect(line!.replace(/^"/, '').startsWith(`'`)).toBe(true);
    },
  );

  it('leaves negative numbers as numbers', () => {
    expect(body(toCsv(columns, [{ name: 'x', count: -4 }]))[1]).toBe('x,-4,');
  });

  it('writes dates as ISO 8601 and booleans as yes/no', () => {
    const csv = toCsv<{ at: Date; ok: boolean }>(
      [
        { header: 'At', value: (row) => row.at },
        { header: 'OK', value: (row) => row.ok },
      ],
      [{ at: new Date('2026-11-03T08:30:00Z'), ok: true }],
    );
    expect(body(csv)[1]).toBe('2026-11-03T08:30:00.000Z,yes');
  });

  it('writes only the header for no rows', () => {
    expect(body(toCsv(columns, []))).toEqual(['Name,Count,Rate %', '']);
  });
});
