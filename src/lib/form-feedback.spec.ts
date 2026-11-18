import { describe, expect, it, beforeEach } from 'vitest';
import { setLocale } from '$lib/paraglide/runtime.js';
import { createTestPlanSchema } from '$lib/schemas/test-plan.schema';
import { createTestRunSchema } from '$lib/schemas/test-run.schema';
import { createCrossEnvRunSchema } from '$lib/schemas/cross-env-run.schema';
import { workflowFormFeedback, feedbackFor } from './form-feedback';

describe('workflow form feedback', () => {
	beforeEach(() => setLocale('ko', { reload: false }));
	it('links required run fields to actionable localized feedback', () => {
		const parsed = createTestRunSchema.safeParse({ name: ' ', environment: '', testCaseIds: [] });
		if (parsed.success) throw new Error('Invalid fixture passed');
		const errors = workflowFormFeedback(parsed.error.issues);
		expect(feedbackFor(errors, 'name')).toBe('이름을 입력해 주세요.');
		expect(feedbackFor(errors, 'testCaseIds')).toContain('선택');
		expect(feedbackFor(errors, 'environment')).toContain('환경');
		expect(feedbackFor(errors, 'missing')).toBe('');
	});
	it('distinguishes array selection limits from character limits', () => {
		const parsed = createCrossEnvRunSchema.safeParse({
			name: 'a'.repeat(201),
			testCaseIds: Array.from({ length: 501 }, (_, i) => i + 1),
			environments: Array.from({ length: 21 }, (_, i) => `ENV${i}`)
		});
		if (parsed.success) throw new Error('Invalid fixture passed');
		const errors = workflowFormFeedback(parsed.error.issues);
		expect(feedbackFor(errors, 'name')).toContain('200');
		expect(feedbackFor(errors, 'testCaseIds')).toContain('500');
		expect(feedbackFor(errors, 'environments')).toContain('20');
		expect(feedbackFor(errors, 'environments')).not.toContain('글자');
	});
	it('attaches date ordering feedback to the end date and switches language', () => {
		const parsed = createTestPlanSchema.safeParse({
			name: 'Plan',
			startDate: '2026-11-20',
			endDate: '2026-11-19'
		});
		if (parsed.success) throw new Error('Invalid fixture passed');
		expect(feedbackFor(workflowFormFeedback(parsed.error.issues), 'endDate')).toContain('시작');
		setLocale('en', { reload: false });
		expect(feedbackFor(workflowFormFeedback(parsed.error.issues), 'endDate')).toContain('start');
	});
});
