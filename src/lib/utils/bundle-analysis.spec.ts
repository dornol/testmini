import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Bundle safety tests.
 *
 * Guards against server-only packages accidentally leaking into client code,
 * validates dependency classification, and checks for import hygiene.
 */

const ROOT = process.cwd();

function readFileSafe(path: string): string | null {
	try {
		return readFileSync(resolve(ROOT, path), 'utf-8');
	} catch {
		return null;
	}
}

function collectFiles(dir: string, ext: string): string[] {
	const files: string[] = [];
	const fullDir = resolve(ROOT, dir);
	try {
		for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				// Skip server directories and ui component internals
				if (entry.name !== 'server' && entry.name !== 'ui') {
					files.push(...collectFiles(path, ext));
				}
			} else if (entry.name.endsWith(ext) && !entry.name.includes('.spec.') && !entry.name.includes('.test.')) {
				files.push(path);
			}
		}
	} catch {
		// directory doesn't exist
	}
	return files;
}

const SERVER_ONLY_PACKAGES = [
	'@aws-sdk/client-s3',
	'pdfkit',
	'nodemailer',
	'ioredis',
	'pino',
	'node-cron',
	'postgres',
	'drizzle-orm',
	'better-auth',
];

describe('bundle safety', () => {
	describe('server-only packages not imported in key layout/component files', () => {
		const criticalFiles = [
			'src/routes/+layout.svelte',
			'src/lib/components/Sidebar.svelte',
			'src/lib/components/Header.svelte',
			'src/lib/components/KeyboardShortcuts.svelte',
			'src/lib/components/NotificationBell.svelte',
			'src/lib/components/ThemeToggle.svelte',
			'src/lib/components/VirtualList.svelte',
		];

		for (const file of criticalFiles) {
			it(`${file} should not import server-only packages`, () => {
				const content = readFileSafe(file);
				if (!content) return; // skip if file doesn't exist

				for (const pkg of SERVER_ONLY_PACKAGES) {
					expect(content, `Found "${pkg}" import in ${file}`).not.toContain(`from '${pkg}'`);
					expect(content, `Found "${pkg}" import in ${file}`).not.toContain(`from "${pkg}"`);
				}
			});
		}
	});

	describe('client utility files should not import server modules', () => {
		const clientUtils = collectFiles('src/lib/utils', '.ts');

		for (const file of clientUtils) {
			it(`${file} should not import from $lib/server`, () => {
				const content = readFileSafe(file);
				if (!content) return;

				expect(content, `Found $lib/server import in ${file}`).not.toContain('$lib/server');
				expect(content, `Found $lib/server import in ${file}`).not.toContain("'../server/");
				expect(content, `Found $lib/server import in ${file}`).not.toContain('"../server/');
			});
		}
	});

	describe('no direct database imports in components', () => {
		const componentFiles = collectFiles('src/lib/components', '.svelte');

		for (const file of componentFiles) {
			it(`${file} should not import from database layer`, () => {
				const content = readFileSafe(file);
				if (!content) return;

				expect(content).not.toContain("from '$lib/server/db");
				expect(content).not.toContain("from '$lib/server/db/schema");
				expect(content).not.toContain("from 'drizzle-orm");
			});
		}
	});

	describe('package.json dependency classification', () => {
		const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));

		it('runtime server packages should be in dependencies', () => {
			const serverRuntime = ['pino', 'ioredis', 'nodemailer', 'pdfkit'];
			for (const p of serverRuntime) {
				expect(pkg.dependencies[p], `${p} should be in dependencies`).toBeDefined();
			}
		});

		it('client packages should be in dependencies', () => {
			const clientRuntime = ['chart.js', 'svelte-dnd-action', 'zod'];
			for (const p of clientRuntime) {
				expect(pkg.dependencies[p], `${p} should be in dependencies`).toBeDefined();
			}
		});

		it('analysis/testing tools should be devDependencies only', () => {
			const devOnly = ['rollup-plugin-visualizer', '@lhci/cli', '@axe-core/playwright', 'vitest', '@playwright/test'];
			for (const p of devOnly) {
				expect(pkg.devDependencies[p], `${p} should be in devDependencies`).toBeDefined();
				expect(pkg.dependencies?.[p], `${p} should NOT be in dependencies`).toBeUndefined();
			}
		});

		it('framework packages should be devDependencies', () => {
			const frameworkDev = ['svelte', 'typescript', 'vite', '@sveltejs/kit'];
			for (const p of frameworkDev) {
				expect(pkg.devDependencies[p], `${p} should be in devDependencies`).toBeDefined();
			}
		});
	});

	describe('lighthouserc.cjs configuration', () => {
		it('should exist and be valid', () => {
			const content = readFileSafe('lighthouserc.cjs');
			expect(content).not.toBeNull();
			expect(content).toContain('ci');
			expect(content).toContain('collect');
			expect(content).toContain('assert');
		});

		it('should have accessibility threshold', () => {
			const content = readFileSafe('lighthouserc.cjs');
			expect(content).toContain('categories:accessibility');
			expect(content).toContain('minScore');
		});

		it('should target filesystem upload (no external service)', () => {
			const content = readFileSafe('lighthouserc.cjs');
			expect(content).toContain("target: 'filesystem'");
		});
	});

	describe('vite.config.ts build configuration', () => {
		it('should have visualizer plugin configured', () => {
			const content = readFileSafe('vite.config.ts');
			expect(content).not.toBeNull();
			expect(content).toContain('visualizer');
			expect(content).toContain('ANALYZE');
		});

		it('should only enable visualizer when ANALYZE=true', () => {
			const content = readFileSafe('vite.config.ts');
			expect(content).toContain("process.env.ANALYZE === 'true'");
		});
	});
});
