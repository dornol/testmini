import { spawnSync } from 'node:child_process';

const mode = process.argv.includes('--write') ? '--write' : '--check';
const extensions = new Set(['.ts', '.svelte', '.js', '.css', '.html', '.json']);
const ignoredPrefixes = [
	'.svelte-kit/',
	'build/',
	'coverage/',
	'node_modules/',
	'playwright-report/',
	'test-results/',
	'src/lib/paraglide/',
	'src/paraglide/'
];

const diff = spawnSync(
	'git',
	['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--'],
	{ encoding: 'utf8' }
);

if (diff.status !== 0) {
	process.stderr.write(diff.stderr);
	process.exit(diff.status ?? 1);
}

const files = diff.stdout
	.split('\n')
	.map((file) => file.trim())
	.filter(Boolean)
	.filter((file) => extensions.has(file.slice(file.lastIndexOf('.'))))
	.filter((file) => !ignoredPrefixes.some((prefix) => file.startsWith(prefix)));

if (files.length === 0) {
	console.log('No changed files require formatting.');
	process.exit(0);
}

const prettier = spawnSync('prettier', [mode, ...files], { stdio: 'inherit' });
process.exit(prettier.status ?? 1);
