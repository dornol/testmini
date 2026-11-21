// Shared by the server CSV responses and client-side exports.

/** Characters that spreadsheet apps may interpret as formula prefixes */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/** Escape and format a row of cells for CSV output */
export function formatCsvRow(cells: (string | null | undefined)[]): string {
	return cells
		.map((cell) => {
			let value = String(cell ?? '').replace(/"/g, '""');
			if (FORMULA_PREFIXES.some((p) => value.startsWith(p))) {
				value = `'${value}`;
			}
			return `"${value}"`;
		})
		.join(',');
}
