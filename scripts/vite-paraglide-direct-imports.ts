import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { rewriteMessageImports } from '../src/lib/build/paraglide-direct-imports';

/**
 * Client build only: lets each page download just the messages it uses instead of one shared
 * chunk with every message. See src/lib/build/paraglide-direct-imports.ts. Source files are not
 * changed, so type checking, the dev server and tests still see `m.key`.
 */
export function paraglideDirectImports(messagesFile: string): Plugin {
	const keys = new Set(Object.keys(JSON.parse(readFileSync(messagesFile, 'utf8'))));
	return {
		name: 'paraglide-direct-imports',
		enforce: 'pre',
		apply: 'build',
		transform(code, id, options) {
			if (options?.ssr) return null;
			const file = id.split('?')[0];
			if (!/\.(svelte|ts|js)$/.test(file) || file.includes('/node_modules/')) return null;
			if (file.includes('/src/lib/paraglide/') || !file.includes('/src/')) return null;
			const result = rewriteMessageImports(code, file, keys);
			return result === null ? null : { code: result, map: null };
		}
	};
}
