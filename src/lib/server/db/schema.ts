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

// ── Project ────────────────────────────────────────────

export const project = pgTable('project', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	active: boolean('active').default(true).notNull(),
	createdBy: text('created_by')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const projectRelations = relations(project, ({ many }) => ({
	members: many(projectMember),
	testCases: many(testCase),
	testRuns: many(testRun),
	tags: many(tag),
	groups: many(testCaseGroup)
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
		index('test_case_group_sort_idx').on(table.projectId, table.groupId, table.sortOrder)
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
		priority: priorityEnum('priority').default('MEDIUM').notNull(),
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
		createdAt: timestamp('created_at').defaultNow().notNull()
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
	(table) => [index('test_execution_run_status_idx').on(table.testRunId, table.status)]
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

export const testFailureDetail = pgTable('test_failure_detail', {
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
});

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
