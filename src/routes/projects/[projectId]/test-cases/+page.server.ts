import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { testCase, testCaseVersion, user } from '$lib/server/db/schema';
import { eq, and, ilike, or, count, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, url, parent }) => {
	await parent();
	const projectId = Number(params.projectId);

	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '20')));
	const search = url.searchParams.get('search') ?? '';
	const priority = url.searchParams.get('priority') ?? '';
	const offset = (page - 1) * limit;

	const conditions = [eq(testCase.projectId, projectId)];

	if (search) {
		const searchPattern = `%${search}%`;
		conditions.push(
			or(ilike(testCaseVersion.title, searchPattern), ilike(testCase.key, searchPattern))!
		);
	}

	if (priority && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) {
		conditions.push(
			eq(
				testCaseVersion.priority,
				priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
			)
		);
	}

	const where = and(...conditions);

	const [testCases, totalResult] = await Promise.all([
		db
			.select({
				id: testCase.id,
				key: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				updatedBy: user.name,
				updatedAt: testCaseVersion.createdAt
			})
			.from(testCase)
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.innerJoin(user, eq(testCaseVersion.updatedBy, user.id))
			.where(where)
			.orderBy(desc(testCase.id))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(testCase)
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.where(where)
	]);

	const total = totalResult[0]?.total ?? 0;

	return {
		testCases,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit)
		},
		search,
		priority
	};
};
