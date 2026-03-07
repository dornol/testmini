import { json } from '@sveltejs/kit';
import { db, findTestCasesWithLatestVersions } from '$lib/server/db';
import { testCase, testCaseVersion, testCaseTag, testCaseAssignee, tag, projectMember } from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';

export const POST = withProjectAccess(async ({ request, user, projectId }) => {

	const body = await parseJsonBody(request);
	const { action, testCaseIds, tagId, priority, groupId, userId } = body as {
		action: 'addTag' | 'removeTag' | 'setPriority' | 'moveToGroup' | 'delete' | 'clone' | 'addAssignee' | 'removeAssignee';
		testCaseIds: number[];
		tagId?: number;
		priority?: string;
		groupId?: number | null;
		userId?: string;
	};

	if (!testCaseIds || !Array.isArray(testCaseIds) || testCaseIds.length === 0) {
		return badRequest('No test cases specified');
	}

	if (testCaseIds.length > 200) {
		return badRequest('Batch size cannot exceed 200 items');
	}

	// delete requires PROJECT_ADMIN, others require QA/DEV+
	if (action === 'delete') {
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN']);
	} else {
		await requireProjectRole(user, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
	}

	// Verify all TCs belong to this project
	const tcs = await db
		.select({ id: testCase.id })
		.from(testCase)
		.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));

	const validIds = tcs.map((tc) => tc.id);
	if (validIds.length === 0) {
		return badRequest('No valid test cases found');
	}

	let affected = 0;

	await db.transaction(async (tx) => {
		switch (action) {
			case 'addTag': {
				if (!tagId) return badRequest('tagId required');
				// Verify tag belongs to project
				const tagRecord = await tx.query.tag.findFirst({
					where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
				});
				if (!tagRecord) return notFound('Tag not found');

				const tagValues = validIds.map((tcId) => ({ testCaseId: tcId, tagId }));
				await tx.insert(testCaseTag).values(tagValues).onConflictDoNothing();
				affected = validIds.length;
				break;
			}

			case 'removeTag': {
				if (!tagId) return badRequest('tagId required');
				await tx
					.delete(testCaseTag)
					.where(and(inArray(testCaseTag.testCaseId, validIds), eq(testCaseTag.tagId, tagId)));
				affected = validIds.length;
				break;
			}

			case 'setPriority': {
				if (!priority || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
					return badRequest('Invalid priority');
				}
				const tcsForPriority = await findTestCasesWithLatestVersions(validIds, projectId);
				for (const tc of tcsForPriority) {
					if (!tc.latestVersion) continue;
					if (tc.latestVersion.priority === priority) continue;

					const latest = tc.latestVersion;
					const [version] = await tx
						.insert(testCaseVersion)
						.values({
							testCaseId: tc.id,
							versionNo: latest.versionNo + 1,
							title: latest.title,
							precondition: latest.precondition,
							steps: latest.steps,
							expectedResult: latest.expectedResult,
							priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
							revision: latest.revision + 1,
							updatedBy: user.id
						})
						.returning();

					await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(eq(testCase.id, tc.id));
					affected++;
				}
				break;
			}

			case 'moveToGroup': {
				const newGroupId = groupId === undefined ? null : groupId;
				await tx
					.update(testCase)
					.set({ groupId: newGroupId })
					.where(inArray(testCase.id, validIds));
				affected = validIds.length;
				break;
			}

			case 'delete': {
				await tx.delete(testCase).where(inArray(testCase.id, validIds));
				affected = validIds.length;
				break;
			}

			case 'addAssignee': {
				if (!userId) return badRequest('userId required');
				// Verify user is a project member
				const memberRecord = await tx.query.projectMember.findFirst({
					where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))
				});
				if (!memberRecord) return notFound('User is not a project member');

				const assigneeValues = validIds.map((tcId) => ({ testCaseId: tcId, userId }));
				await tx.insert(testCaseAssignee).values(assigneeValues).onConflictDoNothing();
				affected = validIds.length;
				break;
			}

			case 'removeAssignee': {
				if (!userId) return badRequest('userId required');
				await tx
					.delete(testCaseAssignee)
					.where(and(inArray(testCaseAssignee.testCaseId, validIds), eq(testCaseAssignee.userId, userId)));
				affected = validIds.length;
				break;
			}

			case 'clone': {
				// Get max key number for the project
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

				const tcsForClone = await findTestCasesWithLatestVersions(validIds, projectId);
				for (const tc of tcsForClone) {
					if (!tc.latestVersion) continue;

					const key = `TC-${String(nextNum).padStart(4, '0')}`;
					nextNum++;

					// Compute sortOrder
					const groupCondition = tc.groupId !== null
						? eq(testCase.groupId, tc.groupId)
						: sql`${testCase.groupId} is null`;
					const [maxSortResult] = await tx
						.select({ maxOrder: sql<number>`coalesce(max(${testCase.sortOrder}), 0)` })
						.from(testCase)
						.where(and(eq(testCase.projectId, projectId), groupCondition));
					const sortOrder = (maxSortResult?.maxOrder ?? 0) + 1000;

					const [created] = await tx
						.insert(testCase)
						.values({
							projectId,
							key,
							groupId: tc.groupId,
							sortOrder,
							createdBy: user.id
						})
						.returning();

					const latest = tc.latestVersion;
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

					await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(eq(testCase.id, created.id));

					// Copy tags
					const tcTags = await tx
						.select({ tagId: testCaseTag.tagId })
						.from(testCaseTag)
						.where(eq(testCaseTag.testCaseId, tc.id));
					if (tcTags.length > 0) {
						await tx.insert(testCaseTag).values(tcTags.map((t) => ({ testCaseId: created.id, tagId: t.tagId })));
					}

					// Copy assignees
					const tcAssignees = await tx
						.select({ userId: testCaseAssignee.userId })
						.from(testCaseAssignee)
						.where(eq(testCaseAssignee.testCaseId, tc.id));
					if (tcAssignees.length > 0) {
						await tx.insert(testCaseAssignee).values(tcAssignees.map((a) => ({ testCaseId: created.id, userId: a.userId })));
					}

					affected++;
				}
				break;
			}

			default:
				return badRequest('Invalid action');
		}
	});

	return json({ success: true, affected });
});
