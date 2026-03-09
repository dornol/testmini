/**
 * API Performance Benchmark Script
 *
 * Measures response times for key API endpoints.
 * Requires a running server with seeded test data.
 *
 * Usage:
 *   node --env-file=.env --import tsx/esm scripts/benchmark.ts
 *
 * Options (env vars):
 *   BASE_URL      - Server URL (default: http://localhost:5173)
 *   BENCH_ROUNDS  - Requests per endpoint (default: 20)
 *   API_KEY       - Project API key for authenticated endpoints
 *   PROJECT_ID    - Project ID to benchmark (default: 1)
 */

import { percentile, round2 as round } from '../src/lib/utils/percentile.js';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173';
const ROUNDS = Number(process.env.BENCH_ROUNDS ?? 20);
const API_KEY = process.env.API_KEY ?? '';
const PROJECT_ID = process.env.PROJECT_ID ?? '1';

// ── Types ──────────────────────────────────────────

interface BenchResult {
	endpoint: string;
	method: string;
	rounds: number;
	avgMs: number;
	medianMs: number;
	p95Ms: number;
	p99Ms: number;
	minMs: number;
	maxMs: number;
	errorCount: number;
}

// ── Endpoints ──────────────────────────────────────

interface Endpoint {
	label: string;
	method: string;
	path: string;
	body?: unknown;
	auth?: boolean;
}

const endpoints: Endpoint[] = [
	// Health (no auth)
	{ label: 'Health check', method: 'GET', path: '/api/health' },

	// Authenticated endpoints (require API key)
	{ label: 'Project dashboard (page)', method: 'GET', path: `/projects/${PROJECT_ID}`, auth: true },
	{ label: 'Test cases list (page)', method: 'GET', path: `/projects/${PROJECT_ID}/test-cases`, auth: true },
	{ label: 'Test runs list (page)', method: 'GET', path: `/projects/${PROJECT_ID}/test-runs`, auth: true },
	{ label: 'Reports page', method: 'GET', path: `/projects/${PROJECT_ID}/reports`, auth: true },

	// API endpoints
	{ label: 'API: test cases', method: 'GET', path: `/api/projects/${PROJECT_ID}/test-cases`, auth: true },
	{ label: 'API: test runs', method: 'GET', path: `/api/projects/${PROJECT_ID}/test-runs`, auth: true },
	{ label: 'API: trends', method: 'GET', path: `/api/projects/${PROJECT_ID}/reports/trends`, auth: true },
	{ label: 'API: requirements', method: 'GET', path: `/api/projects/${PROJECT_ID}/requirements`, auth: true },
	{ label: 'API: requirements matrix', method: 'GET', path: `/api/projects/${PROJECT_ID}/requirements/matrix`, auth: true },
];

// ── Benchmark Runner ───────────────────────────────

async function benchEndpoint(ep: Endpoint, rounds: number): Promise<BenchResult> {
	const url = `${BASE_URL}${ep.path}`;
	const headers: Record<string, string> = {
		'Accept': 'text/html,application/json',
	};

	if (ep.auth && API_KEY) {
		headers['Authorization'] = `Bearer ${API_KEY}`;
	}

	// Warm up (1 request, not counted)
	try {
		await fetch(url, { method: ep.method, headers, redirect: 'follow' });
	} catch {
		// ignore warmup errors
	}

	const times: number[] = [];
	let errorCount = 0;

	for (let i = 0; i < rounds; i++) {
		const start = performance.now();
		try {
			const res = await fetch(url, { method: ep.method, headers, redirect: 'follow' });
			// Consume body to measure full response time
			await res.text();
			if (!res.ok && res.status !== 302) {
				errorCount++;
			}
		} catch {
			errorCount++;
		}
		times.push(performance.now() - start);
	}

	times.sort((a, b) => a - b);

	return {
		endpoint: `${ep.method} ${ep.path}`,
		method: ep.method,
		rounds,
		avgMs: round(times.reduce((a, b) => a + b, 0) / times.length),
		medianMs: round(percentile(times, 50)),
		p95Ms: round(percentile(times, 95)),
		p99Ms: round(percentile(times, 99)),
		minMs: round(times[0]),
		maxMs: round(times[times.length - 1]),
		errorCount,
	};
}

// percentile and round imported from src/lib/utils/percentile.ts

// ── Concurrent Load Test ───────────────────────────

interface ConcurrentResult {
	endpoint: string;
	concurrency: number;
	totalRequests: number;
	totalTimeMs: number;
	rps: number;
	avgMs: number;
	errorCount: number;
}

async function concurrentBench(ep: Endpoint, concurrency: number, totalRequests: number): Promise<ConcurrentResult> {
	const url = `${BASE_URL}${ep.path}`;
	const headers: Record<string, string> = { 'Accept': 'text/html,application/json' };
	if (ep.auth && API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

	let completed = 0;
	let errorCount = 0;
	const times: number[] = [];

	const start = performance.now();

	async function worker() {
		while (completed < totalRequests) {
			completed++;
			const t0 = performance.now();
			try {
				const res = await fetch(url, { method: ep.method, headers, redirect: 'follow' });
				await res.text();
				if (!res.ok && res.status !== 302) errorCount++;
			} catch {
				errorCount++;
			}
			times.push(performance.now() - t0);
		}
	}

	await Promise.all(Array.from({ length: concurrency }, () => worker()));
	const totalTimeMs = performance.now() - start;

	return {
		endpoint: `${ep.method} ${ep.path}`,
		concurrency,
		totalRequests: times.length,
		totalTimeMs: round(totalTimeMs),
		rps: round((times.length / totalTimeMs) * 1000),
		avgMs: round(times.reduce((a, b) => a + b, 0) / times.length),
		errorCount,
	};
}

// ── Main ───────────────────────────────────────────

async function main() {
	console.log('='.repeat(70));
	console.log(`  testmini API Performance Benchmark`);
	console.log(`  Server: ${BASE_URL}`);
	console.log(`  Rounds: ${ROUNDS} per endpoint`);
	console.log(`  Project: ${PROJECT_ID}`);
	console.log(`  API Key: ${API_KEY ? 'configured' : 'not set (auth endpoints may fail)'}`);
	console.log('='.repeat(70));

	// 1. Check server is reachable
	try {
		const res = await fetch(`${BASE_URL}/api/health`);
		const body = await res.json() as Record<string, unknown>;
		console.log(`\n  Server status: ${body.status}`);
	} catch (e) {
		console.error(`\n  ERROR: Cannot reach ${BASE_URL}/api/health`);
		console.error('  Make sure the server is running (pnpm dev or pnpm preview)');
		process.exit(1);
	}

	// 2. Sequential benchmark
	console.log('\n' + '─'.repeat(70));
	console.log('  Sequential Benchmark (1 request at a time)');
	console.log('─'.repeat(70));

	const results: BenchResult[] = [];
	for (const ep of endpoints) {
		process.stdout.write(`  ${ep.label}...`);
		const result = await benchEndpoint(ep, ROUNDS);
		results.push(result);

		const errTag = result.errorCount > 0 ? ` [${result.errorCount} errors]` : '';
		console.log(` avg=${result.avgMs}ms  p50=${result.medianMs}ms  p95=${result.p95Ms}ms  min=${result.minMs}ms  max=${result.maxMs}ms${errTag}`);
	}

	// 3. Concurrent load test on key endpoints
	console.log('\n' + '─'.repeat(70));
	console.log('  Concurrent Load Test');
	console.log('─'.repeat(70));

	const loadEndpoints = endpoints.filter(e =>
		e.label.includes('Health') || e.label.includes('API: test cases') || e.label.includes('dashboard')
	);

	const concurrentResults: ConcurrentResult[] = [];
	for (const ep of loadEndpoints) {
		for (const concurrency of [5, 10]) {
			const total = concurrency * 5;
			process.stdout.write(`  ${ep.label} (${concurrency} concurrent, ${total} total)...`);
			const result = await concurrentBench(ep, concurrency, total);
			concurrentResults.push(result);

			const errTag = result.errorCount > 0 ? ` [${result.errorCount} errors]` : '';
			console.log(` ${result.rps} rps  avg=${result.avgMs}ms  total=${result.totalTimeMs}ms${errTag}`);
		}
	}

	// 4. Summary table
	console.log('\n' + '='.repeat(70));
	console.log('  Summary');
	console.log('='.repeat(70));

	console.log('\n  Sequential Results:');
	console.log('  ' + '-'.repeat(66));
	console.log(`  ${'Endpoint'.padEnd(35)} ${'Avg'.padStart(7)} ${'P50'.padStart(7)} ${'P95'.padStart(7)} ${'Max'.padStart(7)}`);
	console.log('  ' + '-'.repeat(66));
	for (const r of results) {
		const name = r.endpoint.length > 34 ? r.endpoint.slice(0, 31) + '...' : r.endpoint;
		console.log(`  ${name.padEnd(35)} ${(r.avgMs + 'ms').padStart(7)} ${(r.medianMs + 'ms').padStart(7)} ${(r.p95Ms + 'ms').padStart(7)} ${(r.maxMs + 'ms').padStart(7)}`);
	}

	console.log('\n  Concurrent Results:');
	console.log('  ' + '-'.repeat(66));
	console.log(`  ${'Endpoint'.padEnd(25)} ${'Conc'.padStart(5)} ${'RPS'.padStart(8)} ${'Avg'.padStart(8)} ${'Errors'.padStart(7)}`);
	console.log('  ' + '-'.repeat(66));
	for (const r of concurrentResults) {
		const name = r.endpoint.length > 24 ? r.endpoint.slice(0, 21) + '...' : r.endpoint;
		console.log(`  ${name.padEnd(25)} ${String(r.concurrency).padStart(5)} ${(r.rps + '/s').padStart(8)} ${(r.avgMs + 'ms').padStart(8)} ${String(r.errorCount).padStart(7)}`);
	}

	// 5. Identify slow endpoints
	const slowEndpoints = results.filter(r => r.p95Ms > 500);
	if (slowEndpoints.length > 0) {
		console.log('\n  ⚠ Slow endpoints (p95 > 500ms):');
		for (const r of slowEndpoints) {
			console.log(`    - ${r.endpoint}: p95=${r.p95Ms}ms, avg=${r.avgMs}ms`);
		}
	} else {
		console.log('\n  All endpoints within acceptable latency (p95 < 500ms)');
	}

	console.log('\n' + '='.repeat(70));
}

main().catch((err) => {
	console.error('Benchmark failed:', err);
	process.exit(1);
});
