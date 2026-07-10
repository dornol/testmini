import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import {
	release,
	requirement,
	testCase,
	testCaseVersion,
	testPlan,
	testRun
} from '$lib/server/db/schema';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { withProjectAccess } from '$lib/server/api-handler';
import { badRequest } from '$lib/server/errors';

const MAX_QUERY_LENGTH = 100;
const MAX_RESULTS_PER_TYPE = 5;

type SearchResult = {
	type: 'test_case' | 'test_run' | 'requirement' | 'test_plan' | 'release';
	id: number;
	title: string;
	subtitle: string | null;
	url: string;
};

export const GET = withProjectAccess(async ({ url, projectId }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (q.length < 2) return json({ results: [] });
	if (q.length > MAX_QUERY_LENGTH) {
		return badRequest(`q must be ${MAX_QUERY_LENGTH} characters or less`);
	}

	const pattern = `%${q}%`;
	const [testCases, testRuns, requirements, testPlans, releases] = await Promise.all([
		db
			.select({
				id: testCase.id,
				key: testCase.key,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority
			})
			.from(testCase)
			.innerJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.where(
				and(
					eq(testCase.projectId, projectId),
					or(
						ilike(testCase.key, pattern),
						ilike(testCase.automationKey, pattern),
						ilike(testCaseVersion.title, pattern)
					)
				)
			)
			.orderBy(desc(testCase.updatedAt))
			.limit(MAX_RESULTS_PER_TYPE),
		db
			.select({
				id: testRun.id,
				name: testRun.name,
				environment: testRun.environment,
				status: testRun.status
			})
			.from(testRun)
			.where(and(eq(testRun.projectId, projectId), ilike(testRun.name, pattern)))
			.orderBy(desc(testRun.createdAt))
			.limit(MAX_RESULTS_PER_TYPE),
		db
			.select({
				id: requirement.id,
				externalId: requirement.externalId,
				title: requirement.title,
				source: requirement.source
			})
			.from(requirement)
			.where(
				and(
					eq(requirement.projectId, projectId),
					or(ilike(requirement.title, pattern), ilike(requirement.externalId, pattern))
				)
			)
			.orderBy(desc(requirement.createdAt))
			.limit(MAX_RESULTS_PER_TYPE),
		db
			.select({
				id: testPlan.id,
				name: testPlan.name,
				status: testPlan.status,
				milestone: testPlan.milestone
			})
			.from(testPlan)
			.where(and(eq(testPlan.projectId, projectId), ilike(testPlan.name, pattern)))
			.orderBy(desc(testPlan.createdAt))
			.limit(MAX_RESULTS_PER_TYPE),
		db
			.select({
				id: release.id,
				name: release.name,
				version: release.version,
				status: release.status
			})
			.from(release)
			.where(
				and(eq(release.projectId, projectId), or(ilike(release.name, pattern), ilike(release.version, pattern)))
			)
			.orderBy(desc(release.createdAt))
			.limit(MAX_RESULTS_PER_TYPE)
	]);

	const results: SearchResult[] = [
		...testCases.map((tc) => ({
			type: 'test_case' as const,
			id: tc.id,
			title: `${tc.key} ${tc.title}`,
			subtitle: tc.priority,
			url: `/projects/${projectId}/test-cases/${tc.id}`
		})),
		...testRuns.map((run) => ({
			type: 'test_run' as const,
			id: run.id,
			title: run.name,
			subtitle: `${run.environment} · ${run.status}`,
			url: `/projects/${projectId}/test-runs/${run.id}`
		})),
		...requirements.map((req) => ({
			type: 'requirement' as const,
			id: req.id,
			title: req.externalId ? `${req.externalId} ${req.title}` : req.title,
			subtitle: req.source,
			url: `/projects/${projectId}/traceability?requirementId=${req.id}`
		})),
		...testPlans.map((plan) => ({
			type: 'test_plan' as const,
			id: plan.id,
			title: plan.name,
			subtitle: plan.milestone ? `${plan.status} · ${plan.milestone}` : plan.status,
			url: `/projects/${projectId}/test-plans/${plan.id}`
		})),
		...releases.map((rel) => ({
			type: 'release' as const,
			id: rel.id,
			title: rel.version ? `${rel.name} ${rel.version}` : rel.name,
			subtitle: rel.status,
			url: `/projects/${projectId}/releases/${rel.id}`
		}))
	];

	return json({ results });
});
