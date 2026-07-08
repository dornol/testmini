import globals from 'globals';
import tseslint from 'typescript-eslint';

const ignores = [
	'.svelte-kit/**',
	'build/**',
	'coverage/**',
	'node_modules/**',
	'playwright-report/**',
	'test-results/**',
	'src/lib/paraglide/**',
	'src/paraglide/**',
	'**/*.svelte'
];

export default [
	{ ignores },
	{
		files: ['**/*.{js,cjs,mjs,ts}'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				sourceType: 'module',
				ecmaVersion: 'latest'
			},
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2024
			}
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin
		}
	}
];
