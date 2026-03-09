import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseGroup,
	tag,
	testCaseTag
} from '$lib/server/db/schema';
import { eq, asc, inArray } from 'drizzle-orm';
import { csvResponse } from '$lib/server/csv-utils';
import { withProjectAccess } from '$lib/server/api-handler';

export const GET = withProjectAccess(async ({ url, projectId }) => {

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

	// Load tags only for exported test cases
	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const tcIds = [...tcIdSet];
	const tcTags = tcIds.length > 0
		? await db
			.select({
				testCaseId: testCaseTag.testCaseId,
				tagName: tag.name
			})
			.from(testCaseTag)
			.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
			.where(inArray(testCaseTag.testCaseId, tcIds))
			.orderBy(tag.name)
		: [];

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

	return csvResponse(csvHeaders, csvRows, 'test-cases.csv');
});
