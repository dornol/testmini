import { describe, it, expect } from 'vitest';
import {
	parseGherkin,
	stepsToGherkin,
	stepsToGherkinSteps,
	gherkinStepsToSteps,
	isValidKeyword,
	KEYWORDS,
	type GherkinStep
} from './gherkin-parser';

describe('parseGherkin', () => {
	it('parses basic Given/When/Then steps', () => {
		const text = `Given the user is on the login page
When the user enters valid credentials
Then the user should be redirected to the dashboard`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
		expect(steps[0]).toEqual({ keyword: 'Given', text: 'the user is on the login page', expected: '' });
		expect(steps[1]).toEqual({ keyword: 'When', text: 'the user enters valid credentials', expected: '' });
		expect(steps[2]).toEqual({ keyword: 'Then', text: 'the user should be redirected to the dashboard', expected: '' });
	});

	it('handles And and But keywords', () => {
		const text = `Given a logged-in user
And the user has admin privileges
When the user deletes a record
Then the record is removed
But the audit log is preserved`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(5);
		expect(steps[1].keyword).toBe('And');
		expect(steps[4].keyword).toBe('But');
	});

	it('ignores empty lines', () => {
		const text = `Given step one

When step two

Then step three`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
	});

	it('ignores comment lines', () => {
		const text = `# This is a comment
Given step one
# Another comment
When step two
Then step three`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
		expect(steps[0].keyword).toBe('Given');
	});

	it('ignores Feature/Scenario/Background lines', () => {
		const text = `Feature: Login
Scenario: Successful login
Background: User exists
Given the user is on the login page
When the user enters credentials
Then the user is logged in`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
		expect(steps[0]).toEqual({ keyword: 'Given', text: 'the user is on the login page', expected: '' });
	});

	it('ignores Scenario Outline and Examples', () => {
		const text = `Scenario Outline: Login attempts
Examples: Valid users
Given a user with name "<name>"`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(1);
		expect(steps[0].keyword).toBe('Given');
	});

	it('handles leading/trailing whitespace', () => {
		const text = `  Given step with leading spaces
	When step with tab
  Then step with trailing spaces  `;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
		expect(steps[0].text).toBe('step with leading spaces');
		expect(steps[1].text).toBe('step with tab');
		expect(steps[2].text).toBe('step with trailing spaces');
	});

	it('returns empty array for empty input', () => {
		expect(parseGherkin('')).toEqual([]);
		expect(parseGherkin('   ')).toEqual([]);
	});

	it('returns empty array for null/undefined-like input', () => {
		expect(parseGherkin('')).toEqual([]);
	});

	it('ignores lines without keywords', () => {
		const text = `Given step one
this line has no keyword
When step two
also not a keyword line
Then step three`;

		const steps = parseGherkin(text);
		expect(steps).toHaveLength(3);
	});
});

describe('stepsToGherkin', () => {
	it('converts step array to Gherkin text', () => {
		const steps: GherkinStep[] = [
			{ keyword: 'Given', text: 'the user is logged in', expected: '' },
			{ keyword: 'When', text: 'they click logout', expected: '' },
			{ keyword: 'Then', text: 'they are redirected to login', expected: '' }
		];

		const text = stepsToGherkin(steps);
		expect(text).toBe(
			'Given the user is logged in\nWhen they click logout\nThen they are redirected to login'
		);
	});

	it('returns empty string for empty array', () => {
		expect(stepsToGherkin([])).toBe('');
	});

	it('handles single step', () => {
		const steps: GherkinStep[] = [{ keyword: 'Given', text: 'a precondition', expected: '' }];
		expect(stepsToGherkin(steps)).toBe('Given a precondition');
	});
});

describe('stepsToGherkinSteps', () => {
	it('converts action/expected steps to GherkinStep format', () => {
		const steps = [
			{ action: 'the user is on the login page', expected: '' },
			{ action: 'the user enters credentials', expected: '' },
			{ action: 'the user is logged in', expected: 'Dashboard visible' }
		];

		const result = stepsToGherkinSteps(steps);
		expect(result).toHaveLength(3);
		expect(result[0].keyword).toBe('Given');
		expect(result[1].keyword).toBe('When');
		expect(result[2].keyword).toBe('Then');
		expect(result[2].expected).toBe('Dashboard visible');
	});

	it('detects existing keywords in action text', () => {
		const steps = [
			{ action: 'Given the user is logged in', expected: '' },
			{ action: 'When they navigate to settings', expected: '' },
			{ action: 'And they click save', expected: '' },
			{ action: 'Then changes are saved', expected: '' }
		];

		const result = stepsToGherkinSteps(steps);
		expect(result[0].keyword).toBe('Given');
		expect(result[0].text).toBe('the user is logged in');
		expect(result[1].keyword).toBe('When');
		expect(result[2].keyword).toBe('And');
		expect(result[3].keyword).toBe('Then');
	});

	it('handles single step', () => {
		const steps = [{ action: 'a condition', expected: '' }];
		const result = stepsToGherkinSteps(steps);
		expect(result[0].keyword).toBe('Given');
	});

	it('handles empty array', () => {
		expect(stepsToGherkinSteps([])).toEqual([]);
	});
});

describe('gherkinStepsToSteps', () => {
	it('converts GherkinStep array to action/expected format', () => {
		const gherkinSteps: GherkinStep[] = [
			{ keyword: 'Given', text: 'the user is logged in', expected: '' },
			{ keyword: 'When', text: 'they click a button', expected: '' },
			{ keyword: 'Then', text: 'something happens', expected: 'Expected result' }
		];

		const result = gherkinStepsToSteps(gherkinSteps);
		expect(result).toHaveLength(3);
		expect(result[0].action).toBe('Given the user is logged in');
		expect(result[2].expected).toBe('Expected result');
	});
});

describe('roundtrip', () => {
	it('parse -> toGherkin roundtrip preserves content', () => {
		const original = `Given the user is on the home page
When the user clicks the menu
And selects "Profile"
Then the profile page is displayed
But the edit button is hidden`;

		const steps = parseGherkin(original);
		const regenerated = stepsToGherkin(steps);
		const reparsed = parseGherkin(regenerated);

		expect(reparsed).toEqual(steps);
	});
});

describe('isValidKeyword', () => {
	it('returns true for valid keywords', () => {
		expect(isValidKeyword('Given')).toBe(true);
		expect(isValidKeyword('When')).toBe(true);
		expect(isValidKeyword('Then')).toBe(true);
		expect(isValidKeyword('And')).toBe(true);
		expect(isValidKeyword('But')).toBe(true);
	});

	it('returns false for invalid keywords', () => {
		expect(isValidKeyword('If')).toBe(false);
		expect(isValidKeyword('given')).toBe(false);
		expect(isValidKeyword('')).toBe(false);
	});
});

describe('KEYWORDS', () => {
	it('exports the list of valid keywords', () => {
		expect(KEYWORDS).toEqual(['Given', 'When', 'Then', 'And', 'But']);
	});
});
