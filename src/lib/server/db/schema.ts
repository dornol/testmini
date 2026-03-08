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
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const projectRelations = relations(project, ({ many }) => ({
	members: many(projectMember),
	testCases: many(testCase),
	testRuns: many(testRun),
	tags: many(tag),
	groups: many(testCaseGroup),
	apiKeys: many(projectApiKey),
	priorities: many(priorityConfig)
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
		createdBy: text('created_by')
			.notNull()
			.references(() => user.id),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('test_case_project_idx').on(table.projectId),
		unique('test_case_key_unique').on(table.projectId, table.key),
		index('test_case_group_sort_idx').on(table.projectId, table.groupId, table.sortOrder),
		index('test_case_automation_key_idx').on(table.projectId, table.automationKey)
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
	assignees: many(testCaseAssignee)
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
		expectedResult: text('expected_result'),
		priority: text('priority').default('MEDIUM').notNull(),
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
		environment: environmentEnum('environment').notNull(),
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
			.notNull()
	},
	(table) => [index('test_run_project_idx').on(table.projectId)]
);

export const testRunRelations = relations(testRun, ({ one, many }) => ({
	project: one(project, {
		fields: [testRun.projectId],
		references: [project.id]
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
		executedBy: text('executed_by').references(() => user.id),
		executedAt: timestamp('executed_at')
	},
	(table) => [
		index('test_execution_run_status_idx').on(table.testRunId, table.status),
		index('test_execution_case_version_idx').on(table.testCaseVersionId),
		index('test_execution_executed_by_idx').on(table.executedBy),
		index('test_execution_executed_at_idx').on(table.executedAt)
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
