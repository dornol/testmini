/**
 * Rewrites `m.some_key` into a direct import of that one message module.
 *
 * `import * as m from '$lib/paraglide/messages.js'` goes through a barrel that re-exports every
 * message module. The bundler treats all of them as reachable from every route, so it puts all
 * ~1,400 messages (both languages) into one chunk that every page downloads. Importing each
 * message from its own module lets a message live in the chunk of the routes that use it.
 *
 * This is a pure string transform so it can be unit tested; the Vite plugin only calls it for
 * the client build.
 */
const IMPORT = /import \* as m from '\$lib\/paraglide\/messages(?:\.js)?';?[ \t]*\r?\n?/;
// Keys can contain upper case letters (e.g. `custom_field_type_TEXT`).
const CANDIDATE = /(?<![\w$.-])m\.([A-Za-z0-9_]+)\b/g;
// Anything that uses `m` as a value, or as a member we did not recognise, makes the rewrite unsafe.
const UNSAFE =
	/(?<![\w$.-])m\.[A-Za-z_]|[(,=[]\s*m\s*[,)\];]|typeof m\b|\.\.\.m\b|(?<![\w$.-])m\[|(?<![\w$.-])m\s*=>/;

const RESERVED = new Set(
	(
		'break case catch class const continue debugger default delete do else export extends false ' +
		'finally for function if import in instanceof new null return super switch this throw true try ' +
		'typeof var void while with let static yield await enum implements interface package private ' +
		'protected public then'
	).split(' ')
);

/**
 * The file name paraglide gives a message module: lower case, a count of the upper case letters
 * appended (`notification_type_ASSIGNED` -> `notification_type_assigned8`). This mirrors
 * `toSafeModuleId` in @inlang/paraglide-js, which the package does not export. A test checks it
 * against the files paraglide really generates.
 */
export function toModuleName(key: string): string {
	const lower = key.toLowerCase().replace(/[^a-z0-9_]/g, '_');
	if (/^[0-9]/.test(lower) || RESERVED.has(lower)) return `_${lower}`;
	return lower + (key.match(/[A-Z]/g)?.length ?? '');
}

/** Returns the rewritten code, or null when the file must keep the barrel import. */
export function rewriteMessageImports(
	code: string,
	file: string,
	keys: ReadonlySet<string>
): string | null {
	if (!IMPORT.test(code)) return null;
	const rest = code.replace(IMPORT, '');

	const used = new Set<string>();
	for (const match of rest.matchAll(CANDIDATE)) if (keys.has(match[1])) used.add(match[1]);
	const body = rest.replace(CANDIDATE, (whole, key: string) =>
		keys.has(key) ? `__m_${key}` : whole
	);
	if (UNSAFE.test(body)) return null;
	if (used.size === 0) return null;

	const imports = [...used]
		.sort()
		.map(
			(key) =>
				`import { ${key} as __m_${key} } from '$lib/paraglide/messages/${toModuleName(key)}.js';`
		)
		.join('\n');
	if (file.endsWith('.svelte')) {
		const script = /<script\b[^>]*>/;
		if (!script.test(body)) return null;
		return body.replace(script, (tag) => `${tag}\n${imports}\n`);
	}
	return `${imports}\n${body}`;
}
