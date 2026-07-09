import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { savedFilter } from '$lib/server/db/schema';
import { ok, err, requireProjectCreator, mcpPositiveIdSchema } from '../helpers';
import { eq, and } from 'drizzle-orm';

const MAX_FILTER_NAME_LENGTH = 100;
const MAX_FILTER_JSON_LENGTH = 20_000;
const ALLOWED_FILTER_TYPES = ['test_cases', 'test_runs'] as const;
const UNSAFE_FILTER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function validateFilterName(value: string): string | ReturnType<typeof err> {
	const name = value.trim();
	if (!name) return err('Name is required');
	if (name.length > MAX_FILTER_NAME_LENGTH) {
		return err(`Name must be ${MAX_FILTER_NAME_LENGTH} characters or less`);
	}
	return name;
}

function isMcpError(value: unknown): value is ReturnType<typeof err> {
	return Boolean(value && typeof value === 'object' && 'isError' in value);
}

function validateFilters(
	value: Record<string, unknown>
): Record<string, unknown> | ReturnType<typeof err> {
	if (Object.getPrototypeOf(value) !== Object.prototype) {
		return err('Filters object is required');
	}
	if (JSON.stringify(value).length > MAX_FILTER_JSON_LENGTH) {
		return err(`Filters must be ${MAX_FILTER_JSON_LENGTH} characters or less`);
	}
	if (containsUnsafeFilterKey(value)) {
		return err('Filters contain an unsafe key');
	}
	return value;
}

function containsUnsafeFilterKey(value: unknown): boolean {
	if (Array.isArray(value)) {
		return value.some((item) => containsUnsafeFilterKey(item));
	}
	if (!value || typeof value !== 'object') {
		return false;
	}
	for (const [key, child] of Object.entries(value)) {
		if (UNSAFE_FILTER_KEYS.has(key) || containsUnsafeFilterKey(child)) {
			return true;
		}
	}
	return false;
}

export function registerSavedFilterTools(server: McpServer, projectId: number) {
	server.tool('list-saved-filters', 'List all saved filters for the project', {}, async () => {
		const filters = await db
			.select({
				id: savedFilter.id,
				name: savedFilter.name,
				filterType: savedFilter.filterType,
				filters: savedFilter.filters
			})
			.from(savedFilter)
			.where(eq(savedFilter.projectId, projectId));

		return ok(filters);
	});

	server.tool(
		'create-saved-filter',
		'Create a saved filter',
		{
			name: z.string().max(MAX_FILTER_NAME_LENGTH).describe('Filter name'),
			filterType: z
				.enum(ALLOWED_FILTER_TYPES)
				.optional()
				.describe('Filter type (default: test_cases)'),
			filters: z.record(z.string(), z.unknown()).describe('Filter criteria as JSON object')
		},
		async ({ name, filterType, filters }) => {
			const creator = await requireProjectCreator(projectId);
			if (typeof creator !== 'string') return creator;

			const filterName = validateFilterName(name);
			if (typeof filterName !== 'string') return filterName;
			const validatedFilters = validateFilters(filters);
			if (isMcpError(validatedFilters)) return validatedFilters;

			const existing = await db.query.savedFilter.findFirst({
				where: and(
					eq(savedFilter.projectId, projectId),
					eq(savedFilter.userId, creator),
					eq(savedFilter.name, filterName)
				)
			});
			if (existing) return err('A saved view with this name already exists');

			const [created] = await db
				.insert(savedFilter)
				.values({
					projectId,
					userId: creator,
					name: filterName,
					filterType: filterType ?? 'test_cases',
					filters: validatedFilters
				})
				.returning();

			return ok(created);
		}
	);

	server.tool(
		'delete-saved-filter',
		'Delete a saved filter by ID',
		{ filterId: mcpPositiveIdSchema.describe('Saved filter ID') },
		async ({ filterId }) => {
			const f = await db.query.savedFilter.findFirst({
				where: and(eq(savedFilter.id, filterId), eq(savedFilter.projectId, projectId))
			});
			if (!f) return err('Saved filter not found');

			await db
				.delete(savedFilter)
				.where(and(eq(savedFilter.id, filterId), eq(savedFilter.projectId, projectId)));
			return ok({ success: true, deletedId: filterId });
		}
	);
}
