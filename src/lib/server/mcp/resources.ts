import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '$lib/server/db';
import {
	project,
	projectMember,
	testCase,
	testCaseVersion,
	testRun,
	testSuite,
	testPlan,
	testCaseTemplate,
	customField,
	requirement,
	exploratorySession,
	environmentConfig,
	priorityConfig,
	tag
} from '$lib/server/db/schema';
import { eq, desc, count, asc } from 'drizzle-orm';

export function registerResources(server: McpServer, projectId: number) {
	server.resource('test-cases', 'test-cases://list', async () => {
		const cases = await db
			.select({
				id: testCase.id,
				key: testCase.key,
				automationKey: testCase.automationKey,
				title: testCaseVersion.title,
				priority: testCaseVersion.priority,
				createdAt: testCase.createdAt
			})
			.from(testCase)
			.leftJoin(testCaseVersion, eq(testCase.latestVersionId, testCaseVersion.id))
			.where(eq(testCase.projectId, projectId))
			.orderBy(testCase.sortOrder);

		return { contents: [{ uri: 'test-cases://list', text: JSON.stringify(cases, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-runs', 'test-runs://list', async () => {
		const runs = await db
			.select({
				id: testRun.id,
				name: testRun.name,
				environment: testRun.environment,
				status: testRun.status,
				createdAt: testRun.createdAt,
				finishedAt: testRun.finishedAt
			})
			.from(testRun)
			.where(eq(testRun.projectId, projectId))
			.orderBy(desc(testRun.createdAt))
			.limit(50);

		return { contents: [{ uri: 'test-runs://list', text: JSON.stringify(runs, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('summary', 'reports://summary', async () => {
		const latestRuns = await db
			.select({
				id: testRun.id,
				name: testRun.name,
				status: testRun.status,
				environment: testRun.environment,
				finishedAt: testRun.finishedAt
			})
			.from(testRun)
			.where(eq(testRun.projectId, projectId))
			.orderBy(desc(testRun.createdAt))
			.limit(5);

		const [tcCount] = await db
			.select({ value: count() })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const summary = {
			totalTestCases: tcCount?.value ?? 0,
			recentRuns: latestRuns
		};

		return { contents: [{ uri: 'reports://summary', text: JSON.stringify(summary, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('project', 'projects://current', async () => {
		const proj = await db.query.project.findFirst({
			where: eq(project.id, projectId)
		});

		if (!proj) {
			return { contents: [{ uri: 'projects://current', text: JSON.stringify(null), mimeType: 'application/json' }] };
		}

		const [tcCount] = await db
			.select({ value: count() })
			.from(testCase)
			.where(eq(testCase.projectId, projectId));

		const [runCount] = await db
			.select({ value: count() })
			.from(testRun)
			.where(eq(testRun.projectId, projectId));

		const [suiteCount] = await db
			.select({ value: count() })
			.from(testSuite)
			.where(eq(testSuite.projectId, projectId));

		const [planCount] = await db
			.select({ value: count() })
			.from(testPlan)
			.where(eq(testPlan.projectId, projectId));

		const members = await db
			.select({
				userId: projectMember.userId,
				role: projectMember.role
			})
			.from(projectMember)
			.where(eq(projectMember.projectId, projectId));

		const environments = await db
			.select({ name: environmentConfig.name, color: environmentConfig.color })
			.from(environmentConfig)
			.where(eq(environmentConfig.projectId, projectId))
			.orderBy(asc(environmentConfig.position));

		const priorities = await db
			.select({ name: priorityConfig.name, color: priorityConfig.color })
			.from(priorityConfig)
			.where(eq(priorityConfig.projectId, projectId))
			.orderBy(asc(priorityConfig.position));

		const projectInfo = {
			id: proj.id,
			name: proj.name,
			description: proj.description,
			active: proj.active,
			createdAt: proj.createdAt,
			counts: {
				testCases: tcCount?.value ?? 0,
				testRuns: runCount?.value ?? 0,
				testSuites: suiteCount?.value ?? 0,
				testPlans: planCount?.value ?? 0,
				members: members.length
			},
			members,
			environments,
			priorities
		};

		return { contents: [{ uri: 'projects://current', text: JSON.stringify(projectInfo, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('tags', 'tags://list', async () => {
		const tags = await db
			.select({ id: tag.id, name: tag.name, color: tag.color })
			.from(tag)
			.where(eq(tag.projectId, projectId))
			.orderBy(tag.name);

		return { contents: [{ uri: 'tags://list', text: JSON.stringify(tags, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-suites', 'test-suites://list', async () => {
		const suites = await db
			.select({
				id: testSuite.id,
				name: testSuite.name,
				description: testSuite.description,
				createdAt: testSuite.createdAt
			})
			.from(testSuite)
			.where(eq(testSuite.projectId, projectId))
			.orderBy(testSuite.name);

		return { contents: [{ uri: 'test-suites://list', text: JSON.stringify(suites, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('test-plans', 'test-plans://list', async () => {
		const plans = await db
			.select({
				id: testPlan.id,
				name: testPlan.name,
				status: testPlan.status,
				milestone: testPlan.milestone,
				startDate: testPlan.startDate,
				endDate: testPlan.endDate,
				createdAt: testPlan.createdAt
			})
			.from(testPlan)
			.where(eq(testPlan.projectId, projectId))
			.orderBy(desc(testPlan.createdAt));

		return { contents: [{ uri: 'test-plans://list', text: JSON.stringify(plans, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('templates', 'templates://list', async () => {
		const templates = await db
			.select({
				id: testCaseTemplate.id,
				name: testCaseTemplate.name,
				description: testCaseTemplate.description,
				priority: testCaseTemplate.priority,
				createdAt: testCaseTemplate.createdAt
			})
			.from(testCaseTemplate)
			.where(eq(testCaseTemplate.projectId, projectId))
			.orderBy(testCaseTemplate.name);

		return { contents: [{ uri: 'templates://list', text: JSON.stringify(templates, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('requirements', 'requirements://list', async () => {
		const reqs = await db
			.select({
				id: requirement.id,
				externalId: requirement.externalId,
				title: requirement.title,
				description: requirement.description,
				source: requirement.source,
				createdAt: requirement.createdAt
			})
			.from(requirement)
			.where(eq(requirement.projectId, projectId))
			.orderBy(requirement.id);

		return { contents: [{ uri: 'requirements://list', text: JSON.stringify(reqs, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('custom-fields', 'custom-fields://list', async () => {
		const fields = await db
			.select({
				id: customField.id,
				name: customField.name,
				fieldType: customField.fieldType,
				options: customField.options,
				required: customField.required,
				sortOrder: customField.sortOrder
			})
			.from(customField)
			.where(eq(customField.projectId, projectId))
			.orderBy(customField.sortOrder);

		return { contents: [{ uri: 'custom-fields://list', text: JSON.stringify(fields, null, 2), mimeType: 'application/json' }] };
	});

	server.resource('exploratory-sessions', 'exploratory-sessions://list', async () => {
		const sessions = await db
			.select({
				id: exploratorySession.id,
				title: exploratorySession.title,
				charter: exploratorySession.charter,
				status: exploratorySession.status,
				environment: exploratorySession.environment,
				tags: exploratorySession.tags,
				startedAt: exploratorySession.startedAt,
				completedAt: exploratorySession.completedAt
			})
			.from(exploratorySession)
			.where(eq(exploratorySession.projectId, projectId))
			.orderBy(desc(exploratorySession.startedAt))
			.limit(50);

		return { contents: [{ uri: 'exploratory-sessions://list', text: JSON.stringify(sessions, null, 2), mimeType: 'application/json' }] };
	});
}
