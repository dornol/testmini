import {
	pgTable,
	pgEnum,
	serial,
	integer,
	text,
	boolean,
	timestamp,
	jsonb,
	index,
	unique
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth.schema';

export * from './auth.schema';

// ── Enums ──────────────────────────────────────────────

export const globalRoleEnum = pgEnum('global_role', ['ADMIN', 'USER']);

export const projectRoleEnum = pgEnum('project_role', [
	'PROJECT_ADMIN',
	'QA',
	'DEV',
	'VIEWER'
]);

// priorityEnum kept for reference; columns now use text with priority_config table
export const priorityEnum = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// environmentEnum kept for reference; columns now use text with environment_config table
export const environmentEnum = pgEnum('environment', ['DEV', 'QA', 'STAGE', 'PROD']);

export const runStatusEnum = pgEnum('run_status', ['CREATED', 'IN_PROGRESS', 'COMPLETED']);

export const executionStatusEnum = pgEnum('execution_status', [
	'PENDING',
	'PASS',
	'FAIL',
	'BLOCKED',
	'SKIPPED'
]);

export const referenceTypeEnum = pgEnum('reference_type', [
	'TESTCASE',
	'EXECUTION',
	'FAILURE'
]);

export const releaseStatusEnum = pgEnum('release_status', [
	'PLANNING',
	'IN_PROGRESS',
	'READY',
	'RELEASED'
]);

export const signoffDecisionEnum = pgEnum('signoff_decision', ['APPROVED', 'REJECTED']);

// ── AppConfig (singleton branding settings) ───────────

export const appConfig = pgTable('app_config', {
	id: serial('id').primaryKey(),
	appName: text('app_name').notNull().default('testmini'),
	logoUrl: text('logo_url'),
	faviconUrl: text('favicon_url'),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

// ── Project ────────────────────────────────────────────

export const project = pgTable('project', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	active: boolean('active').default(true).notNull(),
	columnSettings: jsonb('column_settings').$type<{ id: string; visible: boolean }[]>(),
	requireSignoff: boolean('require_signoff').default(false).notNull(),
	teamId: integer('team_id').references(() => team.id, { onDelete: 'set null' }),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const projectRelations = relations(project, ({ one, many }) => ({
	team: one(team, {
		fields: [project.teamId],
		references: [team.id]
	}),
	members: many(projectMember),
	testCases: many(testCase),
	testRuns: many(testRun),
	tags: many(tag),
	groups: many(testCaseGroup),
	apiKeys: many(projectApiKey),
	priorities: many(priorityConfig),
	environments: many(environmentConfig),
	sharedDataSets: many(sharedDataSet),
	exploratorySessions: many(exploratorySession),
	testPlans: many(testPlan),
	releases: many(release)
}));

// ── ProjectMember ──────────────────────────────────────

export const projectMember = pgTable(
	'project_member',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: projectRoleEnum('role').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('project_member_unique').on(table.projectId, table.userId),
		index('project_member_project_idx').on(table.projectId)
	]
);

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
	project: one(project, {
		fields: [projectMember.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [projectMember.userId],
		references: [user.id]
	})
}));

// ── TestCaseGroup ─────────────────────────────────────

export const testCaseGroup = pgTable(
	'test_case_group',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		color: text('color'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_case_group_project_name_unique').on(table.projectId, table.name),
		index('test_case_group_project_idx').on(table.projectId)
	]
);

export const testCaseGroupRelations = relations(testCaseGroup, ({ one, many }) => ({
	project: one(project, {
		fields: [testCaseGroup.projectId],
		references: [project.id]
	}),
	testCases: many(testCase)
}));

// ── TestCase ───────────────────────────────────────────

export const testCase = pgTable(
	'test_case',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		automationKey: text('automation_key'),
		latestVersionId: integer('latest_version_id'),
		groupId: integer('group_id').references(() => testCaseGroup.id, { onDelete: 'set null' }),
		sortOrder: integer('sort_order').notNull().default(0),
		approvalStatus: text('approval_status').notNull().default('DRAFT'),
		retestNeeded: boolean('retest_needed').default(false).notNull(),
		riskImpact: text('risk_impact'),
		riskLikelihood: text('risk_likelihood'),
		riskLevel: text('risk_level'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('test_case_project_idx').on(table.projectId),
		unique('test_case_key_unique').on(table.projectId, table.key),
		index('test_case_group_sort_idx').on(table.projectId, table.groupId, table.sortOrder),
		index('test_case_automation_key_idx').on(table.projectId, table.automationKey),
		index('test_case_risk_level_idx').on(table.projectId, table.riskLevel)
	]
);

export const testCaseRelations = relations(testCase, ({ one, many }) => ({
	project: one(project, {
		fields: [testCase.projectId],
		references: [project.id]
	}),
	group: one(testCaseGroup, {
		fields: [testCase.groupId],
		references: [testCaseGroup.id]
	}),
	versions: many(testCaseVersion),
	latestVersion: one(testCaseVersion, {
		fields: [testCase.latestVersionId],
		references: [testCaseVersion.id],
		relationName: 'latestVersion'
	}),
	tags: many(testCaseTag),
	assignees: many(testCaseAssignee),
	parameters: many(testCaseParameter),
	dataSets: many(testCaseDataSet),
	approvalHistory: many(approvalHistory)
}));

// ── ApprovalHistory ───────────────────────────────────

export const approvalHistory = pgTable(
	'approval_history',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		fromStatus: text('from_status').notNull(),
		toStatus: text('to_status').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		comment: text('comment'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('approval_history_test_case_idx').on(table.testCaseId),
		index('approval_history_created_idx').on(table.testCaseId, table.createdAt)
	]
);

export const approvalHistoryRelations = relations(approvalHistory, ({ one }) => ({
	testCase: one(testCase, {
		fields: [approvalHistory.testCaseId],
		references: [testCase.id]
	}),
	user: one(user, {
		fields: [approvalHistory.userId],
		references: [user.id]
	})
}));

// ── TestCaseVersion ────────────────────────────────────
// Note: test_case_version table has a generated tsvector column `search_vector`
// created via migration (0002_search_indexes.sql). It is not declared here
// because Drizzle does not support generated columns natively.
// Used for full-text search: search_vector @@ to_tsquery('english', ...)

export type TestStep = {
	order: number;
	action: string;
	expected: string;
};

export type GherkinKeyword = 'Given' | 'When' | 'Then' | 'And' | 'But';

export type GherkinStep = {
	keyword: GherkinKeyword;
	text: string;
	expected: string;
};

export type StepFormat = 'STEPS' | 'GHERKIN';

export const testCaseVersion = pgTable(
	'test_case_version',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		versionNo: integer('version_no').notNull(),
		title: text('title').notNull(),
		precondition: text('precondition'),
		steps: jsonb('steps').$type<TestStep[]>().default([]).notNull(),
		stepFormat: text('step_format').$type<StepFormat>().default('STEPS').notNull(),
		expectedResult: text('expected_result'),
		priority: text('priority').default('MEDIUM').notNull(),
		customFields: jsonb('custom_fields').$type<Record<string, unknown>>(),
		revision: integer('revision').default(1).notNull(),
		updatedBy: text('updated_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('test_case_version_case_idx').on(table.testCaseId, table.versionNo),
		unique('test_case_version_unique').on(table.testCaseId, table.versionNo)
	]
);

export const testCaseVersionRelations = relations(testCaseVersion, ({ one, many }) => ({
	testCase: one(testCase, {
		fields: [testCaseVersion.testCaseId],
		references: [testCase.id]
	}),
	executions: many(testExecution)
}));

// ── TestRun ────────────────────────────────────────────

export const testRun = pgTable(
	'test_run',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		environment: text('environment').notNull(),
		status: runStatusEnum('status').default('CREATED').notNull(),
		startedAt: timestamp('started_at'),
		finishedAt: timestamp('finished_at'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		testPlanId: integer('test_plan_id').references(() => testPlan.id, { onDelete: 'set null' }),
		releaseId: integer('release_id').references(() => release.id, { onDelete: 'set null' }),
		testCycleId: integer('test_cycle_id').references(() => testCycle.id, { onDelete: 'set null' }),
		retestOfRunId: integer('retest_of_run_id')
	},
	(table) => [
		index('test_run_project_idx').on(table.projectId),
		index('test_run_project_created_idx').on(table.projectId, table.createdAt),
		index('test_run_project_status_idx').on(table.projectId, table.status)
	]
);

export const testRunRelations = relations(testRun, ({ one, many }) => ({
	project: one(project, {
		fields: [testRun.projectId],
		references: [project.id]
	}),
	testPlan: one(testPlan, {
		fields: [testRun.testPlanId],
		references: [testPlan.id]
	}),
	release: one(release, {
		fields: [testRun.releaseId],
		references: [release.id]
	}),
	testCycle: one(testCycle, {
		fields: [testRun.testCycleId],
		references: [testCycle.id]
	}),
	executions: many(testExecution)
}));

// ── TestExecution ──────────────────────────────────────

export const testExecution = pgTable(
	'test_execution',
	{
		id: serial('id').primaryKey(),
		testRunId: integer('test_run_id')
			.notNull()
			.references(() => testRun.id, { onDelete: 'cascade' }),
		testCaseVersionId: integer('test_case_version_id')
			.notNull()
			.references(() => testCaseVersion.id),
		status: executionStatusEnum('status').default('PENDING').notNull(),
		comment: text('comment'),
		dataSetId: integer('data_set_id').references(() => testCaseDataSet.id, { onDelete: 'set null' }),
		parameterValues: jsonb('parameter_values').$type<Record<string, string>>(),
		executedBy: text('executed_by').references(() => user.id),
		executedAt: timestamp('executed_at'),
		startedAt: timestamp('started_at'),
		completedAt: timestamp('completed_at')
	},
	(table) => [
		index('test_execution_run_status_idx').on(table.testRunId, table.status),
		index('test_execution_case_version_idx').on(table.testCaseVersionId),
		index('test_execution_executed_by_idx').on(table.executedBy),
		index('test_execution_executed_at_idx').on(table.executedAt),
		index('test_execution_version_id_desc_idx').on(table.testCaseVersionId, table.id)
	]
);

export const testExecutionRelations = relations(testExecution, ({ one, many }) => ({
	testRun: one(testRun, {
		fields: [testExecution.testRunId],
		references: [testRun.id]
	}),
	testCaseVersion: one(testCaseVersion, {
		fields: [testExecution.testCaseVersionId],
		references: [testCaseVersion.id]
	}),
	failureDetails: many(testFailureDetail)
}));

// ── TestFailureDetail ──────────────────────────────────

export const testFailureDetail = pgTable(
	'test_failure_detail',
	{
		id: serial('id').primaryKey(),
		testExecutionId: integer('test_execution_id')
			.notNull()
			.references(() => testExecution.id, { onDelete: 'cascade' }),
		failureEnvironment: text('failure_environment'),
		testMethod: text('test_method'),
		errorMessage: text('error_message'),
		stackTrace: text('stack_trace'),
		comment: text('comment'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('test_failure_detail_execution_idx').on(table.testExecutionId)]
);

export const testFailureDetailRelations = relations(testFailureDetail, ({ one }) => ({
	testExecution: one(testExecution, {
		fields: [testFailureDetail.testExecutionId],
		references: [testExecution.id]
	})
}));

// ── Attachment ─────────────────────────────────────────

export const attachment = pgTable(
	'attachment',
	{
		id: serial('id').primaryKey(),
		referenceType: referenceTypeEnum('reference_type').notNull(),
		referenceId: integer('reference_id').notNull(),
		fileName: text('file_name').notNull(),
		contentType: text('content_type'),
		objectKey: text('object_key').notNull(),
		fileSize: integer('file_size'),
		uploadedBy: text('uploaded_by')
			.notNull()
			.references(() => user.id),
		uploadedAt: timestamp('uploaded_at').defaultNow().notNull()
	},
	(table) => [index('attachment_ref_idx').on(table.referenceType, table.referenceId)]
);

export const attachmentRelations = relations(attachment, ({ one }) => ({
	uploader: one(user, {
		fields: [attachment.uploadedBy],
		references: [user.id]
	})
}));

// ── Tag ───────────────────────────────────────────────

export const tag = pgTable(
	'tag',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('tag_project_name_unique').on(table.projectId, table.name),
		index('tag_project_idx').on(table.projectId)
	]
);

export const tagRelations = relations(tag, ({ one, many }) => ({
	project: one(project, {
		fields: [tag.projectId],
		references: [project.id]
	}),
	testCaseTags: many(testCaseTag)
}));

// ── TestCaseTag (join) ────────────────────────────────

export const testCaseTag = pgTable(
	'test_case_tag',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' }),
		assignedAt: timestamp('assigned_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_case_tag_unique').on(table.testCaseId, table.tagId),
		index('test_case_tag_case_idx').on(table.testCaseId),
		index('test_case_tag_tag_idx').on(table.tagId)
	]
);

export const testCaseTagRelations = relations(testCaseTag, ({ one }) => ({
	testCase: one(testCase, {
		fields: [testCaseTag.testCaseId],
		references: [testCase.id]
	}),
	tag: one(tag, {
		fields: [testCaseTag.tagId],
		references: [tag.id]
	})
}));

// ── PriorityConfig ────────────────────────────────────

export const priorityConfig = pgTable(
	'priority_config',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull(),
		position: integer('position').notNull().default(0),
		isDefault: boolean('is_default').notNull().default(false),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('priority_config_project_name_unique').on(table.projectId, table.name),
		index('priority_config_project_idx').on(table.projectId)
	]
);

export const priorityConfigRelations = relations(priorityConfig, ({ one }) => ({
	project: one(project, {
		fields: [priorityConfig.projectId],
		references: [project.id]
	})
}));

// ── EnvironmentConfig ─────────────────────────────────

export const environmentConfig = pgTable(
	'environment_config',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull(),
		position: integer('position').notNull().default(0),
		isDefault: boolean('is_default').notNull().default(false),
		baseUrl: text('base_url'),
		credentials: text('credentials'),
		memo: text('memo'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('environment_config_project_name_unique').on(table.projectId, table.name),
		index('environment_config_project_idx').on(table.projectId)
	]
);

export const environmentConfigRelations = relations(environmentConfig, ({ one }) => ({
	project: one(project, {
		fields: [environmentConfig.projectId],
		references: [project.id]
	})
}));

// ── TestCaseAssignee (join) ───────────────────────────

export const testCaseAssignee = pgTable(
	'test_case_assignee',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		assignedAt: timestamp('assigned_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_case_assignee_unique').on(table.testCaseId, table.userId),
		index('test_case_assignee_case_idx').on(table.testCaseId),
		index('test_case_assignee_user_idx').on(table.userId)
	]
);

export const testCaseAssigneeRelations = relations(testCaseAssignee, ({ one }) => ({
	testCase: one(testCase, {
		fields: [testCaseAssignee.testCaseId],
		references: [testCase.id]
	}),
	user: one(user, {
		fields: [testCaseAssignee.userId],
		references: [user.id]
	})
}));

// ── OIDC Provider ─────────────────────────────────────

export const oidcProvider = pgTable(
	'oidc_provider',
	{
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull().unique(),
		providerType: text('provider_type').notNull().default('OIDC'),
		clientId: text('client_id').notNull(),
		clientSecretEncrypted: text('client_secret_encrypted').notNull(),
		issuerUrl: text('issuer_url'),
		jwksUri: text('jwks_uri'),
		authorizationUrl: text('authorization_url').notNull(),
		tokenUrl: text('token_url').notNull(),
		userinfoUrl: text('userinfo_url'),
		scopes: text('scopes').notNull().default('openid profile email'),
		enabled: boolean('enabled').notNull().default(true),
		autoRegister: boolean('auto_register').notNull().default(true),
		iconUrl: text('icon_url'),
		displayOrder: integer('display_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('oidc_provider_slug_idx').on(table.slug),
		index('oidc_provider_enabled_idx').on(table.enabled)
	]
);

export const oidcProviderRelations = relations(oidcProvider, ({ many }) => ({
	accounts: many(oidcAccount)
}));

// ── TestSuite ─────────────────────────────────────────

export const testSuite = pgTable(
	'test_suite',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_suite_project_name_unique').on(table.projectId, table.name),
		index('test_suite_project_idx').on(table.projectId)
	]
);

export const testSuiteRelations = relations(testSuite, ({ one, many }) => ({
	project: one(project, {
		fields: [testSuite.projectId],
		references: [project.id]
	}),
	items: many(testSuiteItem)
}));

// ── TestSuiteItem ─────────────────────────────────────

export const testSuiteItem = pgTable(
	'test_suite_item',
	{
		id: serial('id').primaryKey(),
		suiteId: integer('suite_id')
			.notNull()
			.references(() => testSuite.id, { onDelete: 'cascade' }),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_suite_item_unique').on(table.suiteId, table.testCaseId),
		index('test_suite_item_suite_idx').on(table.suiteId)
	]
);

export const testSuiteItemRelations = relations(testSuiteItem, ({ one }) => ({
	suite: one(testSuite, {
		fields: [testSuiteItem.suiteId],
		references: [testSuite.id]
	}),
	testCase: one(testCase, {
		fields: [testSuiteItem.testCaseId],
		references: [testCase.id]
	})
}));

// ── UserPreference ────────────────────────────────────

export const userPreference = pgTable('user_preference', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	locale: text('locale'),
	theme: text('theme'),
	notificationSettings: jsonb('notification_settings').$type<{
		enableInApp?: boolean;
		mutedTypes?: string[];
	}>(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const userPreferenceRelations = relations(userPreference, ({ one }) => ({
	user: one(user, {
		fields: [userPreference.userId],
		references: [user.id]
	})
}));

// ── OIDC Account ──────────────────────────────────────

export const oidcAccount = pgTable(
	'oidc_account',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		providerId: integer('provider_id')
			.notNull()
			.references(() => oidcProvider.id, { onDelete: 'cascade' }),
		externalId: text('external_id').notNull(),
		email: text('email'),
		name: text('name'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		unique('oidc_account_provider_external_unique').on(table.providerId, table.externalId),
		index('oidc_account_user_idx').on(table.userId),
		index('oidc_account_provider_idx').on(table.providerId)
	]
);

export const oidcAccountRelations = relations(oidcAccount, ({ one }) => ({
	user: one(user, {
		fields: [oidcAccount.userId],
		references: [user.id]
	}),
	provider: one(oidcProvider, {
		fields: [oidcAccount.providerId],
		references: [oidcProvider.id]
	})
}));

// ── TestCaseTemplate ──────────────────────────────────

export const testCaseTemplate = pgTable(
	'test_case_template',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		precondition: text('precondition'),
		steps: jsonb('steps').$type<TestStep[]>().default([]).notNull(),
		priority: text('priority').default('MEDIUM').notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('test_case_template_project_idx').on(table.projectId)
	]
);

export const testCaseTemplateRelations = relations(testCaseTemplate, ({ one }) => ({
	project: one(project, {
		fields: [testCaseTemplate.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [testCaseTemplate.createdBy],
		references: [user.id]
	})
}));

// ── AuditLog ──────────────────────────────────────────

export const auditLog = pgTable(
	'audit_log',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		action: text('action').notNull(),
		entityType: text('entity_type'),
		entityId: text('entity_id'),
		projectId: integer('project_id').references(() => project.id, { onDelete: 'set null' }),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(),
		ipAddress: text('ip_address'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('audit_log_user_created_idx').on(table.userId, table.createdAt),
		index('audit_log_project_created_idx').on(table.projectId, table.createdAt)
	]
);

export const auditLogRelations = relations(auditLog, ({ one }) => ({
	user: one(user, {
		fields: [auditLog.userId],
		references: [user.id]
	}),
	project: one(project, {
		fields: [auditLog.projectId],
		references: [project.id]
	})
}));

// ── Notification ───────────────────────────────────────

export const notification = pgTable(
	'notification',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		type: text('type').notNull(),
		title: text('title').notNull(),
		message: text('message').notNull(),
		link: text('link'),
		projectId: integer('project_id').references(() => project.id, { onDelete: 'set null' }),
		isRead: boolean('is_read').default(false).notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('notification_user_read_created_idx').on(table.userId, table.isRead, table.createdAt)
	]
);

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, {
		fields: [notification.userId],
		references: [user.id]
	}),
	project: one(project, {
		fields: [notification.projectId],
		references: [project.id]
	})
}));

// ── DashboardLayout ───────────────────────────────────

export type WidgetSize = 'sm' | 'md' | 'lg';

export interface WidgetConfig {
	id: string;
	visible: boolean;
	order: number;
	size: WidgetSize;
}

export const dashboardLayout = pgTable(
	'dashboard_layout',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		layout: jsonb('layout').$type<WidgetConfig[]>().notNull(),
		updatedAt: timestamp('updated_at').defaultNow()
	},
	(table) => [
		unique('dashboard_layout_user_project_unique').on(table.userId, table.projectId),
		index('dashboard_layout_user_idx').on(table.userId),
		index('dashboard_layout_project_idx').on(table.projectId)
	]
);

export const dashboardLayoutRelations = relations(dashboardLayout, ({ one }) => ({
	user: one(user, {
		fields: [dashboardLayout.userId],
		references: [user.id]
	}),
	project: one(project, {
		fields: [dashboardLayout.projectId],
		references: [project.id]
	})
}));

// ── TestCaseComment ───────────────────────────────────

export const testCaseComment = pgTable(
	'test_case_comment',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		content: text('content').notNull(),
		parentId: integer('parent_id'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('test_case_comment_case_created_idx').on(table.testCaseId, table.createdAt),
		index('test_case_comment_parent_idx').on(table.parentId)
	]
);

export const testCaseCommentRelations = relations(testCaseComment, ({ one, many }) => ({
	testCase: one(testCase, {
		fields: [testCaseComment.testCaseId],
		references: [testCase.id]
	}),
	user: one(user, {
		fields: [testCaseComment.userId],
		references: [user.id]
	}),
	parent: one(testCaseComment, {
		fields: [testCaseComment.parentId],
		references: [testCaseComment.id],
		relationName: 'replies'
	}),
	replies: many(testCaseComment, { relationName: 'replies' })
}));

// ── ProjectApiKey ──────────────────────────────────────

export const projectApiKey = pgTable(
	'project_api_key',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		keyHash: text('key_hash').notNull(),
		prefix: text('prefix').notNull(),
		lastUsedAt: timestamp('last_used_at'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('project_api_key_hash_unique').on(table.keyHash),
		index('project_api_key_project_idx').on(table.projectId),
		index('project_api_key_hash_idx').on(table.keyHash)
	]
);

export const projectApiKeyRelations = relations(projectApiKey, ({ one }) => ({
	project: one(project, {
		fields: [projectApiKey.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [projectApiKey.createdBy],
		references: [user.id]
	})
}));

// ── ProjectWebhook ────────────────────────────────────

export const projectWebhook = pgTable(
	'project_webhook',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		url: text('url').notNull(),
		secret: text('secret'),
		events: jsonb('events').$type<string[]>().notNull().default([]),
		enabled: boolean('enabled').default(true).notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('project_webhook_project_idx').on(table.projectId)
	]
);

export const projectWebhookRelations = relations(projectWebhook, ({ one }) => ({
	project: one(project, {
		fields: [projectWebhook.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [projectWebhook.createdBy],
		references: [user.id]
	})
}));

// ── CustomField ───────────────────────────────────────

export const customField = pgTable(
	'custom_field',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		fieldType: text('field_type').notNull(),
		options: jsonb('options').$type<string[]>(),
		required: boolean('required').notNull().default(false),
		sortOrder: integer('sort_order').notNull().default(0),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('custom_field_project_name_unique').on(table.projectId, table.name),
		index('custom_field_project_idx').on(table.projectId)
	]
);

export const customFieldRelations = relations(customField, ({ one }) => ({
	project: one(project, {
		fields: [customField.projectId],
		references: [project.id]
	})
}));

// ── ExecutionComment ──────────────────────────────────

export const executionComment = pgTable(
	'execution_comment',
	{
		id: serial('id').primaryKey(),
		testExecutionId: integer('test_execution_id')
			.notNull()
			.references(() => testExecution.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		content: text('content').notNull(),
		parentId: integer('parent_id'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('execution_comment_exec_created_idx').on(table.testExecutionId, table.createdAt),
		index('execution_comment_parent_idx').on(table.parentId)
	]
);

export const executionCommentRelations = relations(executionComment, ({ one, many }) => ({
	testExecution: one(testExecution, {
		fields: [executionComment.testExecutionId],
		references: [testExecution.id]
	}),
	user: one(user, {
		fields: [executionComment.userId],
		references: [user.id]
	}),
	parent: one(executionComment, {
		fields: [executionComment.parentId],
		references: [executionComment.id],
		relationName: 'execReplies'
	}),
	replies: many(executionComment, { relationName: 'execReplies' })
}));

// ── IssueTrackerConfig ────────────────────────────────

export const issueTrackerConfig = pgTable(
	'issue_tracker_config',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		baseUrl: text('base_url').notNull(),
		apiToken: text('api_token'),
		projectKey: text('project_key'),
		customTemplate: jsonb('custom_template').$type<Record<string, unknown>>(),
		enabled: boolean('enabled').default(true).notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [unique('issue_tracker_config_project_unique').on(table.projectId)]
);

export const issueTrackerConfigRelations = relations(issueTrackerConfig, ({ one }) => ({
	project: one(project, {
		fields: [issueTrackerConfig.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [issueTrackerConfig.createdBy],
		references: [user.id]
	})
}));

// ── IssueLink ─────────────────────────────────────────

export const issueLink = pgTable(
	'issue_link',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		testCaseId: integer('test_case_id').references(() => testCase.id, { onDelete: 'cascade' }),
		testExecutionId: integer('test_execution_id').references(() => testExecution.id, {
			onDelete: 'cascade'
		}),
		externalUrl: text('external_url').notNull(),
		externalKey: text('external_key'),
		title: text('title'),
		status: text('status'),
		provider: text('provider').notNull(),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		statusSyncedAt: timestamp('status_synced_at')
	},
	(table) => [
		index('issue_link_project_idx').on(table.projectId),
		index('issue_link_test_case_idx').on(table.testCaseId),
		index('issue_link_test_execution_idx').on(table.testExecutionId)
	]
);

export const issueLinkRelations = relations(issueLink, ({ one }) => ({
	project: one(project, {
		fields: [issueLink.projectId],
		references: [project.id]
	}),
	testCase: one(testCase, {
		fields: [issueLink.testCaseId],
		references: [testCase.id]
	}),
	testExecution: one(testExecution, {
		fields: [issueLink.testExecutionId],
		references: [testExecution.id]
	}),
	creator: one(user, {
		fields: [issueLink.createdBy],
		references: [user.id]
	})
}));

// ── Requirement (Traceability) ────────────────────────

export const requirement = pgTable(
	'requirement',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		externalId: text('external_id'),
		title: text('title').notNull(),
		description: text('description'),
		source: text('source'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('requirement_project_idx').on(table.projectId)
	]
);

export const requirementRelations = relations(requirement, ({ one, many }) => ({
	project: one(project, {
		fields: [requirement.projectId],
		references: [project.id]
	}),
	testCases: many(requirementTestCase)
}));

export const requirementTestCase = pgTable(
	'requirement_test_case',
	{
		id: serial('id').primaryKey(),
		requirementId: integer('requirement_id')
			.notNull()
			.references(() => requirement.id, { onDelete: 'cascade' }),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('req_tc_unique').on(table.requirementId, table.testCaseId),
		index('req_tc_requirement_idx').on(table.requirementId),
		index('req_tc_test_case_idx').on(table.testCaseId)
	]
);

export const requirementTestCaseRelations = relations(requirementTestCase, ({ one }) => ({
	requirement: one(requirement, {
		fields: [requirementTestCase.requirementId],
		references: [requirement.id]
	}),
	testCase: one(testCase, {
		fields: [requirementTestCase.testCaseId],
		references: [testCase.id]
	})
}));

// ── SavedFilter ───────────────────────────────────────

export const savedFilter = pgTable(
	'saved_filter',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		filterType: text('filter_type').notNull().default('test_cases'),
		filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('saved_filter_user_project_idx').on(table.userId, table.projectId),
		unique('saved_filter_user_project_name_unique').on(table.userId, table.projectId, table.name)
	]
);

export const savedFilterRelations = relations(savedFilter, ({ one }) => ({
	project: one(project, {
		fields: [savedFilter.projectId],
		references: [project.id]
	}),
	user: one(user, {
		fields: [savedFilter.userId],
		references: [user.id]
	})
}));

// ── SharedReport ──────────────────────────────────────

export const sharedReport = pgTable(
	'shared_report',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique(),
		name: text('name').notNull(),
		config: jsonb('config').$type<{ from?: string; to?: string; preset?: string }>().notNull(),
		expiresAt: timestamp('expires_at'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('shared_report_token_idx').on(table.token),
		index('shared_report_project_idx').on(table.projectId)
	]
);

export const sharedReportRelations = relations(sharedReport, ({ one }) => ({
	project: one(project, {
		fields: [sharedReport.projectId],
		references: [project.id]
	})
}));

// ── TestCaseParameter ─────────────────────────────────

export const testCaseParameter = pgTable(
	'test_case_parameter',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		orderIndex: integer('order_index').notNull().default(0)
	},
	(table) => [
		unique('test_case_parameter_unique').on(table.testCaseId, table.name),
		index('test_case_parameter_case_idx').on(table.testCaseId)
	]
);

export const testCaseParameterRelations = relations(testCaseParameter, ({ one }) => ({
	testCase: one(testCase, {
		fields: [testCaseParameter.testCaseId],
		references: [testCase.id]
	})
}));

// ── TestCaseDataSet ───────────────────────────────────

export const testCaseDataSet = pgTable(
	'test_case_data_set',
	{
		id: serial('id').primaryKey(),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		name: text('name'),
		values: jsonb('values').$type<Record<string, string>>().notNull(),
		orderIndex: integer('order_index').notNull().default(0)
	},
	(table) => [
		index('test_case_data_set_case_idx').on(table.testCaseId)
	]
);

export const testCaseDataSetRelations = relations(testCaseDataSet, ({ one }) => ({
	testCase: one(testCase, {
		fields: [testCaseDataSet.testCaseId],
		references: [testCase.id]
	})
}));

// ── SharedDataSet ─────────────────────────────────────

export const sharedDataSet = pgTable(
	'shared_data_set',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		parameters: jsonb('parameters').$type<string[]>().notNull().default([]),
		rows: jsonb('rows').$type<Record<string, string>[]>().notNull().default([]),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		unique('shared_data_set_project_name_unique').on(table.projectId, table.name),
		index('shared_data_set_project_idx').on(table.projectId)
	]
);

export const sharedDataSetRelations = relations(sharedDataSet, ({ one }) => ({
	project: one(project, {
		fields: [sharedDataSet.projectId],
		references: [project.id]
	})
}));

// ── ReportSchedule ────────────────────────────────────

export const reportSchedule = pgTable(
	'report_schedule',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		cronExpression: text('cron_expression').notNull(),
		recipientEmails: jsonb('recipient_emails').$type<string[]>().notNull(),
		reportRange: text('report_range').notNull().default('last_7_days'),
		enabled: boolean('enabled').default(true).notNull(),
		lastSentAt: timestamp('last_sent_at'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('report_schedule_project_idx').on(table.projectId)
	]
);

export const reportScheduleRelations = relations(reportSchedule, ({ one }) => ({
	project: one(project, {
		fields: [reportSchedule.projectId],
		references: [project.id]
	})
}));

// ── ExploratorySession ────────────────────────────────

export const exploratorySession = pgTable(
	'exploratory_session',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		charter: text('charter'),
		status: text('status').notNull().default('ACTIVE'),
		startedAt: timestamp('started_at').defaultNow().notNull(),
		pausedDuration: integer('paused_duration').notNull().default(0),
		completedAt: timestamp('completed_at'),
		summary: text('summary'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		environment: text('environment'),
		tags: jsonb('tags').$type<string[]>().notNull().default([])
	},
	(table) => [
		index('exploratory_session_project_idx').on(table.projectId),
		index('exploratory_session_status_idx').on(table.projectId, table.status)
	]
);

export const exploratorySessionRelations = relations(exploratorySession, ({ one, many }) => ({
	project: one(project, {
		fields: [exploratorySession.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [exploratorySession.createdBy],
		references: [user.id]
	}),
	notes: many(sessionNote)
}));

// ── SessionNote ───────────────────────────────────────

export const sessionNote = pgTable(
	'session_note',
	{
		id: serial('id').primaryKey(),
		sessionId: integer('session_id')
			.notNull()
			.references(() => exploratorySession.id, { onDelete: 'cascade' }),
		content: text('content').notNull(),
		noteType: text('note_type').notNull().default('NOTE'),
		timestamp: integer('timestamp').notNull(),
		screenshotPath: text('screenshot_path'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('session_note_session_idx').on(table.sessionId)
	]
);

export const sessionNoteRelations = relations(sessionNote, ({ one }) => ({
	session: one(exploratorySession, {
		fields: [sessionNote.sessionId],
		references: [exploratorySession.id]
	})
}));

// ── TestPlan ──────────────────────────────────────────

export const testPlanStatusEnum = pgEnum('test_plan_status', [
	'DRAFT', 'IN_REVIEW', 'APPROVED', 'ACTIVE', 'COMPLETED', 'ARCHIVED'
]);

export const testPlan = pgTable(
	'test_plan',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		status: testPlanStatusEnum('status').default('DRAFT').notNull(),
		milestone: text('milestone'),
		startDate: timestamp('start_date'),
		endDate: timestamp('end_date'),
		releaseId: integer('release_id').references(() => release.id, { onDelete: 'set null' }),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('test_plan_project_idx').on(table.projectId)]
);

export const testPlanRelations = relations(testPlan, ({ one, many }) => ({
	project: one(project, {
		fields: [testPlan.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [testPlan.createdBy],
		references: [user.id]
	}),
	release: one(release, {
		fields: [testPlan.releaseId],
		references: [release.id]
	}),
	items: many(testPlanTestCase),
	runs: many(testRun),
	signoffs: many(testPlanSignoff)
}));

export const testPlanTestCase = pgTable(
	'test_plan_test_case',
	{
		id: serial('id').primaryKey(),
		testPlanId: integer('test_plan_id')
			.notNull()
			.references(() => testPlan.id, { onDelete: 'cascade' }),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		position: integer('position').notNull().default(0),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(table) => [
		unique('test_plan_test_case_unique').on(table.testPlanId, table.testCaseId),
		index('test_plan_test_case_plan_idx').on(table.testPlanId)
	]
);

export const testPlanTestCaseRelations = relations(testPlanTestCase, ({ one }) => ({
	testPlan: one(testPlan, {
		fields: [testPlanTestCase.testPlanId],
		references: [testPlan.id]
	}),
	testCase: one(testCase, {
		fields: [testPlanTestCase.testCaseId],
		references: [testCase.id]
	})
}));

// ── Release ───────────────────────────────────────────

export const release = pgTable(
	'release',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		version: text('version'),
		description: text('description'),
		status: releaseStatusEnum('status').default('PLANNING').notNull(),
		targetDate: timestamp('target_date'),
		releaseDate: timestamp('release_date'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [index('release_project_idx').on(table.projectId)]
);

export const releaseRelations = relations(release, ({ one, many }) => ({
	project: one(project, {
		fields: [release.projectId],
		references: [project.id]
	}),
	creator: one(user, {
		fields: [release.createdBy],
		references: [user.id]
	}),
	testPlans: many(testPlan),
	testRuns: many(testRun)
}));

// ── TestPlanSignoff ──────────────────────────────────

export const testPlanSignoff = pgTable(
	'test_plan_signoff',
	{
		id: serial('id').primaryKey(),
		testPlanId: integer('test_plan_id')
			.notNull()
			.references(() => testPlan.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		decision: signoffDecisionEnum('decision').notNull(),
		comment: text('comment'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('test_plan_signoff_plan_idx').on(table.testPlanId)]
);

export const testPlanSignoffRelations = relations(testPlanSignoff, ({ one }) => ({
	testPlan: one(testPlan, {
		fields: [testPlanSignoff.testPlanId],
		references: [testPlan.id]
	}),
	user: one(user, {
		fields: [testPlanSignoff.userId],
		references: [user.id]
	})
}));

// ── TestCycle ─────────────────────────────────────────

export const testCycle = pgTable(
	'test_cycle',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		releaseId: integer('release_id').references(() => release.id, { onDelete: 'set null' }),
		name: text('name').notNull(),
		cycleNumber: integer('cycle_number').notNull(),
		status: text('status').notNull().default('PLANNED'),
		startDate: timestamp('start_date'),
		endDate: timestamp('end_date'),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [
		index('test_cycle_project_idx').on(table.projectId),
		unique('test_cycle_project_number_unique').on(table.projectId, table.cycleNumber)
	]
);

export const testCycleRelations = relations(testCycle, ({ one, many }) => ({
	project: one(project, {
		fields: [testCycle.projectId],
		references: [project.id]
	}),
	release: one(release, {
		fields: [testCycle.releaseId],
		references: [release.id]
	}),
	creator: one(user, {
		fields: [testCycle.createdBy],
		references: [user.id]
	}),
	runs: many(testRun)
}));

// ── Module ────────────────────────────────────────────

export const module = pgTable(
	'module',
	{
		id: serial('id').primaryKey(),
		projectId: integer('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		parentModuleId: integer('parent_module_id'),
		description: text('description'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [index('module_project_idx').on(table.projectId)]
);

export const moduleRelations = relations(module, ({ one, many }) => ({
	project: one(project, {
		fields: [module.projectId],
		references: [project.id]
	}),
	parent: one(module, {
		fields: [module.parentModuleId],
		references: [module.id],
		relationName: 'parentChild'
	}),
	children: many(module, { relationName: 'parentChild' }),
	testCases: many(moduleTestCase)
}));

export const moduleTestCase = pgTable(
	'module_test_case',
	{
		id: serial('id').primaryKey(),
		moduleId: integer('module_id')
			.notNull()
			.references(() => module.id, { onDelete: 'cascade' }),
		testCaseId: integer('test_case_id')
			.notNull()
			.references(() => testCase.id, { onDelete: 'cascade' }),
		addedAt: timestamp('added_at').defaultNow().notNull()
	},
	(table) => [
		unique('module_test_case_unique').on(table.moduleId, table.testCaseId),
		index('module_test_case_module_idx').on(table.moduleId),
		index('module_test_case_tc_idx').on(table.testCaseId)
	]
);

export const moduleTestCaseRelations = relations(moduleTestCase, ({ one }) => ({
	module: one(module, {
		fields: [moduleTestCase.moduleId],
		references: [module.id]
	}),
	testCase: one(testCase, {
		fields: [moduleTestCase.testCaseId],
		references: [testCase.id]
	})
}));

// ── Team ──────────────────────────────────────────────

export const teamRoleEnum = pgEnum('team_role', ['OWNER', 'ADMIN', 'MEMBER']);

export const team = pgTable('team', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const teamRelations = relations(team, ({ one, many }) => ({
	creator: one(user, {
		fields: [team.createdBy],
		references: [user.id]
	}),
	members: many(teamMember),
	projects: many(project)
}));

export const teamMember = pgTable(
	'team_member',
	{
		id: serial('id').primaryKey(),
		teamId: integer('team_id')
			.notNull()
			.references(() => team.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: teamRoleEnum('role').notNull(),
		joinedAt: timestamp('joined_at').defaultNow().notNull()
	},
	(table) => [
		unique('team_member_unique').on(table.teamId, table.userId),
		index('team_member_team_idx').on(table.teamId)
	]
);

export const teamMemberRelations = relations(teamMember, ({ one }) => ({
	team: one(team, {
		fields: [teamMember.teamId],
		references: [team.id]
	}),
	user: one(user, {
		fields: [teamMember.userId],
		references: [user.id]
	})
}));
