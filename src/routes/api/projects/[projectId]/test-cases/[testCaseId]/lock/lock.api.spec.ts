import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockEvent } from '$lib/server/test-helpers/mock-event';
import { testUser, adminUser } from '$lib/server/test-helpers/fixtures';

// ---------------------------------------------------------------------------
// Mock lock utilities before importing the route handler
// ---------------------------------------------------------------------------

const mockAcquireLock = vi.fn();
const mockReleaseLock = vi.fn();
const mockRefreshLock = vi.fn();
const mockGetLockInfo = vi.fn();

vi.mock('$lib/server/lock', () => ({
	acquireLock: mockAcquireLock,
	releaseLock: mockReleaseLock,
	refreshLock: mockRefreshLock,
	getLockInfo: mockGetLockInfo
}));

vi.mock('$lib/server/auth-utils', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/auth-utils')>(
		'$lib/server/auth-utils'
	);
	return {
		...actual,
		requireProjectRole: vi.fn().mockResolvedValue({ role: 'QA' })
	};
});

const { GET, POST, PUT, DELETE } = await import('./+server');
const authUtils = await import('$lib/server/auth-utils');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PARAMS = { projectId: '1', testCaseId: '10' };

const holderInfo = {
	userId: 'user-2',
	userName: 'Bob',
	acquiredAt: '2026-01-01T00:00:00.000Z'
};

// ---------------------------------------------------------------------------
// GET — read current lock state
// ---------------------------------------------------------------------------

describe('GET /lock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: null });
		await expect(GET(event)).rejects.toThrow();
	});

	it('should return locked:false when no lock exists', async () => {
		mockGetLockInfo.mockResolvedValue(null);
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });

		const response = await GET(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.locked).toBe(false);
		expect(body.holder).toBeNull();
	});

	it('should return locked:true with holder info when lock exists', async () => {
		mockGetLockInfo.mockResolvedValue(holderInfo);
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });

		const response = await GET(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.locked).toBe(true);
		expect(body.holder).toEqual(holderInfo);
	});

	it('should pass the numeric testCaseId to getLockInfo', async () => {
		mockGetLockInfo.mockResolvedValue(null);
		const event = createMockEvent({ method: 'GET', params: PARAMS, user: testUser });

		await GET(event);

		expect(mockGetLockInfo).toHaveBeenCalledWith(10);
	});
});

// ---------------------------------------------------------------------------
// POST — acquire lock
// ---------------------------------------------------------------------------

describe('POST /lock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: null });
		await expect(POST(event)).rejects.toThrow();
	});

	it('should return acquired:true when lock is successfully acquired', async () => {
		mockAcquireLock.mockResolvedValue({ acquired: true });
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });

		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.acquired).toBe(true);
	});

	it('should call acquireLock with the authenticated user id and name', async () => {
		mockAcquireLock.mockResolvedValue({ acquired: true });
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });

		await POST(event);

		expect(mockAcquireLock).toHaveBeenCalledWith(10, testUser.id, testUser.name);
	});

	it('should return 409 with holder info when locked by another user', async () => {
		mockAcquireLock.mockResolvedValue({ acquired: false, holder: holderInfo });
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });

		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.acquired).toBe(false);
		expect(body.holder).toEqual(holderInfo);
	});

	it('should return 403 when user lacks required project role', async () => {
		vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
			Object.assign(new Error('Forbidden'), { status: 403 })
		);
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: testUser });

		await expect(POST(event)).rejects.toThrow();
	});

	it('should allow admin user to acquire a lock', async () => {
		mockAcquireLock.mockResolvedValue({ acquired: true });
		const event = createMockEvent({ method: 'POST', params: PARAMS, user: adminUser });

		const response = await POST(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.acquired).toBe(true);
		expect(mockAcquireLock).toHaveBeenCalledWith(10, adminUser.id, adminUser.name);
	});
});

// ---------------------------------------------------------------------------
// PUT — refresh (extend TTL of) existing lock
// ---------------------------------------------------------------------------

describe('PUT /lock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'PUT', params: PARAMS, user: null });
		await expect(PUT(event)).rejects.toThrow();
	});

	it('should return refreshed:true when lock belongs to the caller', async () => {
		mockRefreshLock.mockResolvedValue(true);
		const event = createMockEvent({ method: 'PUT', params: PARAMS, user: testUser });

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.refreshed).toBe(true);
	});

	it('should call refreshLock with the authenticated user id', async () => {
		mockRefreshLock.mockResolvedValue(true);
		const event = createMockEvent({ method: 'PUT', params: PARAMS, user: testUser });

		await PUT(event);

		expect(mockRefreshLock).toHaveBeenCalledWith(10, testUser.id);
	});

	it('should return 409 when lock does not belong to the caller or does not exist', async () => {
		mockRefreshLock.mockResolvedValue(false);
		const event = createMockEvent({ method: 'PUT', params: PARAMS, user: testUser });

		const response = await PUT(event);
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.refreshed).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// DELETE — release lock
// ---------------------------------------------------------------------------

describe('DELETE /lock', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(authUtils.requireProjectRole).mockResolvedValue({ role: 'QA' });
	});

	it('should return 401 when not authenticated', async () => {
		const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: null });
		await expect(DELETE(event)).rejects.toThrow();
	});

	it('should release the lock for the authenticated user and return released:true', async () => {
		mockReleaseLock.mockResolvedValue(true);
		const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

		const response = await DELETE(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.released).toBe(true);
	});

	it('should call releaseLock with the authenticated user id', async () => {
		mockReleaseLock.mockResolvedValue(true);
		const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

		await DELETE(event);

		expect(mockReleaseLock).toHaveBeenCalledWith(10, testUser.id);
	});

	it('should still return released:true even if the lock was held by another user (route always returns released)', async () => {
		// The route handler does not inspect the return value of releaseLock —
		// it always responds with { released: true }.  This documents that
		// authorisation enforcement lives in releaseLock itself, not the route.
		mockReleaseLock.mockResolvedValue(false);
		const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

		const response = await DELETE(event);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.released).toBe(true);
	});

	it('should not release a lock when user lacks required project role', async () => {
		vi.mocked(authUtils.requireProjectRole).mockRejectedValue(
			Object.assign(new Error('Forbidden'), { status: 403 })
		);
		const event = createMockEvent({ method: 'DELETE', params: PARAMS, user: testUser });

		await expect(DELETE(event)).rejects.toThrow();
		expect(mockReleaseLock).not.toHaveBeenCalled();
	});
});
