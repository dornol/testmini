import { describe, it, expect } from 'vitest';
import { formatCsvRow, csvResponse } from './csv-utils';

describe('formatCsvRow', () => {
	it('formats basic strings', () => {
		expect(formatCsvRow(['hello', 'world'])).toBe('"hello","world"');
	});

	it('converts null and undefined to empty strings', () => {
		expect(formatCsvRow([null, undefined, 'ok'])).toBe('"","","ok"');
	});

	it('escapes quotes by doubling them', () => {
		expect(formatCsvRow(['say "hi"'])).toBe('"say ""hi"""');
		expect(formatCsvRow(['a"b"c'])).toBe('"a""b""c"');
	});

	it('preserves commas within values (wrapped in quotes)', () => {
		expect(formatCsvRow(['a,b', 'c'])).toBe('"a,b","c"');
	});

	it('preserves newlines within values', () => {
		expect(formatCsvRow(['line1\nline2'])).toBe('"line1\nline2"');
		expect(formatCsvRow(['line1\r\nline2'])).toBe('"line1\r\nline2"');
	});

	it('returns empty string for empty array', () => {
		expect(formatCsvRow([])).toBe('');
	});

	it('handles single cell', () => {
		expect(formatCsvRow(['only'])).toBe('"only"');
	});
});

describe('csvResponse', () => {
	it('returns Response with correct content-type', async () => {
		const res = csvResponse(['A'], [['1']], 'test.csv');
		expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
	});

	it('includes BOM prefix', async () => {
		const res = csvResponse(['A'], [['1']], 'test.csv');
		const buf = await res.arrayBuffer();
		const bytes = new Uint8Array(buf);
		// UTF-8 BOM is EF BB BF
		expect(bytes[0]).toBe(0xef);
		expect(bytes[1]).toBe(0xbb);
		expect(bytes[2]).toBe(0xbf);
	});

	it('includes Content-Disposition header with filename', () => {
		const res = csvResponse(['A'], [['1']], 'export.csv');
		expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="export.csv"');
	});

	it('contains header row followed by data rows', async () => {
		const res = csvResponse(['Name', 'Age'], [['Alice', '30'], ['Bob', '25']], 'f.csv');
		const text = await res.text();
		const clean = text.replace(/^\uFEFF/, '');
		const lines = clean.split('\n');
		expect(lines).toEqual(['"Name","Age"', '"Alice","30"', '"Bob","25"']);
	});

	it('returns only header row when rows array is empty', async () => {
		const res = csvResponse(['Col1', 'Col2'], [], 'f.csv');
		const text = await res.text();
		const clean = text.replace(/^\uFEFF/, '');
		const lines = clean.split('\n');
		expect(lines).toEqual(['"Col1","Col2"']);
	});

	it('handles special characters in filename', () => {
		const res = csvResponse(['A'], [], 'report (1).csv');
		expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="report (1).csv"');
	});
});
