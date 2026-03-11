/**
 * Shared test fixtures for API integration tests.
 */

export const testUser = {
	id: 'user-1',
	name: 'Test User',
	email: 'test@example.com',
	role: 'user',
	image: null,
	emailVerified: true,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
} as unknown as NonNullable<App.Locals['user']>;

export const adminUser = {
	id: 'admin-1',
	name: 'Admin User',
	email: 'admin@example.com',
	role: 'admin',
	image: null,
	emailVerified: true,
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
} as unknown as NonNullable<App.Locals['user']>;

export const sampleProject = {
	id: 1,
	name: 'Sample Project',
	description: 'A test project',
	active: true,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

export const sampleTestCase = {
	id: 10,
	projectId: 1,
	key: 'TC-0001',
	latestVersionId: 100,
	groupId: null,
	sortOrder: 1000,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

export const sampleTestCaseVersion = {
	id: 100,
	testCaseId: 10,
	versionNo: 1,
	title: 'Login should work',
	precondition: 'User exists',
	steps: [{ order: 1, action: 'Enter credentials', expected: 'Login success' }],
	expectedResult: 'Redirected to dashboard',
	priority: 'MEDIUM',
	revision: 1,
	updatedBy: 'user-1',
	createdAt: new Date('2025-01-01')
};

export const samplePriorityConfigs = [
	{ id: 1, projectId: 1, name: 'LOW', color: '#6b7280', position: 0, isDefault: false, createdBy: 'user-1', createdAt: new Date('2025-01-01') },
	{ id: 2, projectId: 1, name: 'MEDIUM', color: '#3b82f6', position: 1, isDefault: true, createdBy: 'user-1', createdAt: new Date('2025-01-01') },
	{ id: 3, projectId: 1, name: 'HIGH', color: '#f97316', position: 2, isDefault: false, createdBy: 'user-1', createdAt: new Date('2025-01-01') },
	{ id: 4, projectId: 1, name: 'CRITICAL', color: '#ef4444', position: 3, isDefault: false, createdBy: 'user-1', createdAt: new Date('2025-01-01') }
];

export const sampleTestRun = {
	id: 50,
	projectId: 1,
	name: 'Sprint 1 Run',
	environment: 'QA' as const,
	status: 'CREATED' as const,
	startedAt: null,
	finishedAt: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	retestOfRunId: null
};

export const sampleExecution = {
	id: 200,
	testRunId: 50,
	testCaseVersionId: 100,
	status: 'PENDING' as const,
	comment: null,
	executedBy: null,
	executedAt: null,
	startedAt: null,
	completedAt: null
};

export const sampleRelease = {
	id: 300,
	projectId: 1,
	name: 'v1.0.0',
	version: '1.0.0',
	description: 'First release',
	status: 'PLANNING' as const,
	targetDate: null,
	releaseDate: null,
	createdBy: 'user-1',
	createdAt: new Date('2025-01-01'),
	updatedAt: new Date('2025-01-01')
};
