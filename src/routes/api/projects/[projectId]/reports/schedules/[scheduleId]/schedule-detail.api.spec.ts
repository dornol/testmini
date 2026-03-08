import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockRegisterJob = vi.fn();
const mockRemoveJob = vi.fn();

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
	registerJob: mockRegisterJob,
	removeJob: mockRemoveJob
}));

const { PATCH, DELETE } = await import('./+server');

const PARAMS = { projectId: '1', scheduleId: '5' };

const sampleSchedule = {
	id: 5,
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

describe('/api/projects/[projectId]/reports/schedules/[scheduleId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('PATCH', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: null,
				body: { name: 'Updated' }
			});
			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject invalid scheduleId', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: { projectId: '1', scheduleId: 'abc' },
				user: testUser,
				body: { name: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject invalid cron expression', async () => {
			const { default: cron } = await import('node-cron');
			(cron.validate as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { cronExpression: 'bad-cron' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should reject empty updates', async () => {
			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: {}
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should return 404 when schedule not found', async () => {
			const chain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
			};
			mockDb.update.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Updated' }
			});

			await expect(PATCH(event)).rejects.toThrow();
		});

		it('should update schedule and return updated data', async () => {
			const updatedSchedule = { ...sampleSchedule, name: 'Updated Report' };
			const chain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) =>
					Promise.resolve([updatedSchedule]).then(resolve)
			};
			mockDb.update.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { name: 'Updated Report' }
			});

			const response = await PATCH(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.name).toBe('Updated Report');
		});

		it('should re-register job when updated schedule is enabled', async () => {
			const updatedSchedule = { ...sampleSchedule, enabled: true };
			const chain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) =>
					Promise.resolve([updatedSchedule]).then(resolve)
			};
			mockDb.update.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { enabled: true }
			});

			await PATCH(event);

			expect(mockRegisterJob).toHaveBeenCalledWith(updatedSchedule);
			expect(mockRemoveJob).not.toHaveBeenCalled();
		});

		it('should remove job when updated schedule is disabled', async () => {
			const updatedSchedule = { ...sampleSchedule, enabled: false };
			const chain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) =>
					Promise.resolve([updatedSchedule]).then(resolve)
			};
			mockDb.update.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'PATCH',
				params: PARAMS,
				user: testUser,
				body: { enabled: false }
			});

			await PATCH(event);

			expect(mockRemoveJob).toHaveBeenCalledWith(5);
			expect(mockRegisterJob).not.toHaveBeenCalled();
		});
	});

	describe('DELETE', () => {
		it('should return 401 when not authenticated', async () => {
			const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should reject invalid scheduleId', async () => {
			const event = createMockEvent({
				method: 'DELETE',
				params: { projectId: '1', scheduleId: 'abc' },
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should return 404 when schedule not found', async () => {
			const chain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve)
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			await expect(DELETE(event)).rejects.toThrow();
		});

		it('should delete schedule, remove job, and return success', async () => {
			const chain = {
				where: vi.fn().mockReturnThis(),
				returning: vi.fn().mockReturnThis(),
				then: (resolve: (v: unknown) => void) =>
					Promise.resolve([sampleSchedule]).then(resolve)
			};
			mockDb.delete.mockReturnValue(chain as never);

			const event = createMockEvent({
				method: 'DELETE',
				params: PARAMS,
				user: testUser
			});

			const response = await DELETE(event);
			expect(response.status).toBe(200);

			const body = await response.json();
			expect(body.success).toBe(true);
			expect(mockRemoveJob).toHaveBeenCalledWith(5);
		});
	});
});
