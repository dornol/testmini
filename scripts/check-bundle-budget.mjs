import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, '.svelte-kit/output/client/_app/immutable');
const budgets = JSON.parse(
	await readFile(path.join(root, 'config/bundle-budgets.json'), 'utf8')
);

async function listJavaScriptFiles(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const absolutePath = path.join(directory, entry.name);
			if (entry.isDirectory()) return listJavaScriptFiles(absolutePath);
			if (!entry.isFile() || !entry.name.endsWith('.js')) return [];
			return [{ path: absolutePath, bytes: (await stat(absolutePath)).size }];
		})
	);
	return nested.flat();
}

const files = await listJavaScriptFiles(outputDir);
const routeNodes = files.filter((file) => file.path.includes(`${path.sep}nodes${path.sep}`));
const largestClientChunk = files.reduce((largest, file) =>
	file.bytes > largest.bytes ? file : largest
);
const largestRouteNode = routeNodes.reduce((largest, file) =>
	file.bytes > largest.bytes ? file : largest
);
const clientJsTotal = files.reduce((total, file) => total + file.bytes, 0);

const checks = [
	['Total client JavaScript', clientJsTotal, budgets.clientJsTotalBytes],
	['Largest client chunk', largestClientChunk.bytes, budgets.largestClientChunkBytes],
	['Largest route node', largestRouteNode.bytes, budgets.largestRouteNodeBytes]
];
const failures = checks.filter(([, actual, budget]) => actual > budget);

for (const [label, actual, budget] of checks) {
	const status = actual <= budget ? 'PASS' : 'FAIL';
	console.log(`${status} ${label}: ${(actual / 1024).toFixed(2)} KiB / ${(budget / 1024).toFixed(2)} KiB`);
}
console.log(`Largest chunk: ${path.relative(root, largestClientChunk.path)}`);
console.log(`Largest route: ${path.relative(root, largestRouteNode.path)}`);

if (failures.length > 0) {
	console.error('Bundle budget exceeded. Split or lazy-load the regression before raising a budget.');
	process.exit(1);
}
