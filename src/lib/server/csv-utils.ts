/** Parse a CSV string into a 2D array of strings, handling quoted fields and escaped quotes */
export function parseCSV(text: string): string[][] {
	const rows: string[][] = [];
	let current = '';
	let inQuotes = false;
	let row: string[] = [];

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < text.length && text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				row.push(current);
				current = '';
			} else if (ch === '\n' || ch === '\r') {
				if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
					i++;
				}
				row.push(current);
				current = '';
				if (row.some((c) => c.trim() !== '')) {
					rows.push(row);
				}
				row = [];
			} else {
				current += ch;
			}
		}
	}
	// Last row
	row.push(current);
	if (row.some((c) => c.trim() !== '')) {
		rows.push(row);
	}

	return rows;
}

/** Characters that spreadsheet apps may interpret as formula prefixes */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/** Escape and format a row of cells for CSV output */
export function formatCsvRow(cells: (string | null | undefined)[]): string {
	return cells.map((cell) => {
		let value = String(cell ?? '').replace(/"/g, '""');
		if (FORMULA_PREFIXES.some((p) => value.startsWith(p))) {
			value = `'${value}`;
		}
		return `"${value}"`;
	}).join(',');
}

/** Build a complete CSV response with BOM and Content-Disposition header */
export function csvResponse(headers: string[], rows: (string | null | undefined)[][], filename: string): Response {
	const headerRow = formatCsvRow(headers);
	const dataRows = rows.map((row) => formatCsvRow(row));
	const content = '\uFEFF' + [headerRow, ...dataRows].join('\n');

	return new Response(content, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
}
