import { json, error } from '@sveltejs/kit';
import { db, findTestCaseWithLatestVersion } from '$lib/server/db';
import { testCase, testCaseVersion, testCaseTag } from '$lib/server/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { withProjectRole } from '$lib/server/api-handler';

export const POST = withProjectRole(['PROJECT_ADMIN', 'QA', 'DEV'], async ({ params, user, projectId }) => {
	const testCaseId = Number(params.testCaseId);

	const tc = await findTestCaseWithLatestVersion(testCaseId, projectId);

	if (!tc) {
		error(404, 'Test case not found');
	}

	if (!tc.latestVersion) {
		error(500, 'No latest version found');
	}

	let newTestCaseId: number;
	let newKey: string;

	await db.transaction(async (tx) => {
		// Generate key
		const [maxResult] = await tx
			.select({ maxKey: sql<string>`max(key)`.as('max_key') })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		let nextNum = 1;
		if (maxResult?.maxKey) {
			const match = maxResult.maxKey.match(/TC-(\d+)/);
			if (match) {
				nextNum = parseInt(match[1], 10) + 1;
			}
		}
		newKey = `TC-${String(nextNum).padStart(4, '0')}`;

		// Compute sortOrder for same group
		const groupCondition = tc.groupId !== null
			? eq(testCase.groupId, tc.groupId)
			: sql`${testCase.groupId} is null`;
		const [maxSortResult] = await tx
			.select({ maxOrder: sql<number>`coalesce(max(${testCase.sortOrder}), 0)` })
			.from(testCase)
			.where(and(eq(testCase.projectId, projectId), groupCondition));
		const sortOrder = (maxSortResult?.maxOrder ?? 0) + 1000;

		// Create new test case
		const [created] = await tx
			.insert(testCase)
			.values({
				projectId,
				key: newKey,
				groupId: tc.groupId,
				sortOrder,
				createdBy: user.id
			})
			.returning();

		newTestCaseId = created.id;

		// Create version from latest
		const latest = tc.latestVersion!;
		const [version] = await tx
			.insert(testCaseVersion)
			.values({
				testCaseId: created.id,
				versionNo: 1,
				title: latest.title,
				precondition: latest.precondition,
				steps: latest.steps,
				expectedResult: latest.expectedResult,
				priority: latest.priority,
				updatedBy: user.id
			})
			.returning();

		// Update latestVersionId
		await tx
			.update(testCase)
			.set({ latestVersionId: version.id })
			.where(eq(testCase.id, created.id));

		// Copy tags
		const tcTags = await tx
			.select({ tagId: testCaseTag.tagId })
			.from(testCaseTag)
			.where(eq(testCaseTag.testCaseId, testCaseId));

		for (const t of tcTags) {
			await tx.insert(testCaseTag).values({ testCaseId: created.id, tagId: t.tagId });
		}
	});

	return json({ success: true, newTestCaseId: newTestCaseId!, newKey: newKey! });
});
