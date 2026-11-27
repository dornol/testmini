import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const outputDir = path.join(root, '.svelte-kit/output/client/_app/immutable');
const budgets = JSON.parse(await readFile(path.join(root, 'config/bundle-budgets.json'), 'utf8'));

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

// What a visitor actually downloads: the shared shell (kit entry, app, root layout, error node)
// plus the layouts and page of one route, following static imports, gzip-compressed.
const clientDir = path.join(root, '.svelte-kit/output/client');
const manifest = JSON.parse(await readFile(path.join(clientDir, '.vite/manifest.json'), 'utf8'));
const appSource = await readFile(
	path.join(root, '.svelte-kit/generated/client-optimized/app.js'),
	'utf8'
);
const nodeKey = (n) => `.svelte-kit/generated/client-optimized/nodes/${n}.js`;
const gzipSizes = new Map();
async function gzipBytes(key) {
	if (!gzipSizes.has(key)) {
		const file = await readFile(path.join(clientDir, manifest[key].file));
		gzipSizes.set(key, gzipSync(file, { level: 6 }).length);
	}
	return gzipSizes.get(key);
}
function closure(key, seen = new Set()) {
	if (!manifest[key] || seen.has(key)) return seen;
	seen.add(key);
	for (const imported of manifest[key].imports ?? []) closure(imported, seen);
	return seen;
}
async function firstLoadBytes(keys) {
	let total = 0;
	for (const key of keys) total += await gzipBytes(key);
	return total;
}
const shell = new Set();
for (const [key, entry] of Object.entries(manifest))
	if (entry.isEntry && !key.includes('/nodes/')) closure(key, shell);
for (const n of [0, 1]) closure(nodeKey(n), shell);
const dictionary = appSource.slice(appSource.indexOf('export const dictionary'));
const routes = [
	...dictionary.slice(0, dictionary.indexOf('};')).matchAll(/"(\/[^"]*)":\s*\[([^\n]*)\]/g)
];
let heaviestRoute = { path: '', bytes: 0 };
for (const [, routePath, nodes] of routes) {
	const keys = new Set(shell);
	for (const [n] of nodes.matchAll(/\d+/g)) closure(nodeKey(n), keys);
	const bytes = await firstLoadBytes(keys);
	if (bytes > heaviestRoute.bytes) heaviestRoute = { path: routePath, bytes };
}
const shellGzipBytes = await firstLoadBytes(shell);

const checks = [
	['Total client JavaScript', clientJsTotal, budgets.clientJsTotalBytes],
	['Largest client chunk', largestClientChunk.bytes, budgets.largestClientChunkBytes],
	['Largest route node', largestRouteNode.bytes, budgets.largestRouteNodeBytes],
	['Shared shell, gzip', shellGzipBytes, budgets.shellGzipBytes],
	['Heaviest route first load, gzip', heaviestRoute.bytes, budgets.heaviestRouteGzipBytes]
];
const failures = checks.filter(([, actual, budget]) => actual > budget);

for (const [label, actual, budget] of checks) {
	const status = actual <= budget ? 'PASS' : 'FAIL';
	console.log(
		`${status} ${label}: ${(actual / 1024).toFixed(2)} KiB / ${(budget / 1024).toFixed(2)} KiB`
	);
}
console.log(`Largest chunk: ${path.relative(root, largestClientChunk.path)}`);
console.log(`Largest route: ${path.relative(root, largestRouteNode.path)}`);
console.log(`Heaviest route first load: ${heaviestRoute.path}`);

if (failures.length > 0) {
	console.error(
		'Bundle budget exceeded. Split or lazy-load the regression before raising a budget.'
	);
	process.exit(1);
}
