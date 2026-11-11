export type CsvValue = string | number | boolean | Date | null | undefined;

export interface Column<T> {
  header: string;
  value: (row: T) => CsvValue;
  /** Fixed decimal places for numbers (rates, kilograms). */
  decimals?: number;
}

/**
 * Characters that make a spreadsheet treat a cell as a formula. Exported files
 * include text typed by farm staff (notes, descriptions), so a cell such as
 * =HYPERLINK(...) must stay text when someone opens the file in Excel.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvValue, decimals?: number): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return decimals === undefined ? String(value) : value.toFixed(decimals);
  }
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value instanceof Date) return value.toISOString();
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 byte order mark, so Excel
 * opens farm and flock names with accents correctly.
 */
export function toCsv<T>(columns: readonly Column<T>[], rows: readonly T[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => cell(column.value(row), column.decimals)).join(','));
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}
