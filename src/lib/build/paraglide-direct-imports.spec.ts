import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile } from '@inlang/paraglide-js';
import { rewriteMessageImports, toModuleName } from './paraglide-direct-imports';

const keys = new Set([
	'nav_projects',
	'common_save',
	'custom_field_type_TEXT',
	'webhook_event_TEST_RUN_COMPLETED'
]);
const barrel = "import * as m from '$lib/paraglide/messages.js';";
const rewrite = (code: string, file = '/src/lib/x.ts') => rewriteMessageImports(code, file, keys);

describe('rewriteMessageImports', () => {
	it('replaces calls with direct per-message imports', () => {
		const out = rewrite(`${barrel}\nconst a = m.nav_projects();\nconst b = m.common_save();`)!;
		expect(out).toContain(
			"import { common_save as __m_common_save } from '$lib/paraglide/messages/common_save.js';"
		);
		expect(out).toContain(
			"import { nav_projects as __m_nav_projects } from '$lib/paraglide/messages/nav_projects.js';"
		);
		expect(out).toContain('const a = __m_nav_projects();');
		expect(out).not.toContain('paraglide/messages.js');
		expect(out).not.toMatch(/\bm\./);
	});

	it('handles keys with upper case letters (the bug that broke the custom fields page)', () => {
		const out = rewrite(
			`${barrel}\nconst labels = { TEXT: m.custom_field_type_TEXT, DONE: m.webhook_event_TEST_RUN_COMPLETED };`
		)!;
		expect(out).toContain('TEXT: __m_custom_field_type_TEXT,');
		expect(out).toContain('DONE: __m_webhook_event_TEST_RUN_COMPLETED');
		expect(out).toContain('messages/custom_field_type_text4.js');
		expect(out).not.toMatch(/\bm\./);
	});

	it('keeps the barrel when a member is not a known message key', () => {
		expect(rewrite(`${barrel}\nconst a = m.nav_projects(); const b = m.not_a_message();`)).toBeNull();
	});

	it('keeps the barrel when m is used as a value', () => {
		expect(rewrite(`${barrel}\nconst a = m.nav_projects(); use(m);`)).toBeNull();
		expect(rewrite(`${barrel}\nconst a = m.nav_projects(); const b = m[key];`)).toBeNull();
		expect(rewrite(`${barrel}\nconst a = m.nav_projects(); const c = { ...m };`)).toBeNull();
		expect(rewrite(`${barrel}\nconst a = m.nav_projects(); const t = typeof m;`)).toBeNull();
	});

	it('does not touch a local variable m.x in a file that never imports the messages', () => {
		expect(rewrite('for (const m of members) console.log(m.name);')).toBeNull();
	});

	it('ignores look-alikes: tailwind classes, units and property chains', () => {
		const out = rewrite(
			`${barrel}\nconst c = '-m-0.5 -m-2'; const t = \`\${h}h \${min}m\`; const x = foo.m.bar; const l = m.nav_projects();`
		)!;
		expect(out).toContain("'-m-0.5 -m-2'");
		expect(out).toContain('foo.m.bar');
		expect(out).toContain('__m_nav_projects()');
	});

	it('puts the imports at the top of the first script tag in a Svelte file', () => {
		const out = rewrite(
			`<script lang="ts">\n\t${barrel}\n\tlet x = 1;\n</script>\n<h1>{m.nav_projects()}</h1>\n<p>{m.common_save()}</p>`,
			'/src/routes/page.svelte'
		)!;
		expect(out.indexOf('<script lang="ts">')).toBeLessThan(out.indexOf('import { common_save'));
		expect(out).toContain('<h1>{__m_nav_projects()}</h1>');
		expect(out).toContain('<p>{__m_common_save()}</p>');
		expect(out).not.toMatch(/\bm\./);
	});

	it('leaves a Svelte file without a script tag alone', () => {
		expect(rewrite(`${barrel}<p>{m.nav_projects()}</p>`, '/src/routes/page.svelte')).toBeNull();
	});

	it('leaves a file that imports the messages but uses none of them alone', () => {
		expect(rewrite(`${barrel}\nexport const x = 1;`)).toBeNull();
	});
});

describe('toModuleName', () => {
	it('lower-cases and appends the number of upper case letters', () => {
		expect(toModuleName('nav_projects')).toBe('nav_projects');
		expect(toModuleName('notification_type_ASSIGNED')).toBe('notification_type_assigned8');
		expect(toModuleName('custom_field_type_TEXT')).toBe('custom_field_type_text4');
	});

	it('prefixes names that start with a digit or are reserved words', () => {
		expect(toModuleName('1st_item')).toBe('_1st_item');
		expect(toModuleName('default')).toBe('_default');
	});

	it('matches the module files paraglide really generates for every message', async () => {
		const outdir = mkdtempSync(join(tmpdir(), 'paraglide-contract-'));
		try {
			await compile({
				project: './project.inlang',
				outdir,
				outputStructure: 'message-modules'
			});
			const files = new Set(readdirSync(join(outdir, 'messages')));
			const keys = Object.keys(JSON.parse(readFileSync('messages/ko.json', 'utf8'))).filter(
				(key) => !key.startsWith('$')
			);
			const missing: string[] = [];
			const notExported: string[] = [];
			for (const key of keys) {
				const file = `${toModuleName(key)}.js`;
				if (!files.has(file)) {
					missing.push(`${key} -> ${file}`);
					continue;
				}
				const source = readFileSync(join(outdir, 'messages', file), 'utf8');
				const exported =
					source.includes(` as "${key}"`) || // upper case keys are exported under an alias
					source.includes(`export const ${key} =`);
				if (!exported) notExported.push(key);
			}
			expect(missing).toEqual([]);
			expect(notExported).toEqual([]);
		} finally {
			rmSync(outdir, { recursive: true, force: true });
		}
	}, 120_000);
});
