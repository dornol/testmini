import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag,
	priorityConfig
} from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';
import { parseCSV } from '$lib/server/csv-utils';

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
		priority: priority || 'MEDIUM',
		precondition: obj['Precondition'] ?? obj['precondition'] ?? '',
		steps,
		expectedResult: obj['Expected Result'] ?? obj['expectedResult'] ?? obj['expected_result'] ?? '',
		tags,
		group: obj['Group'] ?? obj['group'] ?? ''
	};
}

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA'], async ({ request, user, projectId }) => {

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file || file.size === 0) {
		error(400, 'No file uploaded');
	}

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	if (file.size > MAX_FILE_SIZE) {
		error(400, 'File size must not exceed 10MB');
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

	// Validate and track per-row results
	type RowResult = { row: number; status: 'success' | 'skipped' | 'error'; title?: string; key?: string; error?: string };
	const rowResults: RowResult[] = [];
	const validRows: { row: ImportRow; originalIndex: number }[] = [];

	for (let idx = 0; idx < importRows.length; idx++) {
		const row = importRows[idx];
		if (!row.title.trim()) {
			errors.push(`Row ${idx + 1}: Missing title, skipped`);
			rowResults.push({ row: idx + 1, status: 'skipped', title: '', error: 'Missing title' });
		} else {
			validRows.push({ row, originalIndex: idx });
		}
	}

	const MAX_IMPORT_ROWS = 5_000;
	if (importRows.length > MAX_IMPORT_ROWS) {
		return json({ imported: 0, errors: [`Import limited to ${MAX_IMPORT_ROWS} rows. File contains ${importRows.length} rows.`], rows: [] }, { status: 400 });
	}

	if (validRows.length === 0) {
		return json({ imported: 0, errors: ['No valid rows to import', ...errors], rows: rowResults }, { status: 400 });
	}

	// Load project priorities for validation
	const projectPriorities = await db
		.select({ name: priorityConfig.name, isDefault: priorityConfig.isDefault })
		.from(priorityConfig)
		.where(eq(priorityConfig.projectId, projectId));
	const validPriorityNames = new Set(projectPriorities.map((p) => p.name));
	const defaultPriority = projectPriorities.find((p) => p.isDefault)?.name ?? projectPriorities[0]?.name ?? 'MEDIUM';

	// Normalize priority values against project config
	for (const row of importRows) {
		if (!validPriorityNames.has(row.priority)) {
			row.priority = defaultPriority;
		}
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

		for (const { row, originalIndex } of validRows) {
			const key = `TC-${String(nextNum).padStart(4, '0')}`;
			nextNum++;

			try {
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
						createdBy: user.id
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
						priority: row.priority,
						updatedBy: user.id
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
				rowResults.push({ row: originalIndex + 1, status: 'success', title: row.title, key });
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				errors.push(`Row ${originalIndex + 1}: ${msg}`);
				rowResults.push({ row: originalIndex + 1, status: 'error', title: row.title, error: msg });
			}
		}
	});

	// Sort rowResults by row number for consistent display
	rowResults.sort((a, b) => a.row - b.row);

	return json({ imported, errors, rows: rowResults });
});
