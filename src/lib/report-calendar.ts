export function reportCalendarDate(date: Date): string {
	const year = String(date.getFullYear()).padStart(4, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function parseReportCalendarDate(value: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const [year, month, day] = value.split('-').map(Number);
	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(0, 0, 0, 0);
	return reportCalendarDate(date) === value ? date : null;
}
