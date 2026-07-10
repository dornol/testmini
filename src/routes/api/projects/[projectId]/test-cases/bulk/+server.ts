import { json, error } from '@sveltejs/kit';
import { db, findTestCasesWithLatestVersions } from '$lib/server/db';
import {
	testCase,
	testCaseVersion,
	testCaseTag,
	testCaseAssignee,
	tag,
	projectMember,
	priorityConfig,
	testCaseGroup
} from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest, notFound } from '$lib/server/errors';
import { createNotification } from '$lib/server/notifications';
import { validateBulkTestCasePayload } from '$lib/server/test-case-bulk-validation';

export const POST = withProjectAccess(async ({ request, user, projectId }) => {
	const body = await parseJsonBody(request);
	const payload = validateBulkTestCasePayload(body);
	if (payload instanceof Response) return payload;
	const { action, testCaseIds, tagId, priority, groupId, userId } = payload;

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
	if (validIds.length !== testCaseIds.length) {
		return badRequest('Some test cases do not belong to this project');
	}

	if (action === 'moveToGroup' && groupId !== null && groupId !== undefined) {
		const groupRecord = await db.query.testCaseGroup.findFirst({
			where: and(eq(testCaseGroup.id, groupId), eq(testCaseGroup.projectId, projectId))
		});
		if (!groupRecord) return notFound('Test case group not found');
	}

	let affected = 0;

	const transactionResult = await db.transaction(async (tx) => {
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
				const tagRecord = await tx.query.tag.findFirst({
					where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
				});
				if (!tagRecord) return notFound('Tag not found');

				await tx
					.delete(testCaseTag)
					.where(and(inArray(testCaseTag.testCaseId, validIds), eq(testCaseTag.tagId, tagId)));
				affected = validIds.length;
				break;
			}

			case 'setPriority': {
				if (!priority) {
					return badRequest('Invalid priority');
				}
				// Validate priority against project config
				const validPriority = await tx.query.priorityConfig.findFirst({
					where: and(eq(priorityConfig.projectId, projectId), eq(priorityConfig.name, priority))
				});
				if (!validPriority) {
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
							priority,
							revision: latest.revision + 1,
							updatedBy: user.id
						})
						.returning();
					if (!version) {
						error(500, 'Failed to create test case version');
					}

					const [updatedTestCase] = await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(and(eq(testCase.id, tc.id), eq(testCase.projectId, projectId)))
						.returning({ id: testCase.id });
					if (!updatedTestCase) {
						error(404, 'Test case not found');
					}
					affected++;
				}
				break;
			}

			case 'moveToGroup': {
				const newGroupId = groupId === undefined ? null : groupId;
				const updatedRows = await tx
					.update(testCase)
					.set({ groupId: newGroupId })
					.where(and(inArray(testCase.id, validIds), eq(testCase.projectId, projectId)))
					.returning({ id: testCase.id });
				if (updatedRows.length !== validIds.length) {
					error(404, 'Some test cases were not found');
				}
				affected = validIds.length;
				break;
			}

			case 'delete': {
				const deletedRows = await tx
					.delete(testCase)
					.where(and(inArray(testCase.id, validIds), eq(testCase.projectId, projectId)))
					.returning({ id: testCase.id });
				if (deletedRows.length !== validIds.length) {
					error(404, 'Some test cases were not found');
				}
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

				// Notify assigned user (fire-and-forget, outside transaction)
				if (userId !== user.id) {
					createNotification({
						userId,
						type: 'ASSIGNED',
						title: 'Assigned to test cases',
						message: `${user.name ?? 'Someone'} assigned you to ${validIds.length} test case(s)`,
						link: `/projects/${projectId}/test-cases`,
						projectId
					});
				}
				break;
			}

			case 'removeAssignee': {
				if (!userId) return badRequest('userId required');
				await tx
					.delete(testCaseAssignee)
					.where(
						and(inArray(testCaseAssignee.testCaseId, validIds), eq(testCaseAssignee.userId, userId))
					);
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
					const groupCondition =
						tc.groupId !== null
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
					if (!created) {
						error(500, 'Failed to create test case');
					}

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
					if (!version) {
						error(500, 'Failed to create test case version');
					}

					const [updatedTestCase] = await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(and(eq(testCase.id, created.id), eq(testCase.projectId, projectId)))
						.returning({ id: testCase.id });
					if (!updatedTestCase) {
						error(404, 'Test case not found');
					}

					// Copy tags
					const tcTags = await tx
						.select({ tagId: testCaseTag.tagId })
						.from(testCaseTag)
						.innerJoin(tag, eq(testCaseTag.tagId, tag.id))
						.where(and(eq(testCaseTag.testCaseId, tc.id), eq(tag.projectId, projectId)));
					if (tcTags.length > 0) {
						await tx
							.insert(testCaseTag)
							.values(tcTags.map((t) => ({ testCaseId: created.id, tagId: t.tagId })));
					}

					// Copy assignees
					const tcAssignees = await tx
						.select({ userId: testCaseAssignee.userId })
						.from(testCaseAssignee)
						.innerJoin(
							projectMember,
							and(
								eq(testCaseAssignee.userId, projectMember.userId),
								eq(projectMember.projectId, projectId)
							)
						)
						.where(eq(testCaseAssignee.testCaseId, tc.id));
					if (tcAssignees.length > 0) {
						await tx
							.insert(testCaseAssignee)
							.values(tcAssignees.map((a) => ({ testCaseId: created.id, userId: a.userId })));
					}

					affected++;
				}
				break;
			}

			default:
				return badRequest('Invalid action');
		}
	});
	if (transactionResult instanceof Response) return transactionResult;

	return json({ success: true, affected });
});
