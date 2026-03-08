import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, tag, testCaseTag } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { loadProjectTags } from '$lib/server/queries';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { userRole } = await parent();
	if (userRole === 'VIEWER') {
		redirect(303, '../test-plans');
	}

	const projectId = Number(params.projectId);

	// Get all test cases with latest version for selection
	const testCases = await db
		.select({
			id: testCase.id,
			key: testCase.key,
			title: testCaseVersion.title,
			priority: testCaseVersion.priority
		})
		.from(testCase)
		.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
		.where(eq(testCase.projectId, projectId))
		.orderBy(testCase.id);

	// Batch load tags for all test cases
	const tcIdSet = new Set(testCases.map((tc) => tc.id));
	const tagsByTestCase: Record<number, { id: number; name: string; color: string }[]> = {};

	if (tcIdSet.size > 0) {
		const tcTags = await db
			.select({
				testCaseId: testCaseTag.testCaseId,
				tagId: tag.id,
				tagName: tag.name,
				tagColor: tag.color
			})
			.from(testCaseTag)
			.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
			.where(eq(tag.projectId, projectId))
			.orderBy(tag.name);

		for (const row of tcTags) {
			if (!tcIdSet.has(row.testCaseId)) continue;
			if (!tagsByTestCase[row.testCaseId]) {
				tagsByTestCase[row.testCaseId] = [];
			}
			tagsByTestCase[row.testCaseId].push({
				id: row.tagId,
				name: row.tagName,
				color: row.tagColor
			});
		}
	}

	const projectTags = await loadProjectTags(projectId);

	return {
		testCases: testCases.map((tc) => ({
			...tc,
			tags: tagsByTestCase[tc.id] ?? []
		})),
		projectTags
	};
};
