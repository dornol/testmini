/** Calculate the p-th percentile of a sorted array */
export function percentile(sorted: number[], p: number): number {
	const idx = (p / 100) * (sorted.length - 1);
	const low = Math.floor(idx);
	const high = Math.ceil(idx);
	if (low === high) return sorted[low];
	return sorted[low] + (sorted[high] - sorted[low]) * (idx - low);
}

/** Round to 2 decimal places */
export function round2(n: number): number {
	return Math.round(n * 100) / 100;
}
