import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, testCaseTag, testCaseAssignee, tag, projectMember } from '$lib/server/db/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { requireAuth, requireProjectRole, parseJsonBody } from '$lib/server/auth-utils';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const authUser = requireAuth(locals);
	const projectId = Number(params.projectId);

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
		return json({ error: 'No test cases specified' }, { status: 400 });
	}

	if (testCaseIds.length > 200) {
		return json({ error: 'Batch size cannot exceed 200 items' }, { status: 400 });
	}

	// delete requires PROJECT_ADMIN, others require QA/DEV+
	if (action === 'delete') {
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN']);
	} else {
		await requireProjectRole(authUser, projectId, ['PROJECT_ADMIN', 'QA', 'DEV']);
	}

	// Verify all TCs belong to this project
	const tcs = await db
		.select({ id: testCase.id })
		.from(testCase)
		.where(and(eq(testCase.projectId, projectId), inArray(testCase.id, testCaseIds)));

	const validIds = tcs.map((tc) => tc.id);
	if (validIds.length === 0) {
		return json({ error: 'No valid test cases found' }, { status: 400 });
	}

	let affected = 0;

	await db.transaction(async (tx) => {
		switch (action) {
			case 'addTag': {
				if (!tagId) return json({ error: 'tagId required' }, { status: 400 });
				// Verify tag belongs to project
				const tagRecord = await tx.query.tag.findFirst({
					where: and(eq(tag.id, tagId), eq(tag.projectId, projectId))
				});
				if (!tagRecord) return json({ error: 'Tag not found' }, { status: 404 });

				for (const tcId of validIds) {
					const existing = await tx.query.testCaseTag.findFirst({
						where: and(eq(testCaseTag.testCaseId, tcId), eq(testCaseTag.tagId, tagId))
					});
					if (!existing) {
						await tx.insert(testCaseTag).values({ testCaseId: tcId, tagId });
						affected++;
					}
				}
				break;
			}

			case 'removeTag': {
				if (!tagId) return json({ error: 'tagId required' }, { status: 400 });
				for (const tcId of validIds) {
					const result = await tx
						.delete(testCaseTag)
						.where(and(eq(testCaseTag.testCaseId, tcId), eq(testCaseTag.tagId, tagId)));
					affected++;
				}
				break;
			}

			case 'setPriority': {
				if (!priority || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
					return json({ error: 'Invalid priority' }, { status: 400 });
				}
				for (const tcId of validIds) {
					const tc = await tx.query.testCase.findFirst({
						where: eq(testCase.id, tcId),
						with: { latestVersion: true }
					});
					if (!tc?.latestVersion) continue;
					if (tc.latestVersion.priority === priority) continue;

					const latest = tc.latestVersion;
					const [version] = await tx
						.insert(testCaseVersion)
						.values({
							testCaseId: tcId,
							versionNo: latest.versionNo + 1,
							title: latest.title,
							precondition: latest.precondition,
							steps: latest.steps,
							expectedResult: latest.expectedResult,
							priority: priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
							revision: latest.revision + 1,
							updatedBy: authUser.id
						})
						.returning();

					await tx
						.update(testCase)
						.set({ latestVersionId: version.id })
						.where(eq(testCase.id, tcId));
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
				if (!userId) return json({ error: 'userId required' }, { status: 400 });
				// Verify user is a project member
				const memberRecord = await tx.query.projectMember.findFirst({
					where: and(eq(projectMember.projectId, projectId), eq(projectMember.userId, userId))
				});
				if (!memberRecord) return json({ error: 'User is not a project member' }, { status: 404 });

				for (const tcId of validIds) {
					const existing = await tx.query.testCaseAssignee.findFirst({
						where: and(eq(testCaseAssignee.testCaseId, tcId), eq(testCaseAssignee.userId, userId))
					});
					if (!existing) {
						await tx.insert(testCaseAssignee).values({ testCaseId: tcId, userId });
						affected++;
					}
				}
				break;
			}

			case 'removeAssignee': {
				if (!userId) return json({ error: 'userId required' }, { status: 400 });
				for (const tcId of validIds) {
					await tx
						.delete(testCaseAssignee)
						.where(and(eq(testCaseAssignee.testCaseId, tcId), eq(testCaseAssignee.userId, userId)));
					affected++;
				}
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

				for (const tcId of validIds) {
					const tc = await tx.query.testCase.findFirst({
						where: eq(testCase.id, tcId),
						with: { latestVersion: true }
					});
					if (!tc?.latestVersion) continue;

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
							createdBy: authUser.id
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
							updatedBy: authUser.id
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
						.where(eq(testCaseTag.testCaseId, tcId));
					for (const t of tcTags) {
						await tx.insert(testCaseTag).values({ testCaseId: created.id, tagId: t.tagId });
					}

					// Copy assignees
					const tcAssignees = await tx
						.select({ userId: testCaseAssignee.userId })
						.from(testCaseAssignee)
						.where(eq(testCaseAssignee.testCaseId, tcId));
					for (const a of tcAssignees) {
						await tx.insert(testCaseAssignee).values({ testCaseId: created.id, userId: a.userId });
					}

					affected++;
				}
				break;
			}

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	});

	return json({ success: true, affected });
};
