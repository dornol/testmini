/**
 * Minimal Gherkin step parser for BDD-style test case steps.
 * Only handles step-level keywords (Given/When/Then/And/But).
 * Feature/Scenario/Background lines are ignored.
 */

export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export interface GherkinStep {
	keyword: GherkinKeyword;
	text: string;
	expected: string;
}

const KEYWORDS: GherkinKeyword[] = ['Given', 'When', 'Then', 'And', 'But'];
const KEYWORD_REGEX = /^(Given|When|Then|And|But)\s+(.+)$/;
const IGNORED_PREFIXES = ['Feature:', 'Scenario:', 'Background:', 'Scenario Outline:', 'Examples:'];

/**
 * Parse multi-line Gherkin text into an array of GherkinStep objects.
 * - Lines starting with Given/When/Then/And/But become steps
 * - Blank lines and comment lines (#) are ignored
 * - Feature/Scenario/Background lines are ignored
 */
export function parseGherkin(text: string): GherkinStep[] {
	if (!text || !text.trim()) return [];

	const lines = text.split('\n');
	const steps: GherkinStep[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trim();

		// Skip empty lines
		if (!line) continue;

		// Skip comments
		if (line.startsWith('#')) continue;

		// Skip Feature/Scenario/Background lines
		if (IGNORED_PREFIXES.some((prefix) => line.startsWith(prefix))) continue;

		// Match keyword lines
		const match = line.match(KEYWORD_REGEX);
		if (match) {
			steps.push({
				keyword: match[1] as GherkinKeyword,
				text: match[2],
				expected: ''
			});
		}
		// Non-keyword, non-comment lines are ignored
	}

	return steps;
}

/**
 * Convert an array of GherkinStep objects back to Gherkin text.
 */
export function stepsToGherkin(steps: GherkinStep[]): string {
	if (!steps || steps.length === 0) return '';

	return steps.map((step) => `${step.keyword} ${step.text}`).join('\n');
}

/**
 * Convert traditional steps (action/expected) to GherkinStep format.
 * Each action becomes a step. If the action already starts with a keyword,
 * that keyword is used; otherwise, a heuristic is applied.
 */
export function stepsToGherkinSteps(
	steps: { action: string; expected: string }[]
): GherkinStep[] {
	return steps.map((step, i) => {
		const action = step.action.trim();
		const match = action.match(KEYWORD_REGEX);
		if (match) {
			return {
				keyword: match[1] as GherkinKeyword,
				text: match[2],
				expected: step.expected
			};
		}
		// Assign keyword based on position heuristic
		let keyword: GherkinKeyword;
		if (i === 0) keyword = 'Given';
		else if (i === steps.length - 1) keyword = 'Then';
		else keyword = 'When';

		return { keyword, text: action, expected: step.expected };
	});
}

/**
 * Convert GherkinStep array to traditional steps (action/expected) format.
 * The keyword is prepended to the action text.
 */
export function gherkinStepsToSteps(
	gherkinSteps: GherkinStep[]
): { action: string; expected: string }[] {
	return gherkinSteps.map((step) => ({
		action: `${step.keyword} ${step.text}`,
		expected: step.expected
	}));
}

/**
 * Check if a keyword is a valid Gherkin keyword.
 */
export function isValidKeyword(keyword: string): keyword is GherkinKeyword {
	return KEYWORDS.includes(keyword as GherkinKeyword);
}

export { KEYWORDS };
