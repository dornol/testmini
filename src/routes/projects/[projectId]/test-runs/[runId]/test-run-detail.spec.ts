import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, mockSelectResult } from '$lib/server/test-helpers/mock-db';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, sampleTestRun, sampleExecution } from '$lib/server/test-helpers/fixtures';

const mockDb = createMockDb();
const mockPublish = vi.fn();
const mockCreateNotification = vi.fn();

vi.mock('$lib/server/db', () => ({ db: mockDb }));
vi.mock('$lib/server/db/schema', () => ({
	testRun: { id: 'id', projectId: 'project_id', status: 'status' },
	testExecution: {
		id: 'id',
		testRunId: 'test_run_id',
		testCaseVersionId: 'test_case_version_id',
		status: 'status',
		executedBy: 'executed_by',
		executedAt: 'executed_at',
		startedAt: 'started_at',
		completedAt: 'completed_at',
		comment: 'comment'
	},
	testCaseVersion: { id: 'id', testCaseId: 'test_case_id', title: 'title', priority: 'priority', versionNo: 'version_no' },
	testCase: { id: 'id', key: 'key' },
	testFailureDetail: { id: 'id', testExecutionId: 'test_execution_id', createdAt: 'created_at', createdBy: 'created_by', failureEnvironment: 'failure_environment', testMethod: 'test_method', errorMessage: 'error_message', stackTrace: 'stack_trace', comment: 'comment' },
	projectMember: { userId: 'user_id', projectId: 'project_id' },
	user: { id: 'id', name: 'name' }
}));
vi.mock('drizzle-orm', () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((a: unknown, b: unknown) => [a, b]),
	inArray: vi.fn((a: unknown, b: unknown) => [a, b]),
	count: vi.fn(() => 'count'),
	sql: Object.assign(
		(strings: TemplateStringsArray, ...values: unknown[]) => ({
			as: () => ({ sql: strings, values })
		}),
		{ raw: (s: string) => s }
	)
}));
vi.mock('$lib/server/auth-utils', () => ({
	requireAuth: vi.fn().mockReturnValue(testUser),
	requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
}));
vi.mock('$lib/server/redis', () => ({
	publish: (...args: unknown[]) => mockPublish(...args)
}));
vi.mock('$lib/server/notifications', () => ({
	createNotification: (...args: unknown[]) => mockCreateNotification(...args)
}));
vi.mock('$lib/schemas/failure.schema', () => ({
	createFailureSchema: {
		safeParse: vi.fn().mockReturnValue({
			success: true,
			data: {
				failureEnvironment: 'Chrome',
				testMethod: 'testLogin',
				errorMessage: 'assertion failed',
				stackTrace: 'at line 42',
				comment: 'needs fix'
			}
		})
	}
}));

const { load, actions } = await import('./+page.server');
const authUtils = await import('$lib/server/auth-utils');

const PARAMS = { projectId: '1', runId: '50' };

function createFormData(data: Record<string, string | string[]>): FormData {
	const fd = new FormData();
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value)) {
			for (const v of value) fd.append(key, v);
		} else {
			fd.append(key, value);
		}
	}
	return fd;
}

function createActionEvent(formData: FormData) {
	return createMockEvent({
		method: 'POST',
		params: PARAMS,
		formData,
		user: testUser
	});
}

describe('/projects/[projectId]/test-runs/[runId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireAuth).mockReturnValue(testUser);
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
		mockPublish.mockResolvedValue(undefined);
	});

	// ─── Load ─────────────────────────────────────────────────────

	describe('load', () => {
		function createLoadEvent(opts: { searchParams?: Record<string, string> } = {}) {
			const event = createMockEvent({
				params: PARAMS,
				searchParams: opts.searchParams
			});
			(event as Record<string, unknown>).parent = vi.fn().mockResolvedValue({ userRole: 'QA' });
			return event;
		}

		it('should return 400 for invalid run ID', async () => {
			const event = createLoadEvent();
			(event as Record<string, unknown>).params = { projectId: '1', runId: 'abc' };
			await expect(load(event as never)).rejects.toThrow();
		});

		it('should return 404 when run not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(null);
			const event = createLoadEvent();
			await expect(load(event as never)).rejects.toThrow();
		});

		it('should return run data with stats and executions', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			// Stats query returns grouped status counts
			const statsChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValue([
					{ status: 'PASS', cnt: 3 },
					{ status: 'FAIL', cnt: 1 },
					{ status: 'PENDING', cnt: 6 }
				])
			};

			// Executions query returns execution list
			const execChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockResolvedValue([
					{
						id: 200,
						status: 'PASS',
						comment: null,
						executedBy: 'Test User',
						executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:05:00'),
						testCaseKey: 'TC-0001',
						testCaseTitle: 'Login test',
						testCasePriority: 'HIGH',
						versionNo: 1
					}
				])
			};

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return statsChain as never;
				return execChain as never;
			});

			const event = createLoadEvent();
			const result = await load(event as never) as Record<string, any>;

			expect(result.run).toEqual(sampleTestRun);
			expect(result.stats.total).toBe(10);
			expect(result.stats.pass).toBe(3);
			expect(result.stats.fail).toBe(1);
			expect(result.stats.pending).toBe(6);
			expect(result.executions).toHaveLength(1);
			expect(result.executions[0].startedAt).toBeDefined();
			expect(result.executions[0].completedAt).toBeDefined();
			expect(result.currentUserId).toBe(testUser.id);
		});

		// ─── durationSummary ─────────────────────────────────────

		it('should compute durationSummary for completed executions', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const statsChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValue([{ status: 'PASS', cnt: 3 }])
			};

			const execChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockResolvedValue([
					{
						id: 200, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:01:00'), // 60s
						testCaseKey: 'TC-0001', testCaseTitle: 'A', testCasePriority: 'HIGH', versionNo: 1
					},
					{
						id: 201, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:03:00'), // 180s
						testCaseKey: 'TC-0002', testCaseTitle: 'B', testCasePriority: 'MEDIUM', versionNo: 1
					},
					{
						id: 202, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:00:30'), // 30s
						testCaseKey: 'TC-0003', testCaseTitle: 'C', testCasePriority: 'LOW', versionNo: 1
					}
				])
			};

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return statsChain as never;
				return execChain as never;
			});

			const event = createLoadEvent();
			const result = await load(event as never) as Record<string, any>;

			expect(result.durationSummary).toBeDefined();
			expect(result.durationSummary.completedCount).toBe(3);
			expect(result.durationSummary.totalDuration).toBe(270000); // 60+180+30 = 270s
			expect(result.durationSummary.avgDuration).toBe(90000); // 270/3 = 90s
			expect(result.durationSummary.minDuration).toBe(30000); // 30s
			expect(result.durationSummary.maxDuration).toBe(180000); // 180s
		});

		it('should return zero durationSummary when no executions have timestamps', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const statsChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValue([{ status: 'PENDING', cnt: 2 }])
			};

			const execChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockResolvedValue([
					{
						id: 200, status: 'PENDING', comment: null,
						executedBy: null, executedAt: null,
						startedAt: null, completedAt: null,
						testCaseKey: 'TC-0001', testCaseTitle: 'A', testCasePriority: 'HIGH', versionNo: 1
					},
					{
						id: 201, status: 'PENDING', comment: null,
						executedBy: null, executedAt: null,
						startedAt: null, completedAt: null,
						testCaseKey: 'TC-0002', testCaseTitle: 'B', testCasePriority: 'MEDIUM', versionNo: 1
					}
				])
			};

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return statsChain as never;
				return execChain as never;
			});

			const event = createLoadEvent();
			const result = await load(event as never) as Record<string, any>;

			expect(result.durationSummary.completedCount).toBe(0);
			expect(result.durationSummary.totalDuration).toBe(0);
			expect(result.durationSummary.avgDuration).toBe(0);
			expect(result.durationSummary.minDuration).toBe(0);
			expect(result.durationSummary.maxDuration).toBe(0);
		});

		it('should only count executions with both startedAt and completedAt in durationSummary', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const statsChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValue([{ status: 'PASS', cnt: 2 }, { status: 'PENDING', cnt: 1 }])
			};

			const execChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockResolvedValue([
					{
						id: 200, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:02:00'), // 120s — counted
						testCaseKey: 'TC-0001', testCaseTitle: 'A', testCasePriority: 'HIGH', versionNo: 1
					},
					{
						id: 201, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: null, // started but not completed — skipped
						testCaseKey: 'TC-0002', testCaseTitle: 'B', testCasePriority: 'MEDIUM', versionNo: 1
					},
					{
						id: 202, status: 'PENDING', comment: null,
						executedBy: null, executedAt: null,
						startedAt: null, completedAt: null, // not started — skipped
						testCaseKey: 'TC-0003', testCaseTitle: 'C', testCasePriority: 'LOW', versionNo: 1
					}
				])
			};

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return statsChain as never;
				return execChain as never;
			});

			const event = createLoadEvent();
			const result = await load(event as never) as Record<string, any>;

			expect(result.durationSummary.completedCount).toBe(1);
			expect(result.durationSummary.totalDuration).toBe(120000);
			expect(result.durationSummary.avgDuration).toBe(120000);
			expect(result.durationSummary.minDuration).toBe(120000);
			expect(result.durationSummary.maxDuration).toBe(120000);
		});

		it('should handle single execution durationSummary correctly', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const statsChain = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				groupBy: vi.fn().mockResolvedValue([{ status: 'PASS', cnt: 1 }])
			};

			const execChain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockResolvedValue([
					{
						id: 200, status: 'PASS', comment: null,
						executedBy: 'User', executedAt: new Date(),
						startedAt: new Date('2025-01-01T10:00:00'),
						completedAt: new Date('2025-01-01T10:00:05'), // 5s
						testCaseKey: 'TC-0001', testCaseTitle: 'Quick test', testCasePriority: 'HIGH', versionNo: 1
					}
				])
			};

			let selectCall = 0;
			mockDb.select.mockImplementation(() => {
				selectCall++;
				if (selectCall === 1) return statsChain as never;
				return execChain as never;
			});

			const event = createLoadEvent();
			const result = await load(event as never) as Record<string, any>;

			expect(result.durationSummary.completedCount).toBe(1);
			expect(result.durationSummary.totalDuration).toBe(5000);
			expect(result.durationSummary.avgDuration).toBe(5000);
			expect(result.durationSummary.minDuration).toBe(5000);
			expect(result.durationSummary.maxDuration).toBe(5000);
		});
	});

	// ─── updateStatus ─────────────────────────────────────────────

	describe('actions.updateStatus', () => {
		it('should return 400 for invalid status', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'INVALID' })
			);
			const result = await actions.updateStatus(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should return 400 for missing executionId', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const event = createActionEvent(
				createFormData({ executionId: '', status: 'PASS' })
			);
			const result = await actions.updateStatus(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should return 404 when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'PASS' })
			);
			const result = await actions.updateStatus(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 404 }));
		});

		it('should return 403 when run is COMPLETED', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({
				...sampleTestRun,
				status: 'COMPLETED'
			});

			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'PASS' })
			);
			const result = await actions.updateStatus(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 403 }));
		});

		it('should set startedAt when transitioning from PENDING', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue({ ...sampleExecution, status: 'PENDING' })
			};

			const setCalls: unknown[] = [];
			const updateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return updateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'PASS' })
			);
			await actions.updateStatus(event as never);

			// First update call is the execution update
			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('PASS');
			expect(updateData.startedAt).toBeInstanceOf(Date);
			expect(updateData.completedAt).toBeInstanceOf(Date);
			expect(updateData.executedBy).toBe(testUser.id);
			expect(updateData.executedAt).toBeInstanceOf(Date);
		});

		it('should NOT set startedAt when execution was already started (not PENDING)', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const startedExecution = {
				...sampleExecution,
				status: 'FAIL',
				startedAt: new Date('2025-01-01T10:00:00')
			};
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue(startedExecution)
			};

			const setCalls: unknown[] = [];
			const updateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return updateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'PASS' })
			);
			await actions.updateStatus(event as never);

			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('PASS');
			expect(updateData.completedAt).toBeInstanceOf(Date);
			// startedAt should NOT be in the update since execution was not PENDING
			expect(updateData).not.toHaveProperty('startedAt');
		});

		it('should publish SSE event on status update', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue(sampleExecution)
			};

			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ executionId: '200', status: 'PASS' })
			);
			const result = await actions.updateStatus(event as never);
			expect(result).toEqual({ success: true });
			expect(mockPublish).toHaveBeenCalledWith('run:50:events', expect.objectContaining({
				type: 'execution:updated',
				executionId: 200,
				status: 'PASS'
			}));
		});
	});

	// ─── failWithDetail ───────────────────────────────────────────

	describe('actions.failWithDetail', () => {
		it('should return 400 for missing executionId', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const event = createActionEvent(
				createFormData({ executionId: '' })
			);
			const result = await actions.failWithDetail(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should return 404 when execution not found', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue(null)
			};

			const event = createActionEvent(
				createFormData({
					executionId: '200',
					failureEnvironment: 'Chrome',
					testMethod: 'testLogin',
					errorMessage: 'failed',
					stackTrace: '',
					comment: ''
				})
			);
			const result = await actions.failWithDetail(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 404 }));
		});

		it('should set startedAt+completedAt when transitioning from PENDING', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue({ ...sampleExecution, status: 'PENDING' })
			};

			const setCalls: unknown[] = [];
			const txUpdateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return txUpdateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			const txInsertChain = {
				values: vi.fn().mockResolvedValue(undefined)
			};

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				return fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				});
			});

			// Also mock the autoUpdateRunStatus call
			const mainUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(mainUpdateChain as never);

			const event = createActionEvent(
				createFormData({
					executionId: '200',
					failureEnvironment: 'Chrome',
					testMethod: 'testLogin',
					errorMessage: 'assertion failed',
					stackTrace: 'at line 42',
					comment: 'needs fix'
				})
			);
			const result = await actions.failWithDetail(event as never);
			expect(result).toEqual({ success: true });

			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('FAIL');
			expect(updateData.startedAt).toBeInstanceOf(Date);
			expect(updateData.completedAt).toBeInstanceOf(Date);
		});

		it('should NOT set startedAt when already started', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue({
					...sampleExecution,
					status: 'BLOCKED',
					startedAt: new Date('2025-01-01T10:00:00')
				})
			};

			const setCalls: unknown[] = [];
			const txUpdateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return txUpdateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			const txInsertChain = {
				values: vi.fn().mockResolvedValue(undefined)
			};

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				return fn({
					update: vi.fn().mockReturnValue(txUpdateChain),
					insert: vi.fn().mockReturnValue(txInsertChain)
				});
			});

			const mainUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(mainUpdateChain as never);

			const event = createActionEvent(
				createFormData({
					executionId: '200',
					failureEnvironment: 'Chrome',
					testMethod: 'testLogin',
					errorMessage: 'assertion failed',
					stackTrace: '',
					comment: ''
				})
			);
			await actions.failWithDetail(event as never);

			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('FAIL');
			expect(updateData.completedAt).toBeInstanceOf(Date);
			expect(updateData).not.toHaveProperty('startedAt');
		});

		it('should publish both execution:updated and failure:added events', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			(mockDb.query as Record<string, { findFirst: ReturnType<typeof vi.fn> }>).testExecution = {
				findFirst: vi.fn().mockResolvedValue(sampleExecution)
			};

			mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
				const chain = {
					set: vi.fn().mockReturnThis(),
					where: vi.fn().mockResolvedValue(undefined),
					values: vi.fn().mockResolvedValue(undefined)
				};
				return fn({
					update: vi.fn().mockReturnValue(chain),
					insert: vi.fn().mockReturnValue(chain)
				});
			});

			const mainUpdateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(mainUpdateChain as never);

			const event = createActionEvent(
				createFormData({
					executionId: '200',
					failureEnvironment: '',
					testMethod: '',
					errorMessage: 'error',
					stackTrace: '',
					comment: ''
				})
			);
			await actions.failWithDetail(event as never);

			expect(mockPublish).toHaveBeenCalledWith('run:50:events', expect.objectContaining({
				type: 'execution:updated',
				status: 'FAIL'
			}));
			expect(mockPublish).toHaveBeenCalledWith('run:50:events', expect.objectContaining({
				type: 'failure:added',
				executionId: 200
			}));
		});
	});

	// ─── bulkPass ─────────────────────────────────────────────────

	describe('actions.bulkPass', () => {
		it('should return 400 for empty executionIds', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const event = createActionEvent(createFormData({}));
			const result = await actions.bulkPass(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should return 403 when run is COMPLETED', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue({
				...sampleTestRun,
				status: 'COMPLETED'
			});
			const event = createActionEvent(
				createFormData({ executionIds: ['200', '201'] })
			);
			const result = await actions.bulkPass(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 403 }));
		});

		it('should set startedAt and completedAt on bulk pass', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);

			const setCalls: unknown[] = [];
			const updateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return updateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ executionIds: ['200', '201', '202'] })
			);
			const result = await actions.bulkPass(event as never);
			expect(result).toEqual({ success: true });

			// First update call is the bulk pass
			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('PASS');
			expect(updateData.startedAt).toBeInstanceOf(Date);
			expect(updateData.completedAt).toBeInstanceOf(Date);
			expect(updateData.executedBy).toBe(testUser.id);
		});

		it('should publish bulk_updated SSE event', async () => {
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ executionIds: ['200', '201'] })
			);
			await actions.bulkPass(event as never);

			expect(mockPublish).toHaveBeenCalledWith('run:50:events', expect.objectContaining({
				type: 'executions:bulk_updated',
				status: 'PASS',
				executionIds: [200, 201]
			}));
		});
	});

	// ─── updateRunStatus ──────────────────────────────────────────

	describe('actions.updateRunStatus', () => {
		it('should return 400 for invalid run status', async () => {
			const event = createActionEvent(
				createFormData({ status: 'INVALID' })
			);
			const result = await actions.updateRunStatus(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should set startedAt when transitioning to IN_PROGRESS', async () => {
			const setCalls: unknown[] = [];
			const updateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return updateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ status: 'IN_PROGRESS' })
			);
			const result = await actions.updateRunStatus(event as never);
			expect(result).toEqual({ success: true });

			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('IN_PROGRESS');
			expect(updateData.startedAt).toBeInstanceOf(Date);
		});

		it('should set finishedAt when transitioning to COMPLETED', async () => {
			const setCalls: unknown[] = [];
			const updateChain = {
				set: vi.fn().mockImplementation((data: unknown) => {
					setCalls.push(data);
					return updateChain;
				}),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			// Mock for notification queries
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockSelectResult(mockDb, [{ userId: 'user-2' }]);

			const event = createActionEvent(
				createFormData({ status: 'COMPLETED' })
			);
			const result = await actions.updateRunStatus(event as never);
			expect(result).toEqual({ success: true });

			const updateData = setCalls[0] as Record<string, unknown>;
			expect(updateData.status).toBe('COMPLETED');
			expect(updateData.finishedAt).toBeInstanceOf(Date);
		});

		it('should notify project members on completion', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			mockSelectResult(mockDb, [{ userId: 'user-2' }, { userId: 'user-3' }]);

			const event = createActionEvent(
				createFormData({ status: 'COMPLETED' })
			);
			await actions.updateRunStatus(event as never);

			// Should notify user-2 and user-3 but not current user (user-1)
			expect(mockCreateNotification).toHaveBeenCalledTimes(2);
			expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
				userId: 'user-2',
				type: 'TEST_RUN_COMPLETED'
			}));
			expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
				userId: 'user-3',
				type: 'TEST_RUN_COMPLETED'
			}));
		});

		it('should NOT notify current user on completion', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);
			mockDb.query.testRun.findFirst.mockResolvedValue(sampleTestRun);
			// Only current user is a member
			mockSelectResult(mockDb, [{ userId: testUser.id }]);

			const event = createActionEvent(
				createFormData({ status: 'COMPLETED' })
			);
			await actions.updateRunStatus(event as never);

			expect(mockCreateNotification).not.toHaveBeenCalled();
		});

		it('should publish run:status_changed SSE event', async () => {
			const updateChain = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.update.mockReturnValue(updateChain as never);

			const event = createActionEvent(
				createFormData({ status: 'IN_PROGRESS' })
			);
			await actions.updateRunStatus(event as never);

			expect(mockPublish).toHaveBeenCalledWith('run:50:events', expect.objectContaining({
				type: 'run:status_changed',
				runId: 50,
				status: 'IN_PROGRESS'
			}));
		});
	});

	// ─── deleteFailure ────────────────────────────────────────────

	describe('actions.deleteFailure', () => {
		it('should return 400 for missing failureId', async () => {
			const event = createActionEvent(createFormData({ failureId: '' }));
			const result = await actions.deleteFailure(event as never);
			expect(result).toEqual(expect.objectContaining({ status: 400 }));
		});

		it('should delete failure and return success', async () => {
			const deleteChain = {
				where: vi.fn().mockResolvedValue(undefined)
			};
			mockDb.delete.mockReturnValue(deleteChain as never);

			const event = createActionEvent(createFormData({ failureId: '5' }));
			const result = await actions.deleteFailure(event as never);
			expect(result).toEqual({ success: true });
			expect(mockDb.delete).toHaveBeenCalled();
		});
	});
});
