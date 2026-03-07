/** Escape and format a row of cells for CSV output */
export function formatCsvRow(cells: (string | null | undefined)[]): string {
	return cells.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',');
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
