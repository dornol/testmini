import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult, mockInsertReturning } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRegisterJob = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	reportSchedule: {
		id: 'id',
		projectId: 'project_id',
		name: 'name',
		cronExpression: 'cron_expression',
		recipientEmails: 'recipient_emails',
		reportRange: 'report_range',
		enabled: 'enabled',
		lastSentAt: 'last_sent_at',
		createdBy: 'created_by',
		createdAt: 'created_at'
	}
}));
vi.mock('drizzle-orm', () => ({
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	and: vi.fn((...args: unknown[]) => args),
	desc: vi.fn((a: unknown) => a),
	sql: vi.fn(),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn()
}));
vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectAccess: vi.fn().mockResolvedValue({ role: 'QA' }),
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'PROJECT_ADMIN' })
	};
});
vi.mock('node-cron', () => ({
	default: {
		validate: vi.fn().mockReturnValue(true)
	}
}));
vi.mock('$lib/server/report-scheduler', () => ({
	registerJob: mockRegisterJob
}));

const { GET, POST } = await import('./+server');

const PARAMS = { projectId: '1' };

const sampleSchedule = {
	id: 1,
	projectId: 1,
	name: 'Daily Report',
	cronExpression: '0 9 * * *',
	recipientEmails: ['test@example.com'],
	reportRange: 'last_7_days',
	enabled: true,
	lastSentAt: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

describe('/api/projects/[projectId]/reports/schedules', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('GET', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
			await expect(GET(event)).rejects.toThrow();
		});

		it('should return list of schedules', async () => {
			mockSelectResult(mockDb, [sampleSchedule]);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toHaveLength(1);
			expect(body[0].id).toBe(sampleSchedule.id);
			expect(body[0].name).toBe(sampleSchedule.name);
			expect(body[0].cronExpression).toBe(sampleSchedule.cronExpression);
		});

		it('should return empty array when no schedules', async () => {
			mockSelectResult(mockDb, []);

			const event = createMockEvent({
				method: 'GET',
				params: PARAMS,
				user: testUser
			});

			const response = await GET(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body).toEqual([]);
		});
	});

	describe('POST', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: null,
				body: { name: 'Schedule', cronExpression: '0 9 * * *', recipientEmails: ['a@b.com'] }
			});
			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject empty name', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: '', cronExpression: '0 9 * * *', recipientEmails: ['a@b.com'] }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject missing cronExpression', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Report', cronExpression: '', recipientEmails: ['a@b.com'] }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject invalid cron expression', async () => {
			const { default: cron } = await import('node-cron');
			(cron.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Report', cronExpression: 'invalid', recipientEmails: ['a@b.com'] }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should reject empty recipientEmails', async () => {
			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: { name: 'Report', cronExpression: '0 9 * * *', recipientEmails: [] }
			});

			await expect(POST(event)).rejects.toThrow();
		});

		it('should create schedule and return 201', async () => {
			mockInsertReturning(mockDb, [sampleSchedule]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					name: 'Daily Report',
					cronExpression: '0 9 * * *',
					recipientEmails: ['test@example.com']
				}
			});

			const response = await POST(event);
			expect(response.status).toBe(201);

			const body = await response.json();
			expect(body.name).toBe('Daily Report');
		});

		it('should register job when schedule is enabled', async () => {
			mockInsertReturning(mockDb, [sampleSchedule]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					name: 'Daily Report',
					cronExpression: '0 9 * * *',
					recipientEmails: ['test@example.com'],
					enabled: true
				}
			});

			await POST(event);

			expect(mockRegisterJob).toHaveBeenCalledWith(sampleSchedule);
		});

		it('should not register job when schedule is disabled', async () => {
			const disabledSchedule = { ...sampleSchedule, enabled: false };
			mockInsertReturning(mockDb, [disabledSchedule]);

			const event = createMockEvent({
				method: 'POST',
				params: PARAMS,
				user: testUser,
				body: {
					name: 'Daily Report',
					cronExpression: '0 9 * * *',
					recipientEmails: ['test@example.com'],
					enabled: false
				}
			});

			await POST(event);

			expect(mockRegisterJob).not.toHaveBeenCalled();
		});
	});
});
