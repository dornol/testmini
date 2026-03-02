import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag
} from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole } from '$lib/server/auth-utils';

function parseCSV(text: string): string[][] {
	const rows: string[][] = [];
	let current = '';
	let inQuotes = false;
	let row: string[] = [];

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < text.length && text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else {
			if (ch === '"') {
				inQuotes = true;
			} else if (ch === ',') {
				row.push(current);
				current = '';
			} else if (ch === '\n' || ch === '\r') {
				if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
					i++;
				}
				row.push(current);
				current = '';
				if (row.some((c) => c.trim() !== '')) {
					rows.push(row);
				}
				row = [];
			} else {
				current += ch;
			}
		}
	}
	// Last row
	row.push(current);
	if (row.some((c) => c.trim() !== '')) {
		rows.push(row);
	}

	return rows;
}

interface ImportRow {
	title: string;
	priority: string;
	precondition: string;
	steps: { order: number; action: string; expected: string }[];
	expectedResult: string;
	tags: string[];
	group: string;
}

function normalizeRow(obj: Record<string, string>): ImportRow {
	const priority = (obj['Priority'] ?? obj['priority'] ?? 'MEDIUM').toUpperCase();
	let steps: { order: number; action: string; expected: string }[] = [];
	const rawSteps = obj['Steps'] ?? obj['steps'] ?? '';
	if (rawSteps) {
		let parsed: unknown = rawSteps;
		if (typeof rawSteps === 'string') {
			try {
				parsed = JSON.parse(rawSteps);
			} catch {
				parsed = null;
			}
		}
		if (Array.isArray(parsed)) {
			steps = parsed.map((s: { action?: string; expected?: string }, i: number) => ({
				order: i + 1,
				action: s.action ?? '',
				expected: s.expected ?? ''
			}));
		}
	}

	const tagsRaw = obj['Tags'] ?? obj['tags'] ?? '';
	const tags = Array.isArray(tagsRaw)
		? tagsRaw.map(String).filter(Boolean)
		: typeof tagsRaw === 'string' && tagsRaw
			? tagsRaw.split(';').map((t: string) => t.trim()).filter(Boolean)
			: [];

	return {
		title: obj['Title'] ?? obj['title'] ?? '',
		priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority) ? priority : 'MEDIUM',
		precondition: obj['Precondition'] ?? obj['precondition'] ?? '',
		steps,
		expectedResult: obj['Expected Result'] ?? obj['expectedResult'] ?? obj['expected_result'] ?? '',
		tags,
		group: obj['Group'] ?? obj['group'] ?? ''
	};
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA']);

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file || file.size === 0) {
		error(400, 'No file uploaded');
	}

	const text = await file.text();
	// Remove UTF-8 BOM if present
	const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;

	const isJSON = file.name.endsWith('.json');
	let importRows: ImportRow[] = [];
	const errors: string[] = [];

	if (isJSON) {
		try {
			const data = JSON.parse(clean);
			const arr = Array.isArray(data) ? data : data.testCases;
			if (!Array.isArray(arr)) {
				error(400, 'JSON must contain a "testCases" array or be an array');
			}
			importRows = arr.map((obj: Record<string, string>) => normalizeRow(obj));
		} catch (e) {
			if (e && typeof e === 'object' && 'status' in e) throw e;
			error(400, 'Invalid JSON file');
		}
	} else {
		// CSV
		const csvRows = parseCSV(clean);
		if (csvRows.length < 2) {
			error(400, 'CSV must have a header row and at least one data row');
		}
		const headers = csvRows[0].map((h) => h.trim());
		for (let i = 1; i < csvRows.length; i++) {
			const obj: Record<string, string> = {};
			for (let j = 0; j < headers.length; j++) {
				obj[headers[j]] = csvRows[i][j]?.trim() ?? '';
			}
			importRows.push(normalizeRow(obj));
		}
	}

	// Validate
	importRows = importRows.filter((row, idx) => {
		if (!row.title.trim()) {
			errors.push(`Row ${idx + 1}: Missing title, skipped`);
			return false;
		}
		return true;
	});

	if (importRows.length === 0) {
		return json({ imported: 0, errors: ['No valid rows to import', ...errors] }, { status: 400 });
	}

	// Load project tags and groups for matching
	const projectTags = await db
		.select({ id: tag.id, name: tag.name })
		.from(tag)
		.where(eq(tag.projectId, projectId));
	const tagNameMap = new Map(projectTags.map((t) => [t.name.toLowerCase(), t.id]));

	const projectGroups = await db
		.select({ id: testCaseGroup.id, name: testCaseGroup.name })
		.from(testCaseGroup)
		.where(eq(testCaseGroup.projectId, projectId));
	const groupNameMap = new Map(projectGroups.map((g) => [g.name.toLowerCase(), g.id]));

	let imported = 0;

	await db.transaction(async (tx) => {
		// Get max key number
		const [maxResult] = await tx
			.select({
				maxKey: sql<string>`max(key)`.as('max_key')
			})
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		let nextNum = 1;
		if (maxResult?.maxKey) {
			const match = maxResult.maxKey.match(/TC-(\d+)/);
			if (match) {
				nextNum = parseInt(match[1], 10) + 1;
			}
		}

		// Get max sortOrder
		const [maxSortResult] = await tx
			.select({ maxOrder: sql<number>`coalesce(max(${testCase.sortOrder}), 0)` })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));
		let sortOrder = (maxSortResult?.maxOrder ?? 0) + 1000;

		for (const row of importRows) {
			const key = `TC-${String(nextNum).padStart(4, '0')}`;
			nextNum++;

			const groupId = row.group
				? (groupNameMap.get(row.group.toLowerCase()) ?? null)
				: null;

			const [created] = await tx
				.insert(testCase)
				.values({
					projectId,
					key,
					groupId,
					sortOrder,
					createdBy: authUser.id
				})
				.returning();

			const [version] = await tx
				.insert(testCaseVersion)
				.values({
					testCaseId: created.id,
					versionNo: 1,
					title: row.title,
					precondition: row.precondition || null,
					steps: row.steps,
					expectedResult: row.expectedResult || null,
					priority: row.priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
					updatedBy: authUser.id
				})
				.returning();

			await tx
				.update(testCase)
				.set({ latestVersionId: version.id })
				.where(eq(testCase.id, created.id));

			// Link tags
			for (const tagName of row.tags) {
				const tagId = tagNameMap.get(tagName.toLowerCase());
				if (tagId) {
					await tx.insert(testCaseTag).values({
						testCaseId: created.id,
						tagId
					}).onConflictDoNothing();
				}
			}

			sortOrder += 1000;
			imported++;
		}
	});

	return json({ imported, errors });
};
