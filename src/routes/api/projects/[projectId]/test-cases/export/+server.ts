import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag
} from '$lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';
import { requireAuth, requireProjectAccess } from '$lib/server/auth-utils';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);
	await requireProjectAccess(authUser, projectId);

	const format = url.searchParams.get('format') ?? 'csv';
	if (!['csv', 'json'].includes(format)) {
		error(400, 'Invalid format. Use csv or json.');
	}

	// Load all test cases with latest version
	const testCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			groupId: testCase.groupId,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority,
			precondition: testCaseVersion.precondition,
			steps: testCaseVersion.steps,
			expectedResult: testCaseVersion.expectedResult
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(asc(testCase.key));

	// Load groups for name mapping
	const groups = await db
		.select({ id: testCaseGroup.id, name: testCaseGroup.name })
		.from(testCaseGroup)
		.where(eq(testCaseGroup.projectId, projectId));
	const groupMap = new Map(groups.map((g) => [g.id, g.name]));

	// Load tags per test case
	const tcTags = await db
		.select({
			testCaseId: testCaseTag.testCaseId,
			tagName: tag.name
		})
		.from(testCaseTag)
		.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
		.where(eq(tag.projectId, projectId))
		.orderBy(tag.name);

	const tagsByTc = new Map<number, string[]>();
	for (const row of tcTags) {
		const arr = tagsByTc.get(row.testCaseId) ?? [];
		arr.push(row.tagName);
		tagsByTc.set(row.testCaseId, arr);
	}

	const rows = testCases.map((tc) => ({
		key: tc.key,
		title: tc.title,
		priority: tc.priority,
		precondition: tc.precondition ?? '',
		steps: tc.steps,
		expectedResult: tc.expectedResult ?? '',
		tags: tagsByTc.get(tc.id) ?? [],
		group: tc.groupId ? (groupMap.get(tc.groupId) ?? '') : ''
	}));

	if (format === 'json') {
		return new Response(JSON.stringify({ testCases: rows }, null, 2), {
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
				'Content-Disposition': `attachment; filename="test-cases.json"`
			}
		});
	}

	// CSV with UTF-8 BOM for Excel compatibility
	const csvHeaders = ['Key', 'Title', 'Priority', 'Precondition', 'Steps', 'Expected Result', 'Tags', 'Group'];
	const csvRows = rows.map((r) => [
		r.key,
		r.title,
		r.priority,
		r.precondition,
		JSON.stringify(r.steps),
		r.expectedResult,
		r.tags.join('; '),
		r.group
	]);

	const csvContent =
		'\uFEFF' +
		[csvHeaders, ...csvRows]
			.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
			.join('\n');

	return new Response(csvContent, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="test-cases.csv"`
		}
	});
};
